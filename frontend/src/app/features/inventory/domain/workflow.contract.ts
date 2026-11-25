import { isRecord } from '../../../core/api/api-contract';
import { storeId } from '../../stores/domain/store.contract';
import { quantityInput } from './stock.contract';

const invalid = (): never => {
  throw new Error('Données de stock invalides.');
};
const text = (value: unknown): string => (typeof value === 'string' && value.trim() ? value : invalid());
const date = (value: unknown): string => {
  const raw = text(value);
  return Number.isFinite(Date.parse(raw)) ? raw : invalid();
};
const quantity = (value: unknown): string => quantityInput(text(value));
const record = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : invalid());
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : invalid());
const count = (value: unknown): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : invalid();
const transferStatuses = [
  'DRAFT',
  'APPROVED',
  'SHIPPED',
  'RECEIVED',
  'CLOSED_WITH_DISCREPANCY',
  'CANCELLED',
] as const;
const countStatuses = ['DRAFT', 'VALIDATED', 'CANCELLED'] as const;
export const labels: Record<string, string> = {
  DRAFT: 'Brouillon',
  APPROVED: 'Approuvé',
  SHIPPED: 'Expédié',
  RECEIVED: 'Réceptionné',
  CLOSED_WITH_DISCREPANCY: 'Clôturé avec écarts',
  CANCELLED: 'Annulé',
  VALIDATED: 'Validé',
  CREATED: 'Création',
  RECEIPT: 'Réception',
};
function status<T extends string>(value: unknown, allowed: readonly T[]): T {
  const match = allowed.find((item) => item === value);
  return match ?? invalid();
}
export function parseTransfer(value: unknown) {
  const row = record(value);
  return {
    id: storeId(row['id']),
    number: text(row['number']),
    status: status(row['status'], transferStatuses),
    originId: storeId(row['originId']),
    destinationId: storeId(row['destinationId']),
    origin: text(record(row['origin'])['name']),
    originStatus: status(record(row['origin'])['status'], ['ACTIVE', 'INACTIVE'] as const),
    destination: text(record(row['destination'])['name']),
    destinationStatus: status(record(row['destination'])['status'], ['ACTIVE', 'INACTIVE'] as const),
    createdAt: date(row['createdAt']),
  };
}
export function parseTransferDetail(value: unknown) {
  const row = record(value);
  return {
    ...parseTransfer(row),
    lines: array(row['lines']).map((raw) => {
      const line = record(raw);
      const product = record(line['product']);
      return {
        id: storeId(line['id']),
        productId: storeId(line['productId']),
        name: text(product['name']),
        sku: text(product['sku']),
        unit: text(product['unit']),
        quantity: quantity(line['quantity']),
        received: quantity(line['receivedQuantity']),
        damaged: quantity(line['damagedQuantity']),
        missing: quantity(line['missingQuantity']),
      };
    }),
    events: array(row['events']).map((raw) => {
      const event = record(raw);
      return { id: storeId(event['id']), action: text(event['action']), createdAt: date(event['createdAt']) };
    }),
  };
}
export function parseCount(value: unknown) {
  const row = record(value);
  return {
    id: storeId(row['id']),
    storeId: storeId(row['storeId']),
    status: status(row['status'], countStatuses),
    startedAt: date(row['startedAt']),
    validatedAt: row['validatedAt'] === null ? null : date(row['validatedAt']),
  };
}
export function parseCountDetail(value: unknown) {
  const row = record(value);
  return {
    ...parseCount(row),
    lines: array(row['lines']).map((raw) => {
      const line = record(raw);
      const product = record(line['product']);
      return {
        productId: storeId(line['productId']),
        name: text(product['name']),
        sku: text(product['sku']),
        unit: text(product['unit']),
        expected: quantity(line['expected']),
        counted: line['counted'] === null ? null : quantity(line['counted']),
        reason: line['reason'] === null ? '' : text(line['reason']),
      };
    }),
  };
}
export function parsePage<T>(value: unknown, parse: (row: unknown) => T) {
  const row = record(value);
  const p = record(row['pagination']);
  const page = count(p['page']),
    limit = count(p['limit']),
    total = count(p['total']),
    pages = count(p['pages']);
  const items = array(row['items']).map(parse);
  if (page < 1 || limit < 1 || limit > 100 || pages !== Math.ceil(total / limit) || items.length > limit)
    return invalid();
  return { page, limit, total, pages, items };
}
export function parseId(value: unknown): string {
  return storeId(record(value)['id']);
}
export type Transfer = ReturnType<typeof parseTransferDetail>;
export type CountSession = ReturnType<typeof parseCountDetail>;
export interface TransferInput {
  number: string;
  originId: string;
  destinationId: string;
  lines: { productId: string; quantity: string }[];
}
export interface ReceiptInput {
  operationKey: string;
  finalize: boolean;
  lines: { lineId: string; received: string; damaged: string; missing: string }[];
}
export interface CountInput {
  productId: string;
  counted: string;
  reason?: string;
}

export function parsePendingReceipt(value: unknown): ReceiptInput {
  const row = record(value);
  if (typeof row['finalize'] !== 'boolean') return invalid();
  const lines = array(row['lines']).map((raw) => {
    const line = record(raw);
    return {
      lineId: storeId(line['lineId']),
      received: quantity(line['received']),
      damaged: quantity(line['damaged']),
      missing: quantity(line['missing']),
    };
  });
  if (!lines.length || lines.length > 100 || new Set(lines.map((line) => line.lineId)).size !== lines.length) return invalid();
  return { operationKey: storeId(row['operationKey']), finalize: row['finalize'], lines };
}
