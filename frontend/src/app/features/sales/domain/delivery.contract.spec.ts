import { describe, expect, it } from 'vitest';
import { deliveryInput, deliveryKey, matchesDelivery, parseDelivery, parseDeliveryProgress } from './delivery.contract';

const id = 'c31ac59c-8148-4664-8745-496a9618f202';
const key = deliveryKey({ storeId: id, productId: id });
const row = { orderId: id, status: 'PARTIALLY_DELIVERED', lines: [
  { storeId: id, productId: id, store: 'Dakar', product: 'Panneau', sku: 'PV', quantity: '2.125', delivered: '0.125', remaining: '2.000' },
] };
describe('Bons de livraison', () => {
  it('vérifie les reliquats exacts et refuse un dépassement', () => {
    const progress = parseDeliveryProgress(row, id);
    expect(deliveryInput(progress, { [key]: '0,125' }, id).lines[0]?.quantity).toBe('0.125');
    expect(() => deliveryInput(progress, { [key]: '2.001' }, id)).toThrow();
    expect(() => parseDeliveryProgress({ ...row, lines: row.lines.map((line) => ({ ...line, remaining: '2.001' })) }, id)).toThrow();
  });
  it('compare la référence et les lignes du bon récupéré', () => {
    const input = deliveryInput(parseDeliveryProgress(row, id), { [key]: '1' }, id);
    const note = parseDelivery({
      id, orderId: id, number: 'BL-' + id.toUpperCase(), status: 'DRAFT', deliveredAt: null,
      lines: [{ id, deliveryId: id, storeId: id, productId: id, quantity: '1.000' }],
    }, id);
    expect(matchesDelivery(note, input)).toBe(true);
    expect(matchesDelivery(note, { ...input, lines: input.lines.map((line) => ({ ...line, quantity: '1.001' })) })).toBe(false);
  });
});
