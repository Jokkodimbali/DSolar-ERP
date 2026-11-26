import { isRecord } from '../../../../core/api/api-contract';
import { parsePage } from '../../../inventory/domain/workflow.contract';
import { storeId } from '../../../stores/domain/store.contract';
import { cashAmount, cents } from '../../../treasury/domain/treasury.contract';

function invalid(): never { throw new Error('Données bancaires incohérentes.'); }
const record = (value: unknown) => isRecord(value) ? value : invalid();
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : invalid();
function text(value: unknown, max = 500): string {
  return typeof value === 'string' && value.trim() && value.length <= max ? value : invalid();
}
function integer(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : invalid();
}
function flag(value: unknown): boolean { return typeof value === 'boolean' ? value : invalid(); }
export function calendar(value: unknown): string {
  const raw = text(value, 24);
  const day = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) ||
    new Date(day).toISOString().slice(0, 10) !== day || (raw !== day && raw !== day + 'T00:00:00.000Z')) return invalid();
  return day;
}
function date(value: unknown): string {
  const raw = text(value, 40);
  return Number.isFinite(Date.parse(raw)) ? raw : invalid();
}
const optionalId = (value: unknown) => value === null ? null : storeId(value);
function unique<T extends { id: string }>(items: T[]) {
  if (new Set(items.map((item) => item.id)).size !== items.length) return invalid();
  return items;
}
function account(value: unknown) {
  const row = record(value);
  return { id: storeId(row['id']), code: text(row['code'], 30), name: text(row['name'], 160) };
}
export function parseAssetAccounts(value: unknown) {
  return unique(array(record(value)['accounts']).map((raw) => {
    const row = record(raw);
    return { ...account(raw), category: row['classification'] === null ? null : record(row['classification'])['category'] };
  })).filter((item) => item.category === 'ASSET');
}
export function parseBankAccount(value: unknown) {
  const row = record(value);
  return { id: storeId(row['id']), accountId: storeId(row['accountId']), name: text(row['name'], 160) };
}
export function parseBankAccounts(value: unknown) {
  return unique(array(value).map((raw) => {
    const row = record(raw);
    const bank = parseBankAccount(raw);
    const ledger = account(row['account']);
    if (ledger.id !== bank.accountId) return invalid();
    return { ...bank, ledger };
  }));
}
export type BankAccount = ReturnType<typeof parseBankAccounts>[number];
export function parseStatement(value: unknown, bankId: string) {
  const row = record(value);
  const start = calendar(row['startsAt']);
  const end = calendar(row['endsAt']);
  if (row['bankAccountId'] !== bankId || start > end) return invalid();
  return { id: storeId(row['id']), bankId, reference: text(row['reference'], 100), start, end,
    opening: cashAmount(row['opening'], true), closing: cashAmount(row['closing'], true),
    closedAt: row['closedAt'] === null ? null : date(row['closedAt']) };
}
export type Statement = ReturnType<typeof parseStatement>;
export function parseStatements(value: unknown, bankId: string) {
  return unique(array(value).map((item) => parseStatement(item, bankId)));
}
export function parseStatementPage(value: unknown, bankId: string) {
  const page = parsePage(value, (raw) => parseStatement(raw, bankId));
  unique(page.items);
  if (page.items.length !== Math.min(page.limit, Math.max(0, page.total - (page.page - 1) * page.limit))) return invalid();
  return page;
}
export interface BankLineInput { reference: string; date: string; description: string; amount: string }
export interface StatementInput {
  bankAccountId: string; reference: string; start: string; end: string;
  opening: string; closing: string; lines: BankLineInput[];
}
export function parseStatementInput(value: unknown): StatementInput {
  const row = record(value);
  const start = calendar(row['start']);
  const end = calendar(row['end']);
  const opening = cashAmount(row['opening'], true);
  const closing = cashAmount(row['closing'], true);
  const lines = array(row['lines']).map((raw) => {
    const line = record(raw);
    return { reference: text(line['reference'], 100).trim(), date: calendar(line['date']),
      description: text(line['description']).trim(), amount: cashAmount(line['amount'], true) };
  });
  if (start > end || lines.length > 500 || new Set(lines.map((line) => line.reference)).size !== lines.length ||
    lines.some((line) => line.date < start || line.date > end || cents(line.amount) === 0n) ||
    lines.reduce((sum, line) => sum + cents(line.amount), cents(opening)) !== cents(closing))
    throw new Error('Période, références ou solde final du relevé incohérents.');
  return { bankAccountId: storeId(row['bankAccountId']), reference: text(row['reference'], 100).trim(), start, end, opening, closing, lines };
}
// Format d’échange explicite, sans interprétation automatique des dates ou des séparateurs de milliers.
export function parseTabularLines(raw: string): BankLineInput[] {
  if (raw.length > 400000) return invalid();
  const rows = raw.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  if (rows[0] !== 'reference\tdate\tdescription\tmontant' || rows.length > 501)
    throw new Error('En-tête attendu : reference, date, description, montant (séparés par tabulations).');
  return rows.slice(1).map((row, index) => {
    const fields = row.split('\t');
    if (fields.length !== 4) throw new Error('Ligne ' + (index + 2) + ' : quatre colonnes obligatoires.');
    const [reference = '', day = '', description = '', amount = ''] = fields;
    return { reference: text(reference.trim(), 100), date: calendar(day.trim()), description: text(description.trim()), amount: cashAmount(amount.trim().replace(',', '.'), true) };
  });
}
function bankLines(value: unknown, statement: Statement) {
  const lines = unique(array(value).map((raw) => {
    const row = record(raw);
    const day = calendar(row['date']);
    const amount = cashAmount(row['amount'], true);
    const ledgerLineId = optionalId(row['ledgerLineId']);
    const matchedAt = row['matchedAt'] === null ? null : date(row['matchedAt']);
    if (row['statementId'] !== statement.id || day < statement.start || day > statement.end || cents(amount) === 0n ||
      (ledgerLineId !== null) !== (matchedAt !== null)) return invalid();
    return { id: storeId(row['id']), reference: text(row['reference'], 100), date: day, description: text(row['description']),
      amount, ledgerLineId, matchedAt };
  }));
  const matched = lines.flatMap((line) => line.ledgerLineId ? [line.ledgerLineId] : []);
  if (lines.length > 500 || new Set(lines.map((line) => line.reference)).size !== lines.length ||
    new Set(matched).size !== matched.length) return invalid();
  return lines;
}
export type BankLine = ReturnType<typeof bankLines>[number];
export function verifyImported(value: unknown, input: StatementInput) {
  const row = record(value);
  const statement = parseStatement(row, input.bankAccountId);
  const lines = bankLines(row['lines'], statement);
  if (statement.reference !== input.reference || statement.start !== input.start || statement.end !== input.end ||
    cents(statement.opening) !== cents(input.opening) || cents(statement.closing) !== cents(input.closing) ||
    lines.length !== input.lines.length || !input.lines.every((line) => lines.some((item) =>
      item.reference === line.reference && item.date === line.date && item.description === line.description &&
      cents(item.amount) === cents(line.amount)))) return invalid();
  return statement;
}
export function parseBankReport(value: unknown, expected: Statement, accountId: string) {
  const row = record(value);
  const raw = record(row['statement']);
  const statement = parseStatement(raw, expected.bankId);
  const bank = parseBankAccount(raw['bankAccount']);
  if (statement.id !== expected.id || bank.id !== expected.bankId || bank.accountId !== accountId) return invalid();
  const lines = bankLines(raw['lines'], statement);
  const ledger = unique(array(row['unmatchedLedger']).map((rawLine) => {
    const line = record(rawLine);
    const entry = record(line['entry']);
    const debit = cashAmount(line['debit']);
    const credit = cashAmount(line['credit']);
    const day = calendar(entry['date']);
    if (line['accountId'] !== accountId || day < statement.start || day > statement.end ||
      (cents(debit) > 0n) === (cents(credit) > 0n)) return invalid();
    return { id: storeId(line['id']), date: day, description: text(entry['description']), debit, credit };
  }));
  const bookOpening = cashAmount(row['bookOpening'], true, true);
  const bookClosing = cashAmount(row['bookClosing'], true, true);
  const openingDifference = cashAmount(row['openingDifference'], true, true);
  const closingDifference = cashAmount(row['closingDifference'], true, true);
  const bankDifference = cashAmount(row['bankDifference'], true, true);
  const unmatchedBank = integer(row['unmatchedBank']);
  const invalidMatches = integer(row['invalidMatches']);
  const hasMoreLedger = flag(row['hasMoreLedger']);
  const balanced = flag(row['balanced']);
  if (cents(bookOpening) - cents(statement.opening) !== cents(openingDifference) ||
    cents(bookClosing) - cents(statement.closing) !== cents(closingDifference) ||
    lines.reduce((sum, item) => sum + cents(item.amount), cents(statement.opening)) - cents(statement.closing) !== cents(bankDifference) ||
    unmatchedBank !== lines.filter((line) => !line.ledgerLineId).length ||
    invalidMatches > lines.length - unmatchedBank || ledger.length > 500 || (hasMoreLedger && ledger.length !== 500) ||
    balanced !== (cents(openingDifference) === 0n && cents(closingDifference) === 0n && cents(bankDifference) === 0n &&
      unmatchedBank === 0 && invalidMatches === 0 && ledger.length === 0 && !hasMoreLedger)) return invalid();
  return { statement, lines, ledger, bookOpening, bookClosing, openingDifference, closingDifference, bankDifference, unmatchedBank, invalidMatches, hasMoreLedger, balanced };
}
export type BankReport = ReturnType<typeof parseBankReport>;
export function parseSuggestions(value: unknown, report: BankReport) {
  const row = record(value);
  if (row['statementId'] !== report.statement.id || row['maxDaysDifference'] !== 3) return invalid();
  const items = unique(array(row['items']).map((raw) => {
    const item = record(raw);
    const id = storeId(item['bankLineId']);
    const bank = report.lines.find((line) => line.id === id && !line.ledgerLineId);
    const count = integer(item['candidateCount']);
    const status = item['status'];
    if (!bank || calendar(item['date']) !== bank.date || cents(cashAmount(item['amount'], true)) !== cents(bank.amount) ||
      !['NO_MATCH', 'UNIQUE', 'AMBIGUOUS'].some((key) => key === status) ||
      (status === 'NO_MATCH') !== (count === 0) || (status === 'UNIQUE' && count !== 1) ||
      flag(item['hasMoreCandidates']) !== (count > 5)) return invalid();
    const candidates = unique(array(item['candidates']).map((rawCandidate) => {
      const candidate = record(rawCandidate);
      const day = calendar(candidate['date']);
      const amount = cashAmount(candidate['amount'], true);
      const days = Math.abs(Date.parse(day) - Date.parse(bank.date)) / 86400000;
      if (days !== candidate['daysApart'] || days > 3 || cents(amount) !== cents(bank.amount) ||
        day < report.statement.start || day > report.statement.end) return invalid();
      return { id: storeId(candidate['ledgerLineId']), date: day, description: text(candidate['description']), amount, days };
    }));
    if (candidates.length !== Math.min(count, 5)) return invalid();
    return { id, status: status === 'UNIQUE' ? 'Unique' : status === 'AMBIGUOUS' ? 'Ambiguë' : 'Aucune', count, candidates };
  }));
  if (items.length !== report.unmatchedBank || items.length !== integer(row['total']) ||
    items.filter((item) => item.status === 'Unique').length !== integer(row['unique']) ||
    items.filter((item) => item.status === 'Ambiguë').length !== integer(row['ambiguous']) ||
    items.filter((item) => item.status === 'Aucune').length !== integer(row['noMatch'])) return invalid();
  return items;
}
export type BankSuggestions = ReturnType<typeof parseSuggestions>;
export function bankStorageKey(actor: string) { return 'dsolar.bank.pending.v1:' + storeId(actor); }
