import { describe, expect, it } from 'vitest';
import { adjustmentInput, isZero, parseStock, quantityInput, parseStockPage, parseStockSummary } from './stock.contract';

const id = 'c31ac59c-8148-4664-8745-496a9618f202';
const item = {
  storeId: id,
  productId: id,
  quantity: '2.500',
  reserved: '2.000',
  available: '0.500',
  sku: 'PV-01',
  name: 'Panneau',
  unit: 'PIECE',
};

describe('Contrats de stock', () => {
  it('conserve les quantités exactes retournées par le serveur', () => {
    expect(parseStock([item], id)).toEqual([item]);
    expect(() => parseStock([item, item], id)).toThrow();
    expect(() => parseStock([{ ...item, storeId: 'autre' }], id)).toThrow();
    expect(() => parseStock([{ ...item, quantity: 2.5 }], id)).toThrow();
  });

  it('contrôle la pagination et les compteurs serveur', () => {
    expect(parseStockPage({ items: [item], pagination: { page: 1, limit: 10, total: 1, pages: 1 } }, id).total).toBe(1);
    expect(parseStockSummary({ storeId: id, products: 3, outOfStock: 1, reservedProducts: 1 }, id)).toEqual({ products: 3, empty: 1, available: 2, reserved: 1 });
    expect(() => parseStockSummary({ storeId: id, products: 1, outOfStock: 2, reservedProducts: 0 }, id)).toThrow();
  });

  it('valide les quantités sans conversion flottante', () => {
    expect(quantityInput('999999999999999,999', true)).toBe('999999999999999.999');
    expect(isZero('0.000')).toBe(true);
    for (const value of ['0.000', '-1', '1.0001', '1e3']) expect(() => quantityInput(value, true)).toThrow();
  });

  it('préserve la clé de reprise d’un ajustement', () => {
    const input = {
      storeId: id,
      productId: id,
      direction: 'IN' as const,
      quantity: '1,250',
      reason: ' Stock initial ',
      operationKey: id,
    };
    expect(adjustmentInput(input)).toEqual({ ...input, quantity: '1.250', reason: 'Stock initial' });
    expect(() => adjustmentInput({ ...input, reason: 'abc' })).toThrow();
  });
});
