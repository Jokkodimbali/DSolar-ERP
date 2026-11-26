import { describe, expect, it } from 'vitest';
import { parsePaymentSummary, paymentInput, verifyRecordedPayment } from './payment.contract';
const id = 'c31ac59c-8148-4664-8745-496a9618f202';
const row = {
  orderId: id,
  currency: 'XOF',
  basis: 'SALES_ORDER_NET_OF_INVOICE_CREDITS',
  orderStatus: 'CONFIRMED',
  paymentStatus: 'PARTIALLY_PAID',
  netPaymentStatus: 'PARTIALLY_PAID',
  total: '2360.00',
  credited: '100.00',
  netTotal: '2260.00',
  paid: '1000.00',
  remaining: '1260.00',
  activeInstallments: 1,
  maxInstallments: 2,
  consistent: true,
  canRecord: true,
  nextPaymentMustSettle: true,
  payments: [
    {
      id,
      installmentNumber: 1,
      amount: '1000.00',
      method: 'CASH',
      receivedAt: '2026-11-26T12:00:00Z',
      status: 'ACTIVE',
      reversedAmount: '0.00',
      reversedAt: null,
    },
  ],
};
describe('Règlements de commande', () => {
  it('contrôle le solde net et la deuxième tranche exacte', () => {
    const summary = parsePaymentSummary(row, id);
    expect(paymentInput(summary, '1260,00', 'CASH', id, '').amount).toBe('1260.00');
    expect(() => paymentInput(summary, '1259.99', 'CASH', id, '')).toThrow();
    expect(() => parsePaymentSummary({ ...row, remaining: '1260.01' }, id)).toThrow();
    expect(() => parsePaymentSummary({ ...row, consistent: false }, id)).toThrow();
  });
  it('vérifie la réponse correspondant à la demande idempotente', () => {
    const input = paymentInput(parsePaymentSummary(row, id), '1260', 'CASH', id, '');
    const payment = { ...input, id, orderId: id, externalReference: null };
    expect(verifyRecordedPayment(payment, id, input)).toBe(id);
    expect(() => verifyRecordedPayment({ ...payment, amount: '1260.01' }, id, input)).toThrow();
  });
});
