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
  if (!/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(normalized) || (positive && /^0(?:\.0+)?$/.test(normalized))) {
    throw new Error('Quantité invalide : trois décimales maximum, sans valeur négative.');
  }
  return normalized;
}

function quantity(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Quantité serveur invalide.');
  return quantityInput(value);
}

function signedQuantity(value: unknown): string {
  if (typeof value !== 'string' || !/^-?(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(value))
    throw new Error('Quantité serveur invalide.');
  return value;
}

function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Donnée de stock invalide.');
  return value;
}

export function parseBalance(value: unknown, expectedStore: string, expectedProduct?: string): StockBalance {
  if (
    !isRecord(value) ||
    value['storeId'] !== expectedStore ||
    (expectedProduct !== undefined && value['productId'] !== expectedProduct)
  )
    throw new Error('Solde de stock incohérent.');
  return {
    storeId: storeId(value['storeId']),
    productId: storeId(value['productId']),
    quantity: quantity(value['quantity']),
    reserved: quantity(value['reserved']),
    available: signedQuantity(value['available']),
  };
}

export function parseStock(value: unknown, id: string): StockItem[] {
  if (!Array.isArray(value)) throw new Error('Liste de stock invalide.');
  const items = value.map((row: unknown) => {
    if (!isRecord(row)) throw new Error('Référence de stock invalide.');
    return {
      ...parseBalance(row, id),
      sku: text(row['sku']),
      name: text(row['name']),
      unit: text(row['unit']),
    };
  });
  if (new Set(items.map((row) => row.productId)).size !== items.length)
    throw new Error('Référence de stock dupliquée.');
  return items;
}

export function unavailable(value: string): boolean {
  return value.startsWith('-') || isZero(value);
}

export function isZero(value: string): boolean {
  return /^0(?:\.0+)?$/.test(value);
}

export function adjustmentInput(input: StockAdjustment): StockAdjustment {
  const reason = input.reason.trim();
  if (reason.length < 5 || reason.length > 500)
    throw new Error('Justification de 5 à 500 caractères obligatoire.');
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

const movementLabels: Record<string, string> = {
  RECEIPT: 'Réception',
  DELIVERY: 'Livraison',
  TRANSFER_OUT: 'Transfert sortant',
  TRANSFER_IN: 'Transfert entrant',
  INVENTORY_ADJUSTMENT: 'Ajustement',
  RETURN_IN: 'Retour entrant',
  RETURN_OUT: 'Retour sortant',
  SITE_CONSUMPTION: 'Consommation chantier',
  DAMAGE: 'Dommage',
  LOSS: 'Perte',
};

export function parseMovements(value: unknown, id: string) {
  if (!isRecord(value) || !isRecord(value['pagination']) || !Array.isArray(value['items']))
    throw new Error('Journal invalide.');
  const count = (raw: unknown): number => {
    if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 0)
      throw new Error('Pagination invalide.');
    return raw;
  };
  const { page, limit, total, pages } = value['pagination'];
  const pagination = { page: count(page), limit: count(limit), total: count(total), pages: count(pages) };
  if (
    pagination.page < 1 ||
    pagination.limit < 1 ||
    pagination.limit > 100 ||
    pagination.pages !== Math.ceil(pagination.total / pagination.limit) ||
    value['items'].length > pagination.limit
  )
    throw new Error('Pagination incohérente.');
  const items = value['items'].map((row: unknown) => {
    if (
      !isRecord(row) ||
      row['storeId'] !== id ||
      (row['reason'] !== null && typeof row['reason'] !== 'string')
    )
      throw new Error('Mouvement invalide.');
    const type = text(row['type']);
    const createdAt = text(row['createdAt']);
    if (!Object.hasOwn(movementLabels, type) || !Number.isFinite(Date.parse(createdAt)))
      throw new Error('Mouvement invalide.');
    return {
      id: storeId(row['id']),
      productId: storeId(row['productId']),
      name: text(row['name']),
      sku: text(row['sku']),
      unit: text(row['unit']),
      quantity: signedQuantity(row['quantity']),
      type: movementLabels[type],
      reason: row['reason'],
      referenceType: text(row['referenceType']),
      createdAt,
    };
  });
  return { ...pagination, items };
}

export function parseStockPage(value: unknown, id: string) {
  if (!isRecord(value) || !isRecord(value['pagination'])) throw new Error('Pagination du stock invalide.');
  const count = (raw: unknown): number => {
    if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 0)
      throw new Error('Pagination invalide.');
    return raw;
  };
  const pagination = value['pagination'];
  const page = count(pagination['page']),
    limit = count(pagination['limit']),
    total = count(pagination['total']),
    pages = count(pagination['pages']);
  const items = parseStock(value['items'], id);
  if (page < 1 || limit < 1 || limit > 100 || pages !== Math.ceil(total / limit) || items.length > limit)
    throw new Error('Pagination incohérente.');
  return { items, page, pages, total };
}

export function parseStockSummary(value: unknown, id: string) {
  if (!isRecord(value) || value['storeId'] !== id) throw new Error('Synthèse du stock invalide.');
  const count = (raw: unknown): number => {
    if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 0)
      throw new Error('Compteur invalide.');
    return raw;
  };
  const products = count(value['products']),
    empty = count(value['outOfStock']),
    reserved = count(value['reservedProducts']);
  if (empty > products || reserved > products) throw new Error('Compteurs de stock incohérents.');
  return { products, empty, available: products - empty, reserved };
}

export function parsePendingAdjustment(value: unknown): StockAdjustment {
  if (!isRecord(value) || (value['direction'] !== 'IN' && value['direction'] !== 'OUT'))
    throw new Error('Ajustement conservé invalide.');
  return adjustmentInput({
    storeId: storeId(value['storeId']),
    productId: storeId(value['productId']),
    operationKey: storeId(value['operationKey']),
    direction: value['direction'],
    quantity: text(value['quantity']),
    reason: text(value['reason']),
  });
}
