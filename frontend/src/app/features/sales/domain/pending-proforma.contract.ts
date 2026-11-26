import { isRecord } from '../../../core/api/api-contract';
import { storeId } from '../../stores/domain/store.contract';
import { proformaInput, type LineDraft, type ProformaInput } from './proforma.contract';
import type { Proforma } from './proforma-view.contract';

export type PendingProforma = ProformaInput & { readonly number: string };

function invalid(): never {
  throw new Error('Demande de devis en attente invalide.');
}

export function parsePendingProforma(value: unknown): PendingProforma {
  if (
    !isRecord(value) ||
    typeof value['number'] !== 'string' ||
    !/^PF-[0-9A-F]{8}-(?:[0-9A-F]{4}-){3}[0-9A-F]{12}$/.test(value['number']) ||
    !Array.isArray(value['lines'])
  )
    return invalid();
  const lines: LineDraft[] = value['lines'].map((raw: unknown) => {
    if (!isRecord(raw)) return invalid();
    const numeric = (key: string): string => {
      const amount = raw[key];
      if (typeof amount !== 'number' || !Number.isFinite(amount)) return invalid();
      return String(amount);
    };
    return {
      productId: storeId(raw['productId']),
      storeId: storeId(raw['storeId']),
      quantity: numeric('quantity'),
      unitPrice: numeric('unitPrice'),
      discount: numeric('discount'),
      taxRate: numeric('taxRate'),
    };
  });
  const expiry = value['expiresAt'];
  if (expiry !== undefined && (typeof expiry !== 'string' || !Number.isFinite(Date.parse(expiry))))
    return invalid();
  return {
    ...proformaInput(storeId(value['customerId']), lines),
    number: value['number'],
    ...(expiry === undefined ? {} : { expiresAt: expiry }),
  };
}

function exactDecimal(left: string, right: number, scale: number): boolean {
  const scaled = (value: string): bigint => {
    const [whole = '0', fraction = ''] = value.split('.');
    return BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, '0'));
  };
  return scaled(left) === scaled(String(right));
}

export function matchesProforma(item: Proforma, input: ProformaInput): boolean {
  return (
    item.number === input.number &&
    item.customerId === input.customerId &&
    (item.expiresAt === null
      ? input.expiresAt === undefined
      : input.expiresAt !== undefined && Date.parse(item.expiresAt) === Date.parse(input.expiresAt)) &&
    item.lines.length === input.lines.length &&
    input.lines.every((line) =>
      item.lines.some(
        (actual) =>
          actual.productId === line.productId &&
          actual.storeId === line.storeId &&
          exactDecimal(actual.quantity, line.quantity, 3) &&
          exactDecimal(actual.unitPrice, line.unitPrice, 2) &&
          exactDecimal(actual.discount, line.discount, 2) &&
          exactDecimal(actual.taxRate, line.taxRate, 4),
      ),
    )
  );
}

export function proformaStorageKey(actor: string): string {
  return 'dsolar.proforma.pending.v1:' + storeId(actor);
}
