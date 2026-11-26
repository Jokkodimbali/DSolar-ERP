import { isRecord } from '../../../core/api/api-contract';
import { storeId } from '../../stores/domain/store.contract';

export type ReferenceKind = 'categories' | 'brands' | 'tax-regimes';
export interface Reference {
  id: string;
  name: string;
  code?: string;
  rate?: string;
}
export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  active: boolean;
  isSolarPlant: boolean;
  categoryId: string | null;
  brandId: string | null;
  taxRegimeId: string | null;
}
export interface ProductInput {
  name: string;
  description: string | null;
  unit: string;
  isSolarPlant: boolean;
  categoryId: string | null;
  brandId: string | null;
  taxRegimeId: string | null;
}
export interface ProductFilters {
  search: string;
  active: string;
  categoryId: string;
  brandId: string;
  taxRegimeId: string;
  isSolarPlant: string;
}
export const emptyFilters: ProductFilters = {
  search: '',
  active: '',
  categoryId: '',
  brandId: '',
  taxRegimeId: '',
  isSolarPlant: '',
};
const text = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Texte du catalogue invalide.');
  return value;
};
const nullableId = (value: unknown): string | null => (value === null ? null : storeId(value));
const count = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('Pagination invalide.');
  return value;
};
export function parseProduct(value: unknown): Product {
  if (
    !isRecord(value) ||
    typeof value['active'] !== 'boolean' ||
    typeof value['isSolarPlant'] !== 'boolean' ||
    (value['description'] !== null && typeof value['description'] !== 'string')
  )
    throw new Error('Produit invalide.');
  return {
    id: storeId(value['id']),
    sku: text(value['sku']),
    name: text(value['name']),
    description: value['description'],
    unit: text(value['unit']),
    active: value['active'],
    isSolarPlant: value['isSolarPlant'],
    categoryId: nullableId(value['categoryId']),
    brandId: nullableId(value['brandId']),
    taxRegimeId: nullableId(value['taxRegimeId']),
  };
}
export function parseProductPage(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value['items']) || !isRecord(value['pagination']))
    throw new Error('Catalogue invalide.');
  const { page, limit, total, pages } = value['pagination'];
  const result = { page: count(page), limit: count(limit), total: count(total), pages: count(pages) };
  if (
    result.page < 1 ||
    result.limit < 1 ||
    result.limit > 100 ||
    result.pages !== Math.ceil(result.total / result.limit) ||
    value['items'].length > result.limit
  )
    throw new Error('Pagination incohérente.');
  return { items: value['items'].map(parseProduct), ...result };
}
export function decimalInput(value: string, precision: 2 | 4 = 2): string {
  const normalized = value.trim().replace(',', '.');
  if (!new RegExp('^(0|[1-9]\\d{0,14})(\\.\\d{1,' + precision + '})?$').test(normalized))
    throw new Error('Montant ou taux invalide.');
  return normalized;
}
export function parseReferences(value: unknown, kind: ReferenceKind): Reference[] {
  if (!Array.isArray(value)) throw new Error('Références invalides.');
  return value.map((row: unknown) => {
    if (!isRecord(row)) throw new Error('Référence invalide.');
    return {
      id: storeId(row['id']),
      name: text(row['name']),
      ...(kind !== 'brands' ? { code: text(row['code']) } : {}),
      ...(kind === 'tax-regimes' ? { rate: decimalInput(text(row['rate']), 4) } : {}),
    };
  });
}
export interface ProductPrice {
  id: string;
  salePrice: string;
  purchasePrice: string | null;
  validFrom: string;
  validTo: string | null;
}
export function parsePrices(value: unknown): ProductPrice[] {
  if (!Array.isArray(value)) throw new Error('Tarifs invalides.');
  const date = (raw: unknown): string => {
    const result = text(raw);
    if (!Number.isFinite(Date.parse(result))) throw new Error('Date de tarif invalide.');
    return result;
  };
  return value.map((row: unknown) => {
    if (!isRecord(row)) throw new Error('Tarif invalide.');
    return {
      id: storeId(row['id']),
      salePrice: decimalInput(text(row['salePrice'])),
      purchasePrice: row['purchasePrice'] === null ? null : decimalInput(text(row['purchasePrice'])),
      validFrom: date(row['validFrom']),
      validTo: row['validTo'] === null ? null : date(row['validTo']),
    };
  });
}
