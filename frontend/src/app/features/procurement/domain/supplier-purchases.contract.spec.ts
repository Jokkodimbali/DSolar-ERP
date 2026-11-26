import { describe, expect, it } from 'vitest';
import { parseSupplierPurchases } from './supplier-purchases.contract';
const id = 'c31ac59c-8148-4664-8745-496a9618f202';
const row = {
  supplierId: id,
  supplierName: 'Fournisseur CI',
  active: true,
  currency: 'XOF',
  basis: 'CONFIRMED_RECEIPTS_AND_RETURNS',
  payableBalance: null,
  payableBalanceAvailable: false,
  confirmedReceipts: '2',
  confirmedReturns: '2',
  recordedCredits: '1',
  returnsAwaitingCredit: '1',
  receivedValue: '1000.25',
  returnedValue: '200.10',
  creditValue: '100.05',
  netReceivedValue: '800.15',
};
describe('Synthèse des achats fournisseur', () => {
  it('vérifie les valorisations exactes et ne déduit pas deux fois les avoirs', () => {
    expect(parseSupplierPurchases(row, id).netReceivedValue).toBe('800.15');
    expect(() => parseSupplierPurchases({ ...row, netReceivedValue: '700.10' }, id)).toThrow();
  });
  it('refuse de présenter un solde fournisseur non établi et une identité différente', () => {
    expect(() => parseSupplierPurchases({ ...row, payableBalance: '800.15' }, id)).toThrow();
    expect(() => parseSupplierPurchases({ ...row, creditValue: '200.11' }, id)).toThrow();
    expect(() => parseSupplierPurchases(row, 'c31ac59c-8148-4664-8745-496a9618f203')).toThrow();
  });
});
