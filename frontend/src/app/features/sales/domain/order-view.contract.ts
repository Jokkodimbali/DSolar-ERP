import { isRecord } from '../../../core/api/api-contract';
import { parseRecentOrders } from '../../dashboard/domain/dashboard-operations.contract';
import { formatMoney } from '../../dashboard/domain/dashboard.contract';
import { parsePage } from '../../inventory/domain/workflow.contract';
import { storeId } from '../../stores/domain/store.contract';

export const orderStatusLabels = {
  DRAFT: 'Brouillon',
  CONFIRMED: 'Confirmée',
  PARTIALLY_DELIVERED: 'Partiellement livrée',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
} as const;
export type OrderStatus = keyof typeof orderStatusLabels;
export type OrderAction = 'confirm' | 'cancel';

function invalid(): never {
  throw new Error('Données de commande invalides.');
}
function text(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value : invalid();
}
function decimal(value: unknown, scale: number, whole: number): string {
  const result = text(value);
  if (!new RegExp('^\\d{1,' + whole + '}(?:\\.\\d{1,' + scale + '})?$').test(result)) return invalid();
  return result;
}
function cents(value: string): bigint {
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
function summary(value: unknown) {
  if (!isRecord(value)) return invalid();
  const status = (Object.keys(orderStatusLabels) as OrderStatus[]).find((key) => key === value['status']);
  const display = parseRecentOrders({ items: [value] })[0];
  if (!status || !display) return invalid();
  return { ...display, rawStatus: status };
}
export function parseOrderPage(value: unknown) {
  const page = parsePage(value, summary);
  if (
    page.items.length !== Math.min(page.limit, Math.max(0, page.total - (page.page - 1) * page.limit)) ||
    new Set(page.items.map((item) => item.id)).size !== page.items.length
  )
    return invalid();
  return page;
}

export function parseOrderDetail(value: unknown, id: string) {
  if (!isRecord(value) || value['id'] !== id || !Array.isArray(value['lines'])) return invalid();
  const order = summary(value);
  const total = decimal(value['total'], 2, 16);
  const lines = value['lines'].map((line: unknown) => {
    if (!isRecord(line) || line['orderId'] !== id || !isRecord(line['product']) || !isRecord(line['store']))
      return invalid();
    const quantity = decimal(line['quantity'], 3, 15);
    const rawTotal = decimal(line['lineTotal'], 2, 16);
    const taxRate = decimal(line['taxRate'], 4, 3);
    if (!/[1-9]/.test(quantity) || Number(taxRate) > 100) return invalid();
    return {
      id: storeId(line['id']),
      productId: storeId(line['productId']),
      product: text(line['product']['name']),
      sku: text(line['product']['sku']),
      store: text(line['store']['name']),
      quantity,
      price: formatMoney(decimal(line['unitPrice'], 2, 16)),
      rawPrice: decimal(line['unitPrice'], 2, 16),
      discount: formatMoney(decimal(line['discount'], 2, 16)),
      rawDiscount: decimal(line['discount'], 2, 16),
      taxRate,
      total: formatMoney(rawTotal),
      rawTotal,
    };
  });
  if (
    !lines.length ||
    new Set(lines.map((line) => line.id)).size !== lines.length ||
    lines.reduce((sum, line) => sum + cents(line.rawTotal), 0n) !== cents(total)
  )
    return invalid();
  return {
    ...order,
    customerId: storeId(value['customerId']),
    rawTotal: total,
    proformaId: value['proformaId'] === null ? null : storeId(value['proformaId']),
    lines,
  };
}

export type OrderDetail = ReturnType<typeof parseOrderDetail>;
export function orderActions(status: OrderStatus): readonly OrderAction[] {
  if (status === 'DRAFT') return ['confirm', 'cancel'];
  if (status === 'CONFIRMED') return ['cancel'];
  return [];
}
export function matchesOrderAction(order: OrderDetail, id: string, action: OrderAction): boolean {
  return order.id === id && order.rawStatus === (action === 'confirm' ? 'CONFIRMED' : 'CANCELLED');
}
