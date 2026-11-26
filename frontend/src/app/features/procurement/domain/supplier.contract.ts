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

export function parseSupplierPage(value: unknown) {
  if (!isRecord(value) || !isRecord(value['pagination']))
    throw new Error('Pagination fournisseurs invalide.');
  const { page, limit, total, pages } = value['pagination'];
  if (
    typeof page !== 'number' ||
    typeof limit !== 'number' ||
    typeof total !== 'number' ||
    typeof pages !== 'number' ||
    ![page, limit, total, pages].every(Number.isSafeInteger) ||
    page < 1 ||
    limit < 1 ||
    limit > 100 ||
    total < 0 ||
    pages !== Math.ceil(total / limit)
  )
    throw new Error('Pagination fournisseurs invalide.');
  const items = parseSuppliers(value['items']);
  if (items.length !== Math.min(limit, Math.max(0, total - (page - 1) * limit)))
    throw new Error('Nombre de fournisseurs incohérent.');
  return { page, limit, total, pages, items };
}
