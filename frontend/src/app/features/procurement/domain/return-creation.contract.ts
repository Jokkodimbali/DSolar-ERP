import { isRecord } from '../../../core/api/api-contract';
import { quantityInput } from '../../inventory/domain/stock.contract';
import { storeId } from '../../stores/domain/store.contract';
import type { SupplierReturn } from './supplier-return.contract';

function invalid(): never {
  throw new Error('Données de création du retour invalides.');
}
function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : invalid();
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) return invalid();
  return value.trim();
}
function milli(value: string): bigint {
  const [whole = '', fraction = ''] = quantityInput(value).split('.');
  return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
}
function quantity(value: unknown): string {
  if (typeof value !== 'string') return invalid();
  return quantityInput(value);
}

export function parseReturnOptions(value: unknown) {
  const row = record(value);
  if (!Array.isArray(row['lines'])) return invalid();
  const lines = row['lines'].map((raw: unknown) => {
    const line = record(raw);
    const remaining = quantity(line['remaining']);
    const available = quantity(line['available']);
    const maximum = quantity(line['maximum']);
    if (
      typeof line['serialized'] !== 'boolean' ||
      milli(maximum) !== (milli(remaining) < milli(available) ? milli(remaining) : milli(available))
    )
      return invalid();
    return {
      receiptLineId: storeId(line['receiptLineId']),
      productId: storeId(line['productId']),
      name: text(line['name'], 500),
      sku: text(line['sku'], 500),
      remaining,
      available,
      maximum,
      serialized: line['serialized'],
    };
  });
  if (
    !lines.length ||
    lines.length > 100 ||
    new Set(lines.map((line) => line.receiptLineId)).size !== lines.length
  )
    return invalid();
  return {
    receiptId: storeId(row['receiptId']),
    number: text(row['number'], 100),
    storeId: storeId(row['storeId']),
    lines,
  };
}
export type ReturnOptions = ReturnType<typeof parseReturnOptions>;

export interface ReturnCreation {
  receiptId: string;
  operationKey: string;
  reason: string;
  lines: { receiptLineId: string; quantity: string }[];
}
export function parseReturnCreation(value: unknown): ReturnCreation {
  const row = record(value);
  if (!Array.isArray(row['lines'])) return invalid();
  const lines = row['lines'].map((raw: unknown) => {
    const line = record(raw);
    if (typeof line['quantity'] !== 'string') return invalid();
    return { receiptLineId: storeId(line['receiptLineId']), quantity: quantityInput(line['quantity'], true) };
  });
  if (
    !lines.length ||
    lines.length > 100 ||
    new Set(lines.map((line) => line.receiptLineId)).size !== lines.length
  )
    return invalid();
  return {
    receiptId: storeId(row['receiptId']),
    operationKey: storeId(row['operationKey']),
    reason: text(row['reason'], 500),
    lines,
  };
}

export function returnCreation(
  options: ReturnOptions,
  quantities: Record<string, string>,
  reason: string,
  operationKey: string,
): ReturnCreation {
  const lines = Object.entries(quantities)
    .filter(([, value]) => value.trim())
    .map(([receiptLineId, value]) => {
      const line = options.lines.find((item) => item.receiptLineId === receiptLineId);
      const amount = quantityInput(value, true);
      if (!line || line.serialized || milli(amount) > milli(line.maximum))
        throw new Error('Quantité non disponible ou produit sérialisé.');
      return { receiptLineId, quantity: amount };
    });
  return parseReturnCreation({ receiptId: options.receiptId, operationKey, reason, lines });
}

export function matchesReturnCreation(item: SupplierReturn, input: ReturnCreation): boolean {
  return (
    item.receiptId === input.receiptId &&
    item.reason === input.reason &&
    item.lines.length === input.lines.length &&
    input.lines.every((line) =>
      item.lines.some(
        (actual) =>
          actual.receiptLineId === line.receiptLineId &&
          milli(actual.quantity) === milli(line.quantity) &&
          actual.serials.length === 0,
      ),
    )
  );
}

export function returnCreationStorageKey(actor: string): string {
  return 'dsolar.supplier-return.pending.v1:' + storeId(actor);
}
