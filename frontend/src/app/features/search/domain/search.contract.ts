import { isRecord } from '../../../core/api/api-contract';
import type { Permission } from '../../auth/domain/auth.contract';

export interface SearchSource {
  readonly label: string;
  readonly path: string;
  readonly permission: Permission;
  readonly title: string;
  readonly subtitle?: string;
}

export const sources: readonly SearchSource[] = [
  {
    label: 'Produits',
    path: '/products/search',
    permission: 'products.read',
    title: 'name',
    subtitle: 'sku',
  },
  { label: 'Magasins', path: '/search/stores', permission: 'stores.read', title: 'name', subtitle: 'code' },
  { label: 'Clients', path: '/customers/search', permission: 'sales.read', title: 'name' },
  { label: 'Commandes', path: '/sales-orders/search', permission: 'sales.read', title: 'number' },
  { label: 'Factures', path: '/invoices/search', permission: 'sales.read', title: 'number' },
];

export interface SearchResult {
  readonly title: string;
  readonly subtitle: string;
  readonly id: string;
}
export interface SearchGroup {
  readonly label: string;
  readonly items: readonly SearchResult[];
  readonly total: number;
  readonly error: string;
}

export function parseSearch(value: unknown, source: SearchSource): SearchGroup {
  const invalid = (): never => {
    throw new Error('Résultats de recherche invalides.');
  };
  if (!isRecord(value) || !Array.isArray(value['items']) || !isRecord(value['pagination'])) return invalid();
  const total = value['pagination']['total'];
  if (
    typeof total !== 'number' ||
    !Number.isSafeInteger(total) ||
    total < value['items'].length ||
    value['items'].length > 5
  )
    return invalid();
  const items = value['items'].map((item: unknown): SearchResult => {
    if (!isRecord(item)) return invalid();
    const title = item[source.title];
    const subtitle = source.subtitle ? item[source.subtitle] : '';
    const id = item['id'];
    if (
      typeof id !== 'string' ||
      !id ||
      typeof title !== 'string' ||
      !title.trim() ||
      typeof subtitle !== 'string'
    )
      return invalid();
    return { id, title, subtitle };
  });
  return { label: source.label, items, total, error: '' };
}
