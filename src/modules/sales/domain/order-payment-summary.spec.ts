import { OrderPaymentSnapshot, summarizeOrderPayments } from './order-payment-summary';

describe('Synthèse des deux tranches de règlement', () => {
  const initial: OrderPaymentSnapshot = {
    orderId: 'order', orderStatus: 'CONFIRMED', paymentStatus: 'UNPAID',
    total: '100.01', amountPaid: '0.00', payments: [],
  };
  const payment = (amount: string, installmentNumber = 1) => ({
    id: String(installmentNumber), installmentNumber, amount, method: 'CASH',
    receivedAt: new Date('2026-01-01'), reversals: [],
  });

  it('affiche le solde intégral avant tout paiement', () => {
    expect(summarizeOrderPayments(initial)).toMatchObject({
      remaining: '100.01', activeInstallments: 0, consistent: true, canRecord: true, nextPaymentMustSettle: false,
    });
  });

  it('impose le règlement du solde lors de la seconde tranche', () => {
    expect(summarizeOrderPayments({
      ...initial, paymentStatus: 'PARTIALLY_PAID', amountPaid: '40.00', payments: [payment('40.00')],
    })).toMatchObject({ remaining: '60.01', activeInstallments: 1, nextPaymentMustSettle: true });
  });

  it('affiche une commande soldée après deux tranches', () => {
    expect(summarizeOrderPayments({
      ...initial, paymentStatus: 'PAID', amountPaid: '100.01',
      payments: [payment('40.00'), payment('60.01', 2)],
    })).toMatchObject({ remaining: '0.00', consistent: true, canRecord: false });
  });

  it('exclut un encaissement intégralement contrepassé', () => {
    const result = summarizeOrderPayments({
      ...initial, payments: [{ ...payment('40.00'), reversals: [{ amount: '40.00', createdAt: new Date() }] }],
    });
    expect(result).toMatchObject({ activeInstallments: 0, paid: '0.00', consistent: true });
    expect(result.payments[0].status).toBe('REVERSED');
  });

  it('signale un montant encaissé incohérent', () => {
    expect(summarizeOrderPayments({ ...initial, amountPaid: '1.00' })).toMatchObject({
      consistent: false, canRecord: false,
    });
  });

  it('interdit une nouvelle saisie sur un brouillon', () => {
    expect(summarizeOrderPayments({ ...initial, orderStatus: 'DRAFT' }).canRecord).toBe(false);
  });

  it('signale deux tranches ne soldant pas la commande', () => {
    expect(summarizeOrderPayments({
      ...initial, paymentStatus: 'PARTIALLY_PAID', amountPaid: '80.00',
      payments: [payment('40.00'), payment('40.00', 2)],
    })).toMatchObject({ consistent: false, canRecord: false });
  });
});
