import { isRecord } from '../../../core/api/api-contract';
import { storeId } from '../../stores/domain/store.contract';
import { parsePage } from '../../inventory/domain/workflow.contract';

export const returnStatuses = ['DRAFT', 'CONFIRMED', 'CANCELLED'] as const;
export type ReturnStatus = (typeof returnStatuses)[number];
export const returnLabels: Record<ReturnStatus, string> = {
  DRAFT: 'Brouillon',
  CONFIRMED: 'Confirmé',
  CANCELLED: 'Annulé',
};

function invalid(): never {
  throw new Error('Données de retour fournisseur invalides.');
}
function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : invalid();
}
function text(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value : invalid();
}
function date(value: unknown): string {
  const result = text(value);
  return Number.isFinite(Date.parse(result)) ? result : invalid();
}
function decimal(value: unknown, scale: number): string {
  const result = text(value);
  if (!new RegExp('^\\d{1,18}(?:\\.\\d{1,' + scale + '})?$').test(result)) return invalid();
  return result;
}
function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : invalid();
}
function cents(value: string): bigint {
  const [whole = '', fraction = ''] = decimal(value, 2).split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

export function parseSupplierReturn(value: unknown) {
  const row = record(value);
  const id = storeId(row['id']);
  const receiptId = storeId(row['receiptId']);
  const receipt = record(row['receipt']);
  if (receipt['id'] !== receiptId) return invalid();
  const status = returnStatuses.find((item) => item === row['status']) ?? invalid();
  const total = decimal(row['total'], 2);
  const lines = array(row['lines']).map((raw) => {
    const line = record(raw);
    const quantity = decimal(line['quantity'], 3);
    if (line['returnId'] !== id || Number(quantity) <= 0) return invalid();
    const receiptLineId = storeId(line['receiptLineId']);
    const original = line['receiptLine'] === undefined ? null : record(line['receiptLine']);
    if (original && (original['id'] !== receiptLineId || original['receiptId'] !== receiptId))
      return invalid();
    const serials = array(line['serials']).map((rawSerial) => {
      const selection = record(rawSerial);
      const serialId = storeId(selection['serialId']);
      const serial = selection['serial'] === undefined ? null : record(selection['serial']);
      if (serial && serial['id'] !== serialId) return invalid();
      return { id: serialId, number: serial ? text(serial['serial']) : null };
    });
    return {
      id: storeId(line['id']),
      receiptLineId,
      productId: original ? storeId(original['productId']) : null,
      quantity,
      unitCost: decimal(line['unitCost'], 2),
      total: decimal(line['total'], 2),
      serials,
    };
  });
  if (
    !lines.length ||
    lines.length > 100 ||
    new Set(lines.map((line) => line.receiptLineId)).size !== lines.length ||
    lines.reduce((sum, line) => sum + cents(line.total), 0n) !== cents(total)
  )
    return invalid();
  const credit = row['credit'] === null ? null : record(row['credit']);
  if (
    credit &&
    (credit['returnId'] !== id ||
      status !== 'CONFIRMED' ||
      cents(decimal(credit['amount'], 2)) !== cents(total))
  )
    return invalid();
  return {
    id,
    receiptId,
    receiptNumber: text(receipt['number']),
    storeId: storeId(receipt['storeId']),
    reason: text(row['reason']),
    status,
    total,
    createdAt: date(row['createdAt']),
    lines,
    credit: credit ? { reference: text(credit['reference']), amount: decimal(credit['amount'], 2) } : null,
  };
}

export type SupplierReturn = ReturnType<typeof parseSupplierReturn>;

export function parseSupplierReturnPage(value: unknown) {
  const page = parsePage(value, parseSupplierReturn);
  if (page.items.length !== Math.min(page.limit, Math.max(0, page.total - (page.page - 1) * page.limit)))
    return invalid();
  return page;
}

export type ReturnAction =
  | { kind: 'confirm' }
  | { kind: 'cancel'; reason: string }
  | { kind: 'credit'; reference: string };

export function returnAction(item: SupplierReturn, kind: ReturnAction['kind'], value = ''): ReturnAction {
  if (kind === 'confirm' && item.status === 'DRAFT') return { kind };
  const normalized = value.trim();
  if (kind === 'cancel' && item.status === 'DRAFT' && normalized.length > 0 && normalized.length <= 500)
    return { kind, reason: normalized };
  if (
    kind === 'credit' &&
    item.status === 'CONFIRMED' &&
    !item.credit &&
    cents(item.total) > 0n &&
    normalized.length > 0 &&
    normalized.length <= 100
  )
    return { kind, reference: normalized };
  throw new Error('Action, statut ou texte invalide pour ce retour.');
}

export function matchesReturnAction(item: SupplierReturn, action: ReturnAction): boolean {
  switch (action.kind) {
    case 'confirm':
      return item.status === 'CONFIRMED';
    case 'cancel':
      return item.status === 'CANCELLED';
    case 'credit':
      return item.status === 'CONFIRMED' && item.credit?.reference === action.reference;
  }
}
