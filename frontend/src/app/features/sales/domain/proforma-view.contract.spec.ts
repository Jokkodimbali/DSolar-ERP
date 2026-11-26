import { describe, expect, it } from 'vitest';
import { parseProforma, parseProformaPage, proformaActions } from './proforma-view.contract';

const id = 'c31ac59c-8148-4664-8745-496a9618f202';
const row = {
  id,
  number: 'PF-CI',
  customerId: id,
  status: 'DRAFT',
  createdAt: '2026-11-26T00:00:00Z',
  issuedAt: null,
  expiresAt: null,
  total: '2360',
  lines: [
    { id, proformaId: id, productId: id, storeId: id, quantity: '2', unitPrice: '1000', discount: '0', taxRate: '18', lineTotal: '2360' },
  ],
};
describe('Consultation des proformas', () => {
  it('préserve les décimales et contrôle la somme des lignes', () => {
    expect(parseProforma(row).total).toBe('2360');
    expect(() => parseProforma({ ...row, total: '2360.01' })).toThrow();
    expect(() => parseProforma({ ...row, lines: [{ ...row.lines[0], proformaId: 'invalide' }] })).toThrow();
    expect(parseProformaPage({ items: [row], pagination: { page: 1, limit: 10, total: 1, pages: 1 } }).items).toHaveLength(1);
  });
  it('autorise uniquement les transitions compatibles avec le statut et la validité', () => {
    expect(proformaActions(parseProforma(row))).toEqual(['issue', 'cancel']);
    expect(proformaActions(parseProforma({ ...row, status: 'ISSUED' }))).toEqual(['accept', 'cancel']);
    expect(proformaActions(parseProforma({ ...row, status: 'ACCEPTED' }))).toEqual([]);
    expect(proformaActions(parseProforma({ ...row, status: 'ISSUED', expiresAt: '2026-01-01T00:00:00Z' }), Date.parse(row.createdAt))).toEqual(['expire']);
  });
});
