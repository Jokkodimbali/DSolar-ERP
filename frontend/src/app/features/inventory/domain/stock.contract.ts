import { isRecord } from '../../../core/api/api-contract';
import { storeId } from '../../stores/domain/store.contract';

export interface StockBalance {
  storeId: string;
  productId: string;
  quantity: string;
  reserved: string;
  available: string;
}

export interface StockItem extends StockBalance {
  sku: string;
  name: string;
  unit: string;
}

export interface StockAdjustment {
  storeId: string;
  productId: string;
  direction: 'IN' | 'OUT';
  quantity: string;
  reason: string;
  operationKey: string;
}

export function quantityInput(value: string, positive = false): string {
  const normalized = value.trim().replace(',', '.');
  if (!/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(normalized) ||
      (positive && /^0(?:\.0+)?$/.test(normalized))) {
    throw new Error('Quantité invalide : trois décimales maximum, sans valeur négative.');
  }
  return normalized;
}

function quantity(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Quantité serveur invalide.');
  return quantityInput(value);
}

function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Donnée de stock invalide.');
  return value;
}

export function parseBalance(value: unknown, expectedStore: string, expectedProduct?: string): StockBalance {
  if (!isRecord(value) || value['storeId'] !== expectedStore ||
      (expectedProduct !== undefined && value['productId'] !== expectedProduct))
    throw new Error('Solde de stock incohérent.');
  return {
    storeId: storeId(value['storeId']),
    productId: storeId(value['productId']),
    quantity: quantity(value['quantity']),
    reserved: quantity(value['reserved']),
    available: quantity(value['available']),
  };
}

export function parseStock(value: unknown, id: string): StockItem[] {
  if (!Array.isArray(value)) throw new Error('Liste de stock invalide.');
  const items = value.map((row: unknown) => {
    if (!isRecord(row)) throw new Error('Référence de stock invalide.');
    return { ...parseBalance(row, id), sku: text(row['sku']), name: text(row['name']), unit: text(row['unit']) };
  });
  if (new Set(items.map((row) => row.productId)).size !== items.length)
    throw new Error('Référence de stock dupliquée.');
  return items;
}

export function isZero(value: string): boolean {
  return /^0(?:\.0+)?$/.test(value);
}

export function adjustmentInput(input: StockAdjustment): StockAdjustment {
  const reason = input.reason.trim();
  if (reason.length < 5 || reason.length > 500) throw new Error('Justification de 5 à 500 caractères obligatoire.');
  if (input.direction !== 'IN' && input.direction !== 'OUT') throw new Error('Sens de mouvement invalide.');
  return {
    storeId: storeId(input.storeId),
    productId: storeId(input.productId),
    direction: input.direction,
    quantity: quantityInput(input.quantity, true),
    reason,
    operationKey: storeId(input.operationKey),
  };
}
