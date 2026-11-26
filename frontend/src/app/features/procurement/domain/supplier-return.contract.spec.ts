import { describe, expect, it } from 'vitest';
import { parseSupplierReturn, parseSupplierReturnPage } from './supplier-return.contract';

const id = 'c31ac59c-8148-4664-8745-496a9618f202';
const row = {
  id,
  receiptId: id,
  receipt: { id, number: 'BR-CI', storeId: id },
  status: 'DRAFT',
  reason: 'Produit endommagé',
  total: '100.25',
  createdAt: '2026-11-26T00:00:00Z',
  credit: null,
  lines: [{
    id,
    returnId: id,
    receiptLineId: id,
    quantity: '1',
    unitCost: '100.25',
    total: '100.25',
    serials: [],
  }],
};
describe('Contrats des retours fournisseurs', () => {
  it('conserve les décimales et valide la pagination', () => {
    expect(parseSupplierReturn(row).total).toBe('100.25');
    expect(parseSupplierReturnPage({ items: [row], pagination: { page: 1, limit: 10, total: 1, pages: 1 } }).total).toBe(1);
  });
  it('refuse les valorisations et références incohérentes', () => {
    expect(() => parseSupplierReturn({ ...row, total: '100.26' })).toThrow();
    expect(() => parseSupplierReturn({ ...row, credit: { returnId: id, amount: '100.25', reference: 'AV-CI' } })).toThrow();
    expect(() => parseSupplierReturn({ ...row, lines: [] })).toThrow();
  });
});
