import { isRecord } from '../../../core/api/api-contract';
import { quantityInput } from '../../inventory/domain/stock.contract';
import { parsePage } from '../../inventory/domain/workflow.contract';
import { storeId } from '../../stores/domain/store.contract';
import { orderStatusLabels, type OrderStatus } from './order-view.contract';

const invalid = (): never => {
  throw new Error('Données de livraison incohérentes.');
};
const record = (value: unknown) => (isRecord(value) ? value : invalid());
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : invalid());
const quantity = (value: unknown, positive = false) => quantityInput(text(value), positive);
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : invalid());

function milli(value: string): bigint {
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
}

export function deliveryKey(line: { storeId: string; productId: string }): string {
  return line.storeId + ':' + line.productId;
}

export function parseDeliveryProgress(value: unknown, orderId: string) {
  const row = record(value);
  const status = (Object.keys(orderStatusLabels) as OrderStatus[]).find((key) => key === row['status']);
  if (row['orderId'] !== orderId || !status) return invalid();
  const lines = array(row['lines']).map((raw) => {
    const line = record(raw);
    const ordered = quantity(line['quantity'], true);
    const delivered = quantity(line['delivered']);
    const remaining = quantity(line['remaining']);
    if (milli(ordered) !== milli(delivered) + milli(remaining)) return invalid();
    return {
      storeId: storeId(line['storeId']),
      productId: storeId(line['productId']),
      store: text(line['store']),
      product: text(line['product']),
      sku: text(line['sku']),
      ordered,
      delivered,
      remaining,
    };
  });
  if (!lines.length || new Set(lines.map(deliveryKey)).size !== lines.length) return invalid();
  return { orderId, status, lines };
}
export type DeliveryProgress = ReturnType<typeof parseDeliveryProgress>;

export const deliveryLabels = { DRAFT: 'Brouillon', CONFIRMED: 'Confirmé', CANCELLED: 'Annulé' } as const;
export type DeliveryStatus = keyof typeof deliveryLabels;
export type DeliveryAction = 'confirm' | 'cancel';

export function parseDelivery(value: unknown, orderId: string) {
  const row = record(value);
  const id = storeId(row['id']);
  const status = (Object.keys(deliveryLabels) as DeliveryStatus[]).find((key) => key === row['status']);
  if (row['orderId'] !== orderId || !status) return invalid();
  const deliveredAt = row['deliveredAt'] === null ? null : text(row['deliveredAt']);
  if (
    (status === 'CONFIRMED') !== (deliveredAt !== null) ||
    (deliveredAt !== null && !Number.isFinite(Date.parse(deliveredAt)))
  )
    return invalid();
  const lines = array(row['lines']).map((raw) => {
    const line = record(raw);
    if (line['deliveryId'] !== id) return invalid();
    return {
      id: storeId(line['id']),
      storeId: storeId(line['storeId']),
      productId: storeId(line['productId']),
      quantity: quantity(line['quantity'], true),
    };
  });
  if (!lines.length || new Set(lines.map((line) => line.id)).size !== lines.length) return invalid();
  return { id, orderId, number: text(row['number']), status, deliveredAt, lines };
}
export type Delivery = ReturnType<typeof parseDelivery>;

export function parseDeliveryPage(value: unknown, orderId: string) {
  const page = parsePage(value, (row) => parseDelivery(row, orderId));
  if (
    page.items.length !== Math.min(page.limit, Math.max(0, page.total - (page.page - 1) * page.limit)) ||
    new Set(page.items.map((item) => item.id)).size !== page.items.length
  )
    return invalid();
  return page;
}
export interface DeliveryInput {
  operationKey: string;
  lines: { storeId: string; productId: string; quantity: string }[];
}
export function parseDeliveryInput(value: unknown): DeliveryInput {
  const row = record(value);
  const operationKey = storeId(row['operationKey']);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationKey))
    return invalid();
  const lines = array(row['lines']).map((raw) => {
    const line = record(raw);
    return {
      storeId: storeId(line['storeId']),
      productId: storeId(line['productId']),
      quantity: quantity(line['quantity'], true),
    };
  });
  if (!lines.length || lines.length > 100 || new Set(lines.map(deliveryKey)).size !== lines.length)
    return invalid();
  return { operationKey, lines };
}
export function deliveryInput(
  progress: DeliveryProgress,
  values: Record<string, string>,
  operationKey: string,
): DeliveryInput {
  if (!['CONFIRMED', 'PARTIALLY_DELIVERED'].includes(progress.status)) return invalid();
  const lines = Object.entries(values)
    .filter(([, value]) => value.trim() && milli(quantityInput(value)) > 0n)
    .map(([key, value]) => {
      const line = progress.lines.find((item) => deliveryKey(item) === key);
      const amount = quantityInput(value, true);
      if (!line || milli(amount) > milli(line.remaining))
        throw new Error('Quantité supérieure au reliquat de commande.');
      return { storeId: line.storeId, productId: line.productId, quantity: amount };
    });
  return parseDeliveryInput({ operationKey, lines });
}
export function matchesDelivery(note: Delivery, input: DeliveryInput): boolean {
  return (
    note.number === 'BL-' + input.operationKey.toUpperCase() &&
    note.lines.length === input.lines.length &&
    new Set(note.lines.map(deliveryKey)).size === note.lines.length &&
    input.lines.every((line) =>
      note.lines.some(
        (saved) => deliveryKey(saved) === deliveryKey(line) && milli(saved.quantity) === milli(line.quantity),
      ),
    )
  );
}
export function deliveryStorageKey(actor: string, orderId: string): string {
  return 'dsolar.delivery.pending.v1:' + storeId(actor) + ':' + storeId(orderId);
}
