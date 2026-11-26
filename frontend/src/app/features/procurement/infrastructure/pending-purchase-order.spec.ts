import { describe, expect, it } from 'vitest';
import { parsePendingPurchase, matchesPurchase, purchaseStorageKey } from './pending-purchase-order';

const id = 'c31ac59c-8148-4664-8745-496a9618f202';
const input = {
  number: 'CF-CI',
  supplierId: id,
  lines: [{ productId: id, quantity: 2.125, unitCost: 1000.25 }],
};
const order = {
  id,
  number: input.number,
  supplier: { id, name: 'CI', active: true, taxId: null, phone: null, email: null, address: null },
  orderedAt: '2026-11-26T00:00:00Z',
  status: 'DRAFT' as const,
  lines: [{ id, productId: id, quantity: '2.125', unitCost: '1000.25' }],
};

describe('Reprise des commandes fournisseurs', () => {
  it('conserve les données de la commande et isole le stockage par utilisateur', () => {
    expect(parsePendingPurchase(JSON.parse(JSON.stringify(input)))).toEqual(input);
    expect(purchaseStorageKey(id)).toContain(id);
    expect(() => purchaseStorageKey('invalide')).toThrow();
    expect(() => parsePendingPurchase({ ...input, lines: [] })).toThrow();
  });

  it('ne reconnaît que la même référence et les mêmes lignes', () => {
    expect(matchesPurchase(order, input)).toBe(true);
    expect(matchesPurchase(order, { ...input, number: 'CF-AUTRE' })).toBe(false);
    expect(
      matchesPurchase(order, { ...input, lines: [{ productId: id, quantity: 3, unitCost: 1000.25 }] }),
    ).toBe(false);
  });
});
