import { describe, expect, it } from 'vitest';
import { allocationInput, parseAllocations } from './payment-allocation.contract';
const id = 'c31ac59c-8148-4664-8745-496a9618f202';
const invoiceId = 'c31ac59c-8148-4664-8745-496a9618f203';
const row = {
  orderId: id,
  payments: [{ id, installmentNumber: 1, amount: '1000.25', reversals: [], allocations: [] }],
  invoices: [
    { id: invoiceId, number: 'FAC-CI', totalTtc: '2360', creditNotes: [{ amount: '1500' }], allocations: [] },
  ],
};
describe('Affectations de règlement', () => {
  it('respecte simultanément le disponible et le solde net de la facture', () => {
    const snapshot = parseAllocations(row, id);
    expect(allocationInput(snapshot, id, invoiceId, '860,00')).toEqual({ invoiceId, amount: '860.00' });
    expect(() => allocationInput(snapshot, id, invoiceId, '860.01')).toThrow();
  });
  it('refuse une affectation absente du côté facture', () => {
    const payments = row.payments.map((payment) => ({
      ...payment,
      allocations: [{ id, invoiceId, amount: '1.00' }],
    }));
    expect(() => parseAllocations({ ...row, payments }, id)).toThrow();
  });
});
