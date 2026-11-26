import { isRecord } from '../../../core/api/api-contract';

export interface SupplierInput {
  readonly name: string;
  readonly taxId: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly address: string | null;
}

export interface Supplier extends SupplierInput {
  readonly id: string;
  readonly active: boolean;
}

export type SupplierFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

export function supplierId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value))
    throw new Error('Identifiant de fournisseur invalide.');
  return value;
}

function optionalText(value: unknown): string | null {
  if (value === null || typeof value === 'string') return value;
  throw new Error('Coordonnées du fournisseur invalides.');
}

export function parseSupplier(value: unknown): Supplier {
  if (!isRecord(value) || typeof value['name'] !== 'string' || typeof value['active'] !== 'boolean')
    throw new Error('Fournisseur invalide.');
  return {
    id: supplierId(value['id']),
    name: value['name'],
    active: value['active'],
    taxId: optionalText(value['taxId']),
    phone: optionalText(value['phone']),
    email: optionalText(value['email']),
    address: optionalText(value['address']),
  };
}

export function parseSuppliers(value: unknown): Supplier[] {
  if (!Array.isArray(value)) throw new Error('Liste des fournisseurs invalide.');
  return value.map(parseSupplier);
}

export function filterSuppliers(
  suppliers: readonly Supplier[],
  search: string,
  status: SupplierFilter,
): Supplier[] {
  const query = search.trim().toLocaleLowerCase('fr');
  return suppliers.filter(
    (supplier) =>
      (status === 'ALL' || supplier.active === (status === 'ACTIVE')) &&
      [supplier.name, supplier.taxId, supplier.phone, supplier.email, supplier.address].some((value) =>
        (value ?? '').toLocaleLowerCase('fr').includes(query),
      ),
  );
}
