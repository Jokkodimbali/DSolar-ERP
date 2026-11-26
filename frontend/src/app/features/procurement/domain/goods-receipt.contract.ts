import { isRecord } from '../../../core/api/api-contract';
import { storeId } from '../../stores/domain/store.contract';
import { purchaseOrderInput, type PurchaseProgress } from './purchase-order.contract';

export const receiptStatuses = ['DRAFT', 'CONFIRMED', 'CANCELLED'] as const;
export type ReceiptStatus = (typeof receiptStatuses)[number];
export const receiptLabels: Record<ReceiptStatus, string> = {
  DRAFT: 'Brouillon',
  CONFIRMED: 'Réceptionnée',
  CANCELLED: 'Annulée',
};

function invalid(): never {
  throw new Error('Données de réception invalides.');
}
function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : invalid();
}
function count(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : invalid();
}
function decimal(value: unknown, scale: number): string {
  if (typeof value !== 'string' || !new RegExp('^\\d{1,18}(?:\\.\\d{1,' + scale + '})?$').test(value))
    return invalid();
  return value;
}
function milli(value: string): bigint {
  const [whole = '', fraction = ''] = decimal(value, 3).split('.');
  return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
}

export function parseGoodsReceipt(value: unknown) {
  const row = record(value);
  const id = storeId(row['id']);
  const status = receiptStatuses.find((item) => item === row['status']) ?? invalid();
  const number = row['number'];
  const receivedAt = row['receivedAt'];
  if (
    typeof number !== 'string' ||
    !number.trim() ||
    (receivedAt !== null && (typeof receivedAt !== 'string' || !Number.isFinite(Date.parse(receivedAt)))) ||
    (status === 'CONFIRMED') !== (receivedAt !== null) ||
    !Array.isArray(row['lines'])
  )
    return invalid();
  const lines = row['lines'].map((raw: unknown) => {
    const line = record(raw);
    const quantity = decimal(line['quantity'], 3);
    if (line['receiptId'] !== id || milli(quantity) <= 0n) return invalid();
    return {
      id: storeId(line['id']),
      productId: storeId(line['productId']),
      quantity,
      unitCost: decimal(line['unitCost'], 2),
    };
  });
  if (!lines.length || lines.length > 100 || new Set(lines.map((line) => line.productId)).size !== lines.length)
    return invalid();
  return {
    id,
    number,
    status,
    storeId: storeId(row['storeId']),
    purchaseOrderId: row['purchaseOrderId'] === null ? null : storeId(row['purchaseOrderId']),
    receivedAt,
    lines,
  };
}
export type GoodsReceipt = ReturnType<typeof parseGoodsReceipt>;

export function parseReceiptPage(value: unknown) {
  const row = record(value);
  const pagination = record(row['pagination']);
  const page = count(pagination['page']);
  const limit = count(pagination['limit']);
  const total = count(pagination['total']);
  const pages = count(pagination['pages']);
  if (!Array.isArray(row['items']) || page < 1 || limit < 1 || limit > 100 || pages !== Math.ceil(total / limit))
    return invalid();
  const items = row['items'].map(parseGoodsReceipt);
  if (items.length !== Math.min(limit, Math.max(0, total - (page - 1) * limit))) return invalid();
  return { items, page, limit, total, pages };
}
export interface ReceiptDraftLine {
  productId: string;
  quantity: string;
  unitCost: string;
}
export function receiptInput(
  number: string,
  purchaseOrderId: string,
  destination: string,
  lines: ReceiptDraftLine[],
  progress: PurchaseProgress,
) {
  if (progress.orderId !== purchaseOrderId || !['CONFIRMED', 'PARTIALLY_DELIVERED'].includes(progress.status))
    return invalid();
  const included = lines.filter((line) => line.quantity.trim() !== '');
  const input = purchaseOrderInput(number, purchaseOrderId, included);
  for (const line of included) {
    const available = progress.lines.find((item) => item.productId === line.productId);
    if (!available || milli(line.quantity.trim().replace(',', '.')) > milli(available.remaining))
      throw new Error('La quantité réceptionnée dépasse le reliquat de la commande.');
  }
  return { number: input.number, purchaseOrderId: input.supplierId, storeId: storeId(destination), lines: input.lines };
}
export type ReceiptInput = ReturnType<typeof receiptInput>;
