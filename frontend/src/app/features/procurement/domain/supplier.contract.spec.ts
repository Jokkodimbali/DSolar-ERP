import { describe, expect, it } from 'vitest';
import { filterSuppliers, parseSupplier, parseSuppliers } from './supplier.contract';

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

  it('filtre les fournisseurs par coordonnées et statut sans modifier la liste', () => {
    const suppliers = parseSuppliers([supplier, { ...supplier, name: 'Thiès', active: false }]);
    expect(filterSuppliers(suppliers, ' dakar ', 'ALL')).toHaveLength(1);
    expect(filterSuppliers(suppliers, 'NINEA', 'INACTIVE')).toHaveLength(1);
    expect(filterSuppliers(suppliers, 'example.com', 'ACTIVE')).toHaveLength(1);
    expect(filterSuppliers(suppliers, 'inconnu', 'ALL')).toHaveLength(0);
    expect(suppliers).toHaveLength(2);
  });
});
