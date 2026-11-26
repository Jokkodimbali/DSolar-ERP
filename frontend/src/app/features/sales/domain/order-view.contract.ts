import { isRecord } from '../../../core/api/api-contract';
import { parseRecentOrders } from '../../dashboard/domain/dashboard-operations.contract';
import { formatMoney } from '../../dashboard/domain/dashboard.contract';
import { storeId } from '../../stores/domain/store.contract';

export function parseOrderPage(value: unknown) {
  if (!isRecord(value) || !isRecord(value['pagination'])) throw new Error('Pagination invalide.');
  const total = value['pagination']['total'];
  const pages = value['pagination']['pages'];
  if (
    typeof total !== 'number' ||
    !Number.isSafeInteger(total) ||
    total < 0 ||
    typeof pages !== 'number' ||
    !Number.isSafeInteger(pages) ||
    pages < 0
  )
    throw new Error('Pagination invalide.');
  return { items: parseRecentOrders(value, 20), total, pages };
}

export function parseOrderDetail(value: unknown, id: string) {
  if (!isRecord(value) || value['id'] !== id || !Array.isArray(value['lines']))
    throw new Error('Commande invalide.');
  const order = parseRecentOrders({ items: [value] })[0];
  if (!order) throw new Error('Commande invalide.');
  const text = (raw: unknown): string => {
    if (typeof raw !== 'string' || !raw.trim()) throw new Error('Ligne de commande invalide.');
    return raw;
  };
  const lines = value['lines'].map((line: unknown) => {
    if (!isRecord(line) || !isRecord(line['product']) || !isRecord(line['store']))
      throw new Error('Ligne invalide.');
    const quantity = text(line['quantity']);
    if (!/^\d+(?:\.\d{1,3})?$/.test(quantity)) throw new Error('Quantité invalide.');
    return {
      id: storeId(line['id']),
      product: text(line['product']['name']),
      sku: text(line['product']['sku']),
      store: text(line['store']['name']),
      quantity,
      price: formatMoney(text(line['unitPrice'])),
      total: formatMoney(text(line['lineTotal'])),
    };
  });
  return { ...order, lines };
}
