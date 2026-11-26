import { isRecord } from '../../../core/api/api-contract';
import { parsePage } from '../../inventory/domain/workflow.contract';
import { storeId } from '../../stores/domain/store.contract';

export const proformaStatuses = ['DRAFT', 'ISSUED', 'ACCEPTED', 'CANCELLED', 'EXPIRED'] as const;
export type ProformaStatus = (typeof proformaStatuses)[number];
export type ProformaAction = 'issue' | 'accept' | 'cancel' | 'expire';
export const proformaLabels: Record<ProformaStatus, string> = {
  DRAFT: 'Brouillon',
  ISSUED: 'Émis',
  ACCEPTED: 'Accepté',
  CANCELLED: 'Annulé',
  EXPIRED: 'Expiré',
};
export const actionLabels: Record<ProformaAction, string> = {
  issue: 'Émettre le devis',
  accept: 'Accepter le devis',
  cancel: 'Annuler le devis',
  expire: 'Enregistrer l’expiration',
};
export const expectedStatus: Record<ProformaAction, ProformaStatus> = {
  issue: 'ISSUED',
  accept: 'ACCEPTED',
  cancel: 'CANCELLED',
  expire: 'EXPIRED',
};

function invalid(): never {
  throw new Error('Données de devis proforma invalides.');
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
function decimal(value: unknown, scale: number, whole: number): string {
  const result = text(value);
  if (!new RegExp('^\\d{1,' + whole + '}(?:\\.\\d{1,' + scale + '})?$').test(result)) return invalid();
  return result;
}
function cents(value: string): bigint {
  const [whole = '', fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

export function parseProforma(value: unknown) {
  const row = record(value);
  const id = storeId(row['id']);
  const status = proformaStatuses.find((item) => item === row['status']) ?? invalid();
  const total = decimal(row['total'], 2, 16);
  if (!Array.isArray(row['lines'])) return invalid();
  const lines = row['lines'].map((raw: unknown) => {
    const line = record(raw);
    const quantity = decimal(line['quantity'], 3, 15);
    const taxRate = decimal(line['taxRate'], 4, 3);
    if (line['proformaId'] !== id || !/[1-9]/.test(quantity) || Number(taxRate) > 100) return invalid();
    return {
      id: storeId(line['id']),
      productId: storeId(line['productId']),
      storeId: storeId(line['storeId']),
      quantity,
      unitPrice: decimal(line['unitPrice'], 2, 16),
      discount: decimal(line['discount'], 2, 16),
      taxRate,
      lineTotal: decimal(line['lineTotal'], 2, 16),
    };
  });
  if (
    !lines.length ||
    lines.length > 100 ||
    new Set(lines.map((line) => line.id)).size !== lines.length ||
    new Set(lines.map((line) => line.storeId + ':' + line.productId)).size !== lines.length ||
    lines.reduce((sum, line) => sum + cents(line.lineTotal), 0n) !== cents(total)
  )
    return invalid();
  return {
    id,
    number: text(row['number']),
    customerId: storeId(row['customerId']),
    status,
    createdAt: date(row['createdAt']),
    issuedAt: row['issuedAt'] === null ? null : date(row['issuedAt']),
    expiresAt: row['expiresAt'] === null ? null : date(row['expiresAt']),
    total,
    lines,
  };
}

export type Proforma = ReturnType<typeof parseProforma>;
export function parseProformaPage(value: unknown) {
  const page = parsePage(value, parseProforma);
  if (
    page.items.length !== Math.min(page.limit, Math.max(0, page.total - (page.page - 1) * page.limit)) ||
    new Set(page.items.map((item) => item.id)).size !== page.items.length
  )
    return invalid();
  return page;
}

export function proformaActions(item: Proforma, now = Date.now()): ProformaAction[] {
  const overdue = item.expiresAt !== null && Date.parse(item.expiresAt) <= now;
  switch (item.status) {
    case 'DRAFT':
      return overdue ? ['cancel'] : ['issue', 'cancel'];
    case 'ISSUED':
      return overdue ? ['expire'] : ['accept', 'cancel'];
    case 'EXPIRED':
      return ['expire'];
    default:
      return [];
  }
}
