import { describe, expect, it } from 'vitest';
import { parseConvertedOrder, parseLinkedOrder } from './proforma-conversion.contract';
import { parseProforma } from './proforma-view.contract';

const id = 'c31ac59c-8148-4664-8745-496a9618f202';
const orderId = 'c31ac59c-8148-4664-8745-496a9618f203';
const line = { id, productId: id, storeId: id, quantity: '2', unitPrice: '1000', discount: '0', taxRate: '18', lineTotal: '2360' };
const source = parseProforma({
  id, customerId: id, number: 'PF-CI', status: 'ACCEPTED', total: '2360',
  createdAt: '2026-11-26T00:00:00Z', issuedAt: '2026-11-26T00:00:00Z', expiresAt: null,
  lines: [{ ...line, proformaId: id }],
});
const order = {
  id: orderId, number: 'CMD-CI', customerId: id, proformaId: id, total: '2360.00',
  lines: [{ ...line, orderId, quantity: '2.000' }],
};
describe('Conversion des proformas', () => {
  it('contrôle les références et chaque montant exact', () => {
    expect(parseConvertedOrder(order, source)).toEqual({ id: orderId, number: 'CMD-CI' });
    expect(() => parseConvertedOrder({ ...order, total: '2360.01' }, source)).toThrow();
    expect(() => parseConvertedOrder({ ...order, lines: [{ ...line, orderId, taxRate: '19' }] }, source)).toThrow();
  });
  it('refuse une recherche ambiguë et accepte l’absence de commande', () => {
    expect(parseLinkedOrder({ items: [], pagination: { page: 1, limit: 2, total: 0, pages: 0 } }, source)).toBeNull();
    expect(parseLinkedOrder({ items: [order], pagination: { page: 1, limit: 2, total: 1, pages: 1 } }, source)?.id).toBe(orderId);
    expect(() => parseLinkedOrder({ items: [order, order], pagination: { page: 1, limit: 2, total: 2, pages: 1 } }, source)).toThrow();
  });
});
