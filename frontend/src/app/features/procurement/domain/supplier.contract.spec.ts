import { describe, expect, it } from 'vitest';
import { parseSupplier, parseSupplierPage, parseSuppliers } from './supplier.contract';

const supplier = {
  id: 'c31ac59c-8148-4664-8745-496a9618f202',
  name: 'Solaire Dakar',
  active: true,
  taxId: 'NINEA-001',
  phone: null,
  email: 'contact@example.com',
  address: null,
};

describe('Contrats fournisseurs', () => {
  it('valide les réponses et les champs facultatifs', () => {
    expect(parseSupplier(supplier)).toEqual(supplier);
    expect(parseSuppliers([supplier])).toEqual([supplier]);
    expect(() => parseSupplier({ ...supplier, id: '../users' })).toThrow();
    expect(() => parseSupplier({ ...supplier, active: 'true' })).toThrow();
    expect(() => parseSupplier({ ...supplier, phone: 123 })).toThrow();
    expect(() => parseSuppliers(null)).toThrow();
  });

  it('valide les métadonnées de pagination du serveur', () => {
    const result = { items: [supplier], pagination: { page: 1, limit: 10, total: 1, pages: 1 } };
    expect(parseSupplierPage(result).items).toEqual([supplier]);
    expect(() => parseSupplierPage({ ...result, items: [] })).toThrow();
    expect(() => parseSupplierPage({ ...result, pagination: { ...result.pagination, pages: 2 } })).toThrow();
    expect(
      parseSupplierPage({ items: [], pagination: { page: 2, limit: 10, total: 1, pages: 1 } }).items,
    ).toEqual([]);
  });
});
