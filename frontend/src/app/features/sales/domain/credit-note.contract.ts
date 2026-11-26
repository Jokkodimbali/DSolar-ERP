import { isRecord } from '../../../core/api/api-contract';
import { parsePage } from '../../inventory/domain/workflow.contract';
import { storeId } from '../../stores/domain/store.contract';
import type { Invoice } from './invoice.contract';
import { paymentCents } from './payment.contract';

function invalid(): never {
  throw new Error('Données d’avoir incohérentes.');
}
const record = (value: unknown) => (isRecord(value) ? value : invalid());
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : invalid());
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : invalid());
const amount = (value: unknown) => {
  const raw = text(value);
  paymentCents(raw);
  return raw;
};
function money(cents: bigint): string {
  if (cents < 0n) return invalid();
  return (cents / 100n).toString() + '.' + String(cents % 100n).padStart(2, '0');
}
export interface CreditLineInput { invoiceLineId: string; netAmount: string }
function inputs(value: unknown): CreditLineInput[] {
  const lines = array(value).map((raw) => {
    const row = record(raw);
    const netAmount = amount(row['netAmount']);
    if (paymentCents(netAmount) <= 0n) return invalid();
    return { invoiceLineId: storeId(row['invoiceLineId']), netAmount };
  });
  if (!lines.length || lines.length > 100 || new Set(lines.map((line) => line.invoiceLineId)).size !== lines.length) return invalid();
  return lines;
}
function detail(value: unknown) {
  const row = record(value);
  const total = amount(row['amount']);
  const netAmount = amount(row['netAmount']);
  const taxAmount = amount(row['taxAmount']);
  const lines = inputs(row['lines']).map((line) => {
    const original = array(row['lines']).map(record).find((item) => item['invoiceLineId'] === line.invoiceLineId);
    if (!original) return invalid();
    return { ...line, taxAmount: amount(original['taxAmount']) };
  });
  if (paymentCents(total) !== paymentCents(netAmount) + paymentCents(taxAmount) ||
    lines.reduce((sum, line) => sum + paymentCents(line.netAmount), 0n) !== paymentCents(netAmount) ||
    lines.reduce((sum, line) => sum + paymentCents(line.taxAmount), 0n) !== paymentCents(taxAmount)) return invalid();
  return { amount: total, netAmount, taxAmount, lines };
}
export function parseCreditNote(value: unknown, invoiceId: string) {
  const row = record(value);
  if (row['invoiceId'] !== invoiceId) return invalid();
  const id = storeId(row['id']);
  const issuedAt = row['issuedAt'] === null ? null : text(row['issuedAt']);
  if (issuedAt !== null && !Number.isFinite(Date.parse(issuedAt))) return invalid();
  const total = amount(row['amount']);
  if (paymentCents(total) <= 0n) return invalid();
  const lines = array(row['lines']);
  if (lines.some((line) => record(line)['creditNoteId'] !== id)) return invalid();
  const fiscal = lines.length ? detail(row) : null;
  if (!fiscal && (row['netAmount'] !== null || row['taxAmount'] !== null)) return invalid();
  return { id, invoiceId, number: text(row['number']), reason: text(row['reason']), issuedAt,
    amount: total, fiscal };
}
export type CreditNote = ReturnType<typeof parseCreditNote>;
export function parseCreditNotes(value: unknown, invoiceId: string): CreditNote[] {
  const notes = array(value).map((row) => parseCreditNote(row, invoiceId));
  if (new Set(notes.map((note) => note.id)).size !== notes.length) return invalid();
  return notes;
}
export function parseCreditPage(value: unknown) {
  const page = parsePage(value, (raw) => parseCreditNote(raw, storeId(record(raw)['invoiceId'])));
  if (page.items.length !== Math.min(page.limit, Math.max(0, page.total - (page.page - 1) * page.limit)) ||
    new Set(page.items.map((note) => note.id)).size !== page.items.length) return invalid();
  return page;
}
export function creditLines(invoice: Invoice, notes: CreditNote[]) {
  if (notes.some((note) => note.fiscal?.lines.some((line) => !invoice.lines.some((item) => item.id === line.invoiceLineId)))) return invalid();
  return invoice.lines.map((line) => {
    const prior = notes.flatMap((note) => note.fiscal?.lines ?? []).filter((item) => item.invoiceLineId === line.id);
    const net = paymentCents(line.total) - paymentCents(line.tax);
    const credited = prior.reduce((sum, item) => sum + paymentCents(item.netAmount), 0n);
    return { ...line, net: money(net), remainingNet: money(net - credited) };
  });
}
export function creditLineInput(invoice: Invoice, notes: CreditNote[], values: Record<string, string>) {
  if (invoice.status !== 'ISSUED' || notes.some((note) => !note.fiscal)) throw new Error('Historique sans ventilation : régularisation préalable requise.');
  const eligible = creditLines(invoice, notes);
  return inputs(Object.entries(values).filter(([, value]) => value.trim() && paymentCents(value.trim().replace(',', '.')) > 0n).map(([invoiceLineId, value]) => {
    const netAmount = value.trim().replace(',', '.');
    const line = eligible.find((item) => item.id === invoiceLineId);
    if (!line || paymentCents(netAmount) > paymentCents(line.remainingNet)) throw new Error('Montant HT supérieur au reliquat de la ligne.');
    return { invoiceLineId, netAmount };
  }));
}
export function parseCreditPreview(value: unknown, invoiceId: string, requested: CreditLineInput[]) {
  const row = record(value);
  const preview = detail(row);
  const available = amount(row['available']);
  if (row['invoiceId'] !== invoiceId || paymentCents(preview.amount) > paymentCents(available) ||
    preview.lines.length !== requested.length || !requested.every((line) => preview.lines.some((item) => item.invoiceLineId === line.invoiceLineId && paymentCents(item.netAmount) === paymentCents(line.netAmount)))) return invalid();
  return { ...preview, available };
}
export type CreditPreview = ReturnType<typeof parseCreditPreview>;
export interface CreditCommand { operationKey: string; amount: string; reason: string; lines: CreditLineInput[] }
export function parseCreditCommand(value: unknown): CreditCommand {
  const row = record(value);
  const operationKey = storeId(row['operationKey']);
  const reason = text(row['reason']).trim();
  const total = amount(row['amount']);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationKey) || reason.length < 10 || reason.length > 500 || paymentCents(total) <= 0n) return invalid();
  return { operationKey, reason, amount: total, lines: inputs(row['lines']) };
}
export function verifyIssuedCredit(value: unknown, invoiceId: string, command: CreditCommand) {
  const note = parseCreditNote(value, invoiceId);
  if (!note.issuedAt || !note.fiscal || note.number !== 'AV-' + command.operationKey.toUpperCase() ||
    note.reason !== command.reason || paymentCents(note.amount) !== paymentCents(command.amount) ||
    note.fiscal.lines.length !== command.lines.length ||
    !command.lines.every((line) => note.fiscal?.lines.some((item) => item.invoiceLineId === line.invoiceLineId && paymentCents(item.netAmount) === paymentCents(line.netAmount)))) return invalid();
  return note;
}
export function creditStorageKey(actorId: string, invoiceId: string) {
  return 'dsolar.credit.pending.v1:' + storeId(actorId) + ':' + storeId(invoiceId);
}
