import { describe, expect, it } from 'vitest';
import { parsePendingSupplierCreation, supplierCreationStorageKey } from './pending-supplier-creation';

const id = 'c31ac59c-8148-4664-8745-496a9618f202';
const command = {
  operationKey: id,
  input: { name: 'Fournisseur CI', taxId: null, phone: null, email: null, address: null },
};

describe('Reprise des créations fournisseurs', () => {
  it('conserve le contenu et la clé de la requête initiale', () => {
    expect(parsePendingSupplierCreation(JSON.parse(JSON.stringify(command)))).toEqual(command);
  });

  it('isole les opérations par utilisateur et refuse un identifiant invalide', () => {
    expect(supplierCreationStorageKey(id)).toContain(id);
    expect(() => supplierCreationStorageKey('../users')).toThrow();
    expect(() => parsePendingSupplierCreation({ ...command, operationKey: 'invalid' })).toThrow();
    expect(() => parsePendingSupplierCreation({ ...command, input: { ...command.input, name: '' } })).toThrow();
  });
});
