export interface OrderPaymentSnapshot {
  orderId: string;
  orderStatus: string;
  paymentStatus: string;
  total: string;
  amountPaid: string;
  payments: {
    id: string;
    installmentNumber: number;
    amount: string;
    method: string;
    receivedAt: Date;
    reversals: { amount: string; createdAt: Date }[];
  }[];
}

function cents(value: string): bigint {
  if (!/^\d+\.\d{2}$/.test(value)) throw new Error('Montant de règlement invalide.');
  const [whole, fraction] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction);
}

function money(value: bigint): string {
  const absolute = value < 0n ? -value : value;
  return (value < 0n ? '-' : '') + absolute / 100n + '.' + String(absolute % 100n).padStart(2, '0');
}

export function summarizeOrderPayments(snapshot: OrderPaymentSnapshot) {
  const total = cents(snapshot.total);
  const declared = cents(snapshot.amountPaid);
  let paid = 0n;
  let activeInstallments = 0;
  let valid = true;
  const payments = snapshot.payments.map((payment) => {
    const amount = cents(payment.amount);
    const reversed = payment.reversals.reduce((sum, reversal) => sum + cents(reversal.amount), 0n);
    if (
      amount <= 0n ||
      (payment.reversals.length > 0 && (payment.reversals.length !== 1 || reversed !== amount))
    )
      valid = false;
    const active = payment.reversals.length === 0;
    if (active) activeInstallments++;
    paid += amount - reversed;
    return {
      id: payment.id,
      installmentNumber: payment.installmentNumber,
      amount: payment.amount,
      method: payment.method,
      receivedAt: payment.receivedAt,
      status: active ? 'ACTIVE' : 'REVERSED',
      reversedAmount: money(reversed),
      reversedAt: payment.reversals[0]?.createdAt ?? null,
    };
  });
  const remaining = total - paid;
  const expectedStatus = paid === 0n ? 'UNPAID' : paid === total ? 'PAID' : 'PARTIALLY_PAID';
  const consistent =
    valid &&
    paid === declared &&
    paid >= 0n &&
    remaining >= 0n &&
    activeInstallments <= 2 &&
    (activeInstallments !== 2 || remaining === 0n) &&
    snapshot.paymentStatus === expectedStatus;
  const canRecord =
    consistent &&
    ['CONFIRMED', 'PARTIALLY_DELIVERED', 'DELIVERED'].includes(snapshot.orderStatus) &&
    remaining > 0n &&
    activeInstallments < 2;
  return {
    orderId: snapshot.orderId,
    currency: 'XOF',
    basis: 'SALES_ORDER_BEFORE_INVOICE_CREDITS',
    orderStatus: snapshot.orderStatus,
    paymentStatus: snapshot.paymentStatus,
    total: money(total),
    paid: money(paid),
    remaining: money(remaining),
    activeInstallments,
    maxInstallments: 2,
    consistent,
    canRecord,
    nextPaymentMustSettle: canRecord && activeInstallments === 1,
    payments,
  };
}
