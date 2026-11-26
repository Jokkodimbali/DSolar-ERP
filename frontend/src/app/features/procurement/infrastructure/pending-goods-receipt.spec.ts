import { describe, expect, it } from 'vitest';
import { matchesReceipt, parsePendingReceipt, receiptStorageKey } from './pending-goods-receipt';

const id = 'c31ac59c-8148-4664-8745-496a9618f202';
const other = 'd31ac59c-8148-4664-8745-496a9618f202';
const input = {
  number: 'BR-CI',
  purchaseOrderId: id,
  storeId: id,
  lines: [{ productId: id, quantity: 1.125, unitCost: 1000.25 }],
};
const receipt = {
  ...input,
  id,
  status: 'DRAFT' as const,
  receivedAt: null,
  lines: [{ id, productId: id, quantity: '1.125', unitCost: '1000.25' }],
};

describe('Reprise des bons de réception', () => {
  it('valide le contenu persisté et isole les utilisateurs', () => {
    expect(parsePendingReceipt(JSON.parse(JSON.stringify(input)))).toEqual(input);
    expect(receiptStorageKey(id)).not.toBe(receiptStorageKey(other));
    expect(() => parsePendingReceipt({ ...input, storeId: 'invalide' })).toThrow();
  });

  it('vérifie le magasin, la commande et les quantités avant de reconnaître une réception', () => {
    expect(matchesReceipt(receipt, input)).toBe(true);
    expect(matchesReceipt(receipt, { ...input, storeId: other })).toBe(false);
    expect(matchesReceipt(receipt, { ...input, purchaseOrderId: other })).toBe(false);
    expect(
      matchesReceipt(receipt, { ...input, lines: [{ productId: id, quantity: 2, unitCost: 1000.25 }] }),
    ).toBe(false);
  });
});
