import { isRecord } from '../../../core/api/api-contract';
import { storeId } from '../../stores/domain/store.contract';
import { orderStatusLabels } from './order-view.contract';

export const paymentMethods = {
  CASH: 'Espèces',
  BANK_TRANSFER: 'Virement bancaire',
  CHEQUE: 'Chèque',
  MOBILE_MONEY: 'Mobile Money',
  OTHER: 'Autre',
} as const;
export type PaymentMethod = keyof typeof paymentMethods;

function invalid(): never {
  throw new Error('Données de règlement incohérentes.');
}
const record = (value: unknown) => (isRecord(value) ? value : invalid());
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : invalid());
function date(value: unknown): string {
  const result = text(value);
  return Number.isFinite(Date.parse(result)) ? result : invalid();
}
function amount(value: unknown): string {
  const result = text(value);
  return /^\d{1,16}(?:\.\d{1,2})?$/.test(result) ? result : invalid();
}
export function paymentCents(value: string): bigint {
  const [whole = '0', fraction = ''] = amount(value).split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
function flag(value: unknown): boolean {
  return typeof value === 'boolean' ? value : invalid();
}
function method(value: unknown): PaymentMethod {
  return (Object.keys(paymentMethods) as PaymentMethod[]).find((key) => key === value) ?? invalid();
}
export function parsePaymentSummary(value: unknown, orderId: string) {
  const row = record(value);
  if (
    row['orderId'] !== orderId ||
    row['currency'] !== 'XOF' ||
    row['basis'] !== 'SALES_ORDER_NET_OF_INVOICE_CREDITS' ||
    row['maxInstallments'] !== 2 ||
    !Array.isArray(row['payments'])
  )
    return invalid();
  const orderStatus = Object.keys(orderStatusLabels).find((key) => key === row['orderStatus']);
  const statuses = ['UNPAID', 'PARTIALLY_PAID', 'PAID'];
  if (
    !orderStatus ||
    !statuses.some((status) => status === row['paymentStatus']) ||
    !statuses.some((status) => status === row['netPaymentStatus'])
  )
    return invalid();
  const total = amount(row['total']);
  const credited = amount(row['credited']);
  const netTotal = amount(row['netTotal']);
  const paid = amount(row['paid']);
  const remaining = amount(row['remaining']);
  const payments = row['payments'].map((raw: unknown) => {
    const payment = record(raw);
    const installmentNumber = payment['installmentNumber'];
    const status = payment['status'];
    const gross = amount(payment['amount']);
    const reversedAmount = amount(payment['reversedAmount']);
    const reversedAt = payment['reversedAt'] === null ? null : date(payment['reversedAt']);
    if (
      typeof installmentNumber !== 'number' ||
      !Number.isSafeInteger(installmentNumber) ||
      installmentNumber < 1 ||
      (status !== 'ACTIVE' && status !== 'REVERSED') ||
      paymentCents(gross) <= 0n ||
      (status === 'ACTIVE'
        ? reversedAt !== null || paymentCents(reversedAmount) !== 0n
        : reversedAt === null || paymentCents(reversedAmount) !== paymentCents(gross))
    )
      return invalid();
    return {
      id: storeId(payment['id']),
      installmentNumber,
      status,
      amount: gross,
      method: method(payment['method']),
      receivedAt: date(payment['receivedAt']),
      reversedAt,
      reversedAmount,
    };
  });
  const active = payments.filter((item) => item.status === 'ACTIVE');
  const activeInstallments = active.length;
  const consistent = flag(row['consistent']);
  const canRecord = flag(row['canRecord']);
  const nextPaymentMustSettle = flag(row['nextPaymentMustSettle']);
  if (
    !consistent ||
    activeInstallments !== row['activeInstallments'] ||
    activeInstallments > 2 ||
    new Set(payments.map((item) => item.id)).size !== payments.length ||
    new Set(payments.map((item) => item.installmentNumber)).size !== payments.length ||
    paymentCents(total) - paymentCents(credited) !== paymentCents(netTotal) ||
    paymentCents(netTotal) - paymentCents(paid) !== paymentCents(remaining) ||
    active.reduce((sum, item) => sum + paymentCents(item.amount), 0n) !== paymentCents(paid) ||
    (activeInstallments === 2 && paymentCents(remaining) !== 0n) ||
    canRecord !==
      (['CONFIRMED', 'PARTIALLY_DELIVERED', 'DELIVERED'].includes(orderStatus) &&
        paymentCents(remaining) > 0n &&
        activeInstallments < 2) ||
    nextPaymentMustSettle !== (canRecord && activeInstallments === 1)
  )
    return invalid();
  return {
    orderId,
    total,
    credited,
    netTotal,
    paid,
    remaining,
    activeInstallments,
    canRecord,
    nextPaymentMustSettle,
    payments,
  };
}
export type PaymentSummary = ReturnType<typeof parsePaymentSummary>;
export type Payment = PaymentSummary['payments'][number];
export interface PaymentInput {
  amount: string;
  method: PaymentMethod;
  idempotencyKey: string;
  externalReference?: string;
}
export function parsePaymentInput(value: unknown): PaymentInput {
  const row = record(value);
  const gross = amount(row['amount']);
  const key = storeId(row['idempotencyKey']);
  const reference = row['externalReference'];
  if (
    paymentCents(gross) <= 0n ||
    (reference !== undefined &&
      (typeof reference !== 'string' ||
        !reference.trim() ||
        reference !== reference.trim() ||
        reference.length > 200))
  )
    return invalid();
  return {
    amount: gross,
    method: method(row['method']),
    idempotencyKey: key,
    ...(reference === undefined ? {} : { externalReference: reference }),
  };
}
export function paymentInput(
  summary: PaymentSummary,
  value: string,
  mode: string,
  key: string,
  reference: string,
): PaymentInput {
  const input = parsePaymentInput({
    amount: value.trim().replace(',', '.'),
    method: mode,
    idempotencyKey: key,
    ...(reference.trim() ? { externalReference: reference.trim() } : {}),
  });
  const cents = paymentCents(input.amount);
  const remaining = paymentCents(summary.remaining);
  if (!summary.canRecord || cents > remaining || (summary.nextPaymentMustSettle && cents !== remaining))
    throw new Error('Montant incompatible avec le solde ou le nombre de tranches autorisées.');
  return input;
}
export function verifyRecordedPayment(value: unknown, orderId: string, input: PaymentInput): string {
  const row = record(value);
  if (
    row['orderId'] !== orderId ||
    row['idempotencyKey'] !== input.idempotencyKey ||
    row['method'] !== input.method ||
    row['externalReference'] !== (input.externalReference ?? null) ||
    paymentCents(amount(row['amount'])) !== paymentCents(input.amount)
  )
    return invalid();
  return storeId(row['id']);
}
export function paymentStorageKey(actor: string, orderId: string): string {
  return 'dsolar.payment.pending.v1:' + storeId(actor) + ':' + storeId(orderId);
}
export function canReverse(summary: PaymentSummary, item: Payment): boolean {
  return (
    item.status === 'ACTIVE' &&
    !summary.payments.some(
      (other) => other.status === 'ACTIVE' && other.installmentNumber > item.installmentNumber,
    )
  );
}
