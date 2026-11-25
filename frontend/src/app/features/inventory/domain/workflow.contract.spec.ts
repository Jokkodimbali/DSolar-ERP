import { describe, expect, it } from 'vitest';
import { parseCount, parsePage, parseTransfer, parseTransferDetail } from './workflow.contract';
const id = 'c31ac59c-8148-4664-8745-496a9618f202';
const row = { id, number: 'TR-01', status: 'SHIPPED', originId: id, destinationId: id, origin: { name: 'Dakar' }, destination: { name: 'Thiès' }, createdAt: '2026-11-25T00:00:00Z' };
describe('Contrats des opérations de stock', () => {
  it('valide le statut et la pagination', () => {
    expect(parsePage({ items: [row], pagination: { page: 1, limit: 10, total: 1, pages: 1 } }, parseTransfer).items[0]?.status).toBe('SHIPPED');
    expect(() => parseTransfer({ ...row, status: 'UNKNOWN' })).toThrow();
    expect(() => parseCount({ id, storeId: id, status: 'UNKNOWN' })).toThrow();
  });
  it('conserve les quantités de réception sans conversion flottante', () => {
    expect(parseTransferDetail({ ...row, events: [], lines: [{ id, productId: id, product: { name: 'Panneau', sku: 'PV', unit: 'PIECE' }, quantity: '2.5', receivedQuantity: '0.5', damagedQuantity: '0.25', missingQuantity: '0' }] }).lines[0]?.received).toBe('0.5');
  });
});
