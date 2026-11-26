import { isRecord } from '../../../core/api/api-contract';
import { parsePage } from '../../inventory/domain/workflow.contract';
import { storeId } from '../../stores/domain/store.contract';
import type { OrderDetail } from './order-view.contract';

export const invoiceLabels = { DRAFT: 'Brouillon', ISSUED: 'Émise', CANCELLED: 'Annulée' } as const;
export type InvoiceStatus = keyof typeof invoiceLabels;
export type InvoiceAction = 'issue' | 'cancel';

function invalid(): never {
  throw new Error('Données de facturation incohérentes.');
}
const record = (value: unknown) => (isRecord(value) ? value : invalid());
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : invalid());

function decimal(value: unknown, scale = 2, whole = 16): string {
  const raw = text(value);
  if (!new RegExp('^\\d{1,' + whole + '}(?:\\.\\d{1,' + scale + '})?$').test(raw)) return invalid();
  return raw;
}
function scaled(value: string, scale = 2): bigint {
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, '0'));
}

export function parseInvoice(value: unknown) {
  const row = record(value);
  const id = storeId(row['id']);
  const status = (Object.keys(invoiceLabels) as InvoiceStatus[]).find((key) => key === row['status']);
  const issuedAt = row['issuedAt'] === null ? null : text(row['issuedAt']);
  if (!status || (status === 'ISSUED') !== (issuedAt !== null) || (issuedAt && !Number.isFinite(Date.parse(issuedAt)))) return invalid();
  const totalHt = decimal(row['totalHt']);
  const totalTax = decimal(row['totalTax']);
  const totalTtc = decimal(row['totalTtc']);
  if (!Array.isArray(row['lines']) || !row['lines'].length || row['lines'].length > 100) return invalid();
  const lines = row['lines'].map((raw: unknown) => {
    const line = record(raw);
    if (line['invoiceId'] !== id) return invalid();
    const quantity = decimal(line['quantity'], 3, 15);
    const taxRate = decimal(line['taxRate'], 4, 3);
    const tax = decimal(line['taxAmount']);
    const total = decimal(line['lineTotal']);
    if (scaled(quantity, 3) === 0n || scaled(taxRate, 4) > 1000000n || scaled(tax) > scaled(total)) return invalid();
    return {
      id: storeId(line['id']),
      productId: storeId(line['productId']),
      quantity,
      unitPrice: decimal(line['unitPrice']),
      discount: decimal(line['discount']),
      taxRate,
      tax,
      total,
    };
  });
  if (
    new Set(lines.map((line) => line.id)).size !== lines.length ||
    scaled(totalHt) + scaled(totalTax) !== scaled(totalTtc) ||
    lines.reduce((sum, line) => sum + scaled(line.tax), 0n) !== scaled(totalTax) ||
    lines.reduce((sum, line) => sum + scaled(line.total), 0n) !== scaled(totalTtc)
  ) return invalid();
  return {
    id, number: text(row['number']), customerId: storeId(row['customerId']), orderId: storeId(row['orderId']),
    status, issuedAt, totalHt, totalTax, totalTtc, lines,
  };
}
export type Invoice = ReturnType<typeof parseInvoice>;

export function parseInvoicePage(value: unknown) {
  const page = parsePage(value, parseInvoice);
  if (page.items.length !== Math.min(page.limit, Math.max(0, page.total - (page.page - 1) * page.limit)) ||
    new Set(page.items.map((item) => item.id)).size !== page.items.length) return invalid();
  return page;
}
export function canInvoice(order: OrderDetail): boolean {
  return ['CONFIRMED', 'PARTIALLY_DELIVERED', 'DELIVERED'].includes(order.rawStatus);
}
export function verifyInvoiceOrder(invoice: Invoice, order: OrderDetail): Invoice {
  if (invoice.orderId !== order.id || invoice.customerId !== order.customerId ||
    scaled(invoice.totalTtc) !== scaled(order.rawTotal) || invoice.lines.length !== order.lines.length) return invalid();
  const keys = order.lines.map((line) => [line.productId, scaled(line.quantity, 3), scaled(line.rawPrice),
    scaled(line.rawDiscount), scaled(line.taxRate, 4), scaled(line.rawTotal)].join(':')).sort();
  const actual = invoice.lines.map((line) => [line.productId, scaled(line.quantity, 3), scaled(line.unitPrice),
    scaled(line.discount), scaled(line.taxRate, 4), scaled(line.total)].join(':')).sort();
  if (keys.some((key, index) => key !== actual[index])) return invalid();
  return invoice;
}
