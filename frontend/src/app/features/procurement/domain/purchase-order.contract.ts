import { isRecord } from '../../../core/api/api-contract';
import { parseSupplier, supplierId } from './supplier.contract';

export const purchaseStatuses = ['DRAFT', 'CONFIRMED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'CANCELLED'] as const;
export type PurchaseStatus = (typeof purchaseStatuses)[number];
export const purchaseStatusLabels: Record<PurchaseStatus, string> = {
  DRAFT: 'Brouillon',
  CONFIRMED: 'Confirmée',
  PARTIALLY_DELIVERED: 'Partiellement réceptionnée',
  DELIVERED: 'Réceptionnée',
  CANCELLED: 'Annulée',
};

function invalid(): never {
  throw new Error('Données de commande fournisseur invalides.');
}
function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : invalid();
}
function text(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value : invalid();
}
function rows(value: unknown): unknown[] {
  return Array.isArray(value) ? value : invalid();
}
function count(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : invalid();
}
function status(value: unknown): PurchaseStatus {
  return purchaseStatuses.find((item) => item === value) ?? invalid();
}
function decimal(value: unknown, scale: number): string {
  const raw = text(value);
  if (!new RegExp('^\\d{1,18}(?:\\.\\d{1,' + scale + '})?$').test(raw)) return invalid();
  return raw;
}
export function parsePurchaseOrder(value: unknown) {
  const row = record(value);
  const supplier = parseSupplier(row['supplier']);
  const id = supplierId(row['id']);
  const orderedAt = text(row['orderedAt']);
  if (!Number.isFinite(Date.parse(orderedAt)) || supplier.id !== row['supplierId']) return invalid();
  const lines = rows(row['lines']).map((raw) => {
    const line = record(raw);
    const quantity = decimal(line['quantity'], 3);
    if (Number(quantity) <= 0 || line['orderId'] !== id) return invalid();
    return {
      id: supplierId(line['id']),
      productId: supplierId(line['productId']),
      quantity,
      unitCost: decimal(line['unitCost'], 2),
    };
  });
  if (!lines.length || lines.length > 100 || new Set(lines.map((line) => line.productId)).size !== lines.length)
    return invalid();
  return { id, supplier, number: text(row['number']), orderedAt, status: status(row['status']), lines };
}
export type PurchaseOrder = ReturnType<typeof parsePurchaseOrder>;

export function parsePurchaseOrderPage(value: unknown) {
  const row = record(value);
  const p = record(row['pagination']);
  const page = count(p['page']);
  const limit = count(p['limit']);
  const total = count(p['total']);
  const pages = count(p['pages']);
  const items = rows(row['items']).map(parsePurchaseOrder);
  if (page < 1 || limit < 1 || limit > 100 || pages !== Math.ceil(total / limit)) return invalid();
  if (items.length !== Math.min(limit, Math.max(0, total - (page - 1) * limit))) return invalid();
  return { page, limit, total, pages, items };
}

export function parsePurchaseProgress(value: unknown) {
  const row = record(value);
  const lines = rows(row['lines']).map((raw) => {
    const line = record(raw);
    if (typeof line['complete'] !== 'boolean') return invalid();
    return {
      productId: supplierId(line['productId']),
      ordered: decimal(line['orderedQuantity'], 3),
      received: decimal(line['receivedQuantity'], 3),
      remaining: decimal(line['remainingQuantity'], 3),
      complete: line['complete'],
    };
  });
  if (count(row['totalLines']) !== lines.length || count(row['completedLines']) !== lines.filter((l) => l.complete).length)
    return invalid();
  if (count(row['pendingLines']) !== lines.filter((l) => !l.complete).length) return invalid();
  return {
    orderId: supplierId(row['orderId']),
    status: status(row['status']),
    lines,
  };
}
export type PurchaseProgress = ReturnType<typeof parsePurchaseProgress>;

export interface PurchaseDraftLine {
  productId: string;
  quantity: string;
  unitCost: string;
}
export function purchaseOrderInput(number: string, supplier: string, lines: PurchaseDraftLine[]) {
  const reference = number.trim().toUpperCase();
  if (!reference || reference.length > 100 || !lines.length || lines.length > 100) return invalid();
  const numeric = (value: string, scale: number, positive: boolean): number => {
    const raw = value.trim().replace(',', '.');
    // L'API existante reçoit des nombres JSON ; borner à 12 chiffres entiers
    // pour conserver la précision des quantités et des coûts.
    if (!new RegExp('^\\d{1,12}(?:\\.\\d{1,' + scale + '})?$').test(raw)) return invalid();
    const result = Number(raw);
    if (!Number.isFinite(result) || (positive && result <= 0)) return invalid();
    return result;
  };
  if (new Set(lines.map((line) => line.productId)).size !== lines.length) return invalid();
  return {
    number: reference,
    supplierId: supplierId(supplier),
    lines: lines.map((line) => ({
      productId: supplierId(line.productId),
      quantity: numeric(line.quantity, 3, true),
      unitCost: numeric(line.unitCost, 2, false),
    })),
  };
}
export type PurchaseOrderInput = ReturnType<typeof purchaseOrderInput>;
