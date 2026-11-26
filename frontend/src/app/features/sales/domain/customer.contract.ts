import { isRecord } from '../../../core/api/api-contract';
import { parsePage } from '../../inventory/domain/workflow.contract';
import { storeId } from '../../stores/domain/store.contract';

export interface CustomerInput {
  name: string;
  taxId: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
}
function invalid(): never {
  throw new Error('Coordonnées du client invalides.');
}
function optional(value: unknown, max: number): string | null {
  if (value === null || (typeof value === 'string' && value.length <= max)) return value;
  return invalid();
}
export function customerInput(value: unknown): CustomerInput {
  if (
    !isRecord(value) ||
    typeof value['name'] !== 'string' ||
    !value['name'].trim() ||
    value['name'].length > 180
  )
    return invalid();
  return {
    name: value['name'].trim(),
    taxId: optional(value['taxId'], 100)?.trim() || null,
    phone: optional(value['phone'], 50)?.trim() || null,
    email: optional(value['email'], 254)?.trim().toLowerCase() || null,
    address: optional(value['address'], 500)?.trim() || null,
  };
}
export function parseCustomer(value: unknown) {
  if (
    !isRecord(value) ||
    typeof value['createdAt'] !== 'string' ||
    !Number.isFinite(Date.parse(value['createdAt']))
  )
    return invalid();
  return { ...customerInput(value), id: storeId(value['id']), createdAt: value['createdAt'] };
}
export type Customer = ReturnType<typeof parseCustomer>;

export function parseCustomerPage(value: unknown) {
  const page = parsePage(value, parseCustomer);
  if (
    page.items.length !== Math.min(page.limit, Math.max(0, page.total - (page.page - 1) * page.limit)) ||
    new Set(page.items.map((item) => item.id)).size !== page.items.length
  )
    return invalid();
  return page;
}
export interface PendingCustomer {
  operationKey: string;
  input: CustomerInput;
}
export function parsePendingCustomer(value: unknown): PendingCustomer {
  if (!isRecord(value)) return invalid();
  return { operationKey: storeId(value['operationKey']), input: customerInput(value['input']) };
}
export function customerStorageKey(actor: string): string {
  return 'dsolar.customer.pending.v1:' + storeId(actor);
}
