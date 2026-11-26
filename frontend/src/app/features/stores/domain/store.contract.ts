import { isRecord } from '../../../core/api/api-contract';

export type StoreStatus = 'ACTIVE' | 'INACTIVE';
export interface Store {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly address: string | null;
  readonly status: StoreStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface CreateStore {
  readonly code: string;
  readonly name: string;
  readonly address?: string;
}
export interface UpdateStore {
  readonly name: string;
  readonly address: string | null;
}
export function storeId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value))
    throw new Error('Identifiant de magasin ou d’utilisateur invalide.');
  return value;
}
export function parseStore(value: unknown): Store {
  if (
    !isRecord(value) ||
    typeof value['code'] !== 'string' ||
    typeof value['name'] !== 'string' ||
    (value['address'] !== null && typeof value['address'] !== 'string') ||
    (value['status'] !== 'ACTIVE' && value['status'] !== 'INACTIVE') ||
    typeof value['createdAt'] !== 'string' ||
    typeof value['updatedAt'] !== 'string' ||
    !Number.isFinite(Date.parse(value['createdAt'])) ||
    !Number.isFinite(Date.parse(value['updatedAt']))
  )
    throw new Error('Magasin invalide.');
  return {
    id: storeId(value['id']),
    code: value['code'],
    name: value['name'],
    address: value['address'],
    status: value['status'],
    createdAt: value['createdAt'],
    updatedAt: value['updatedAt'],
  };
}
export function parseStores(value: unknown): Store[] {
  if (!Array.isArray(value)) throw new Error('Liste de magasins invalide.');
  return value.map(parseStore);
}
export function parseAssignment(value: unknown, id: string, userId: string, assigned: boolean): void {
  if (
    !isRecord(value) ||
    value['storeId'] !== id ||
    value['userId'] !== userId ||
    value['assigned'] !== assigned
  )
    throw new Error('Confirmation d’affectation invalide.');
}
export function filterStores(stores: readonly Store[], search: string, status: StoreStatus | 'ALL'): Store[] {
  const query = search.trim().toLocaleLowerCase('fr');
  return stores.filter(
    (store) =>
      (status === 'ALL' || store.status === status) &&
      [store.name, store.code, store.address ?? ''].some((value) =>
        value.toLocaleLowerCase('fr').includes(query),
      ),
  );
}
