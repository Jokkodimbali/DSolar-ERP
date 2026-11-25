import { describe, expect, it } from 'vitest';
import { decimalInput, parseProduct, parseProductPage, parsePrices, parseReferences } from './product.contract';

const id = 'c31ac59c-8148-4664-8745-496a9618f202';
const product = {
  id,
  sku: 'PV-001',
  name: 'Panneau',
  description: null,
  unit: 'PIECE',
  active: true,
  isSolarPlant: false,
  categoryId: null,
  brandId: null,
  taxRegimeId: null,
};

describe('Contrats du catalogue', () => {
  it('valide les produits et la pagination réelle', () => {
    expect(parseProduct(product)).toEqual(product);
    expect(parseProductPage({ items: [product], pagination: { page: 1, limit: 10, total: 1, pages: 1 } }).items).toHaveLength(1);
    expect(() => parseProduct({ ...product, active: 'true' })).toThrow();
    expect(() => parseProductPage({ items: [], pagination: { page: 1, limit: 10, total: 20, pages: 1 } })).toThrow();
  });

  it('préserve les montants décimaux sans arrondi flottant', () => {
    expect(decimalInput('999999999999999,99')).toBe('999999999999999.99');
    expect(decimalInput('18,1234', 4)).toBe('18.1234');
    expect(() => decimalInput('1.001')).toThrow();
    expect(() => decimalInput('-1')).toThrow();
    expect(() => decimalInput('1e5')).toThrow();
  });

  it('lit les références et périodes tarifaires', () => {
    expect(parseReferences([{ id, name: 'TVA', code: 'TVA18', rate: '18' }], 'tax-regimes')[0]?.rate).toBe('18');
    expect(parsePrices([{ id, salePrice: '1000.25', purchasePrice: null, validFrom: '2026-11-25T00:00:00Z', validTo: null }])[0]?.salePrice).toBe('1000.25');
    expect(() => parsePrices([{ id, salePrice: 1000 }])).toThrow();
  });
});
