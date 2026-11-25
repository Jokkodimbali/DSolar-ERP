import { isRecord } from '../../../core/api/api-contract';
import { storeId } from '../../stores/domain/store.contract';
import { formatMoney } from './dashboard.contract';

export interface StockAlert {
  readonly productId: string;
  readonly name: string;
  readonly sku: string;
  readonly unit: string;
  readonly available: string;
  readonly severity: 'OUT_OF_STOCK' | 'LOW_STOCK';
}
export interface StoreAlerts {
  readonly storeId: string;
  readonly storeName: string;
  readonly items: readonly StockAlert[];
}
export interface RecentOrder {
  readonly id: string;
  readonly number: string;
  readonly customerName: string;
  readonly total: string;
  readonly status: string;
  readonly paymentStatus: string;
  readonly createdAt: string;
}

function invalid(): never {
  throw new Error('Données opérationnelles invalides.');
}

function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return invalid();
  return value;
}

export function parseAlerts(value: unknown, id: string, name: string): StoreAlerts {
  if (
    !isRecord(value) ||
    value['storeId'] !== id ||
    value['threshold'] !== '5' ||
    !Array.isArray(value['items'])
  )
    return invalid();
  const items = value['items'].map((item: unknown): StockAlert => {
    if (!isRecord(item) || item['storeId'] !== id) return invalid();
    const severity = item['severity'];
    if (severity !== 'OUT_OF_STOCK' && severity !== 'LOW_STOCK') return invalid();
    const available = text(item['available']);
    if (!/^\d+(?:\.\d{1,3})?$/.test(available)) return invalid();
    return {
      productId: storeId(item['productId']),
      name: text(item['name']),
      sku: text(item['sku']),
      unit: text(item['unit']),
      available,
      severity,
    };
  });
  if (new Set(items.map((item) => item.productId)).size !== items.length) return invalid();
  return { storeId: id, storeName: name, items };
}

const orderStatuses: Record<string, string> = {
  DRAFT: 'Brouillon',
  CONFIRMED: 'Confirmée',
  PARTIALLY_DELIVERED: 'Partiellement livrée',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
};
const paymentStatuses: Record<string, string> = {
  UNPAID: 'Impayée',
  PARTIALLY_PAID: 'Partiellement payée',
  PAID: 'Payée',
};

export function parseRecentOrders(value: unknown, limit = 5): RecentOrder[] {
  if (!isRecord(value) || !Array.isArray(value['items']) || value['items'].length > limit) return invalid();
  return value['items'].map((item: unknown) => {
    if (!isRecord(item)) return invalid();
    const status = text(item['status']);
    const paymentStatus = text(item['paymentStatus']);
    if (!Object.hasOwn(orderStatuses, status) || !Object.hasOwn(paymentStatuses, paymentStatus))
      return invalid();
    const createdAt = text(item['createdAt']);
    if (!Number.isFinite(Date.parse(createdAt))) return invalid();
    return {
      id: storeId(item['id']),
      number: text(item['number']),
      customerName: isRecord(item['customer']) ? text(item['customer']['name']) : '—',
      total: formatMoney(text(item['total'])),
      status: orderStatuses[status] ?? invalid(),
      paymentStatus: paymentStatuses[paymentStatus] ?? invalid(),
      createdAt: new Intl.DateTimeFormat('fr-SN', {
        dateStyle: 'short',
        timeZone: 'Africa/Dakar',
      }).format(new Date(createdAt)),
    };
  });
}
