import { isRecord } from '../../../../core/api/api-contract';
import { storeId } from '../../../stores/domain/store.contract';
import { cashAmount, cents } from '../../../treasury/domain/treasury.contract';
import { calendar } from '../../bank/domain/bank.contract';

function invalid(): never {
  throw new Error('Données comptables incohérentes.');
}
const record = (value: unknown) => (isRecord(value) ? value : invalid());
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : invalid());
const text = (value: unknown): string => (typeof value === 'string' && value.trim() ? value : invalid());
const flag = (value: unknown): boolean => (typeof value === 'boolean' ? value : invalid());
const amount = (value: unknown) => cashAmount(value, true, true);
const positive = (value: unknown) => cashAmount(value, false, true);
const count = (value: unknown): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : invalid();
const timestamp = (value: unknown) => {
  const raw = text(value);
  return Number.isFinite(Date.parse(raw)) ? raw : invalid();
};

function unique<T extends { id: string }>(items: T[]): T[] {
  return new Set(items.map((item) => item.id)).size === items.length ? items : invalid();
}

function account(value: unknown) {
  const row = record(value);
  return { id: storeId(row['id']), code: text(row['code']), name: text(row['name']) };
}

export function parseSetup(value: unknown) {
  const row = record(value);
  const periods = unique(
    array(row['periods']).map((raw) => {
      const period = record(raw);
      const start = calendar(period['startsAt']);
      const end = calendar(period['endsAt']);
      if (start > end) return invalid();
      return {
        id: storeId(period['id']),
        name: text(period['name']),
        start,
        end,
        closedAt: period['closedAt'] === null ? null : timestamp(period['closedAt']),
      };
    }),
  );
  return {
    periods,
    accounts: unique(array(row['accounts']).map(account)),
    journals: unique(array(row['journals']).map(account)),
    rules: array(row['rules']).length,
  };
}

export function parseBalance(value: unknown) {
  const data = record(value);
  const rows = unique(
    array(data['rows']).map((raw) => {
      const row = record(raw);
      const debit = positive(row['debit']);
      const credit = positive(row['credit']);
      const balance = amount(row['balance']);
      if (cents(debit) - cents(credit) !== cents(balance)) return invalid();
      return { ...account(row), debit, credit, balance };
    }),
  );
  const debit = positive(data['debit']);
  const credit = positive(data['credit']);
  const balanced = flag(data['balanced']);
  if (
    rows.reduce((sum, row) => sum + cents(row.debit), 0n) !== cents(debit) ||
    rows.reduce((sum, row) => sum + cents(row.credit), 0n) !== cents(credit) ||
    balanced !== (cents(debit) === cents(credit))
  )
    return invalid();
  return { rows, debit, credit, balanced };
}

export function parseStatements(value: unknown, periodId: string) {
  const data = record(value);
  if (data['periodId'] !== periodId) return invalid();
  const pendingSources = text(data['pendingSources']);
  if (!/^\d+$/.test(pendingSources)) return invalid();
  const common = {
    provisional: flag(data['provisional']),
    closed: flag(data['closed']),
    pendingSources,
    unpostedEntries: count(data['unpostedEntries']),
    priorOpenPeriods: count(data['priorOpenPeriods']),
  };
  if (!flag(data['complete'])) {
    if (!common.provisional) return invalid();
    return {
      ...common,
      complete: false as const,
      unclassified: array(data['unclassified']).map((raw) => {
        const row = record(raw);
        return { id: storeId(row['accountId']), code: text(row['code']), name: text(row['name']) };
      }),
    };
  }
  const income = record(data['incomeStatement']);
  const sheet = record(data['balanceSheet']);
  const incomeStatement = {
    revenue: amount(income['revenue']),
    expenses: amount(income['expenses']),
    result: amount(income['result']),
  };
  const balanceSheet = {
    assets: amount(sheet['assets']),
    liabilities: amount(sheet['liabilities']),
    equity: amount(sheet['totalEquity']),
    total: amount(sheet['totalLiabilitiesAndEquity']),
    difference: amount(sheet['difference']),
    balanced: flag(sheet['balanced']),
  };
  if (
    cents(incomeStatement.revenue) - cents(incomeStatement.expenses) !== cents(incomeStatement.result) ||
    cents(balanceSheet.liabilities) + cents(balanceSheet.equity) !== cents(balanceSheet.total) ||
    cents(balanceSheet.assets) - cents(balanceSheet.total) !== cents(balanceSheet.difference) ||
    balanceSheet.balanced !== (cents(balanceSheet.difference) === 0n) ||
    (!common.provisional &&
      (!common.closed ||
        common.pendingSources !== '0' ||
        common.unpostedEntries !== 0 ||
        common.priorOpenPeriods !== 0 ||
        !balanceSheet.balanced))
  )
    return invalid();
  return { ...common, complete: true as const, incomeStatement, balanceSheet };
}

export function parseAutomation(value: unknown, periodId: string) {
  const data = record(value);
  return {
    enabled: flag(data['enabled']),
    closed: flag(data['closed']),
    failures: array(data['failures']).map((raw) => {
      const row = record(raw);
      if (row['periodId'] !== periodId) return invalid();
      return {
        id: storeId(row['sourceId']),
        type: text(row['sourceType']),
        attempts: count(row['attempts']),
        error: text(row['lastError']),
        nextAttemptAt: timestamp(row['nextAttemptAt']),
      };
    }),
  };
}

export function parsePending(value: unknown, periodId: string) {
  const data = record(value);
  if (data['periodId'] !== periodId) return invalid();
  return {
    closed: flag(data['closed']),
    hasMore: flag(data['hasMore']),
    items: array(data['items']).map((raw) => {
      const row = record(raw);
      return {
        id: storeId(row['id']),
        type: text(row['type']),
        date: row['date'] === null ? null : timestamp(row['date']),
      };
    }),
  };
}

export function parseEntries(value: unknown, periodId: string) {
  const data = record(value);
  const entries = unique(
    array(data['entries']).map((raw) => {
      const row = record(raw);
      if (row['periodId'] !== periodId) return invalid();
      const lines = unique(
        array(row['lines']).map((rawLine) => {
          const line = record(rawLine);
          const ledgerAccount = account(line['account']);
          const debit = positive(line['debit']);
          const credit = positive(line['credit']);
          if (ledgerAccount.id !== line['accountId'] || (cents(debit) > 0n) === (cents(credit) > 0n))
            return invalid();
          return { id: storeId(line['id']), account: ledgerAccount, debit, credit };
        }),
      );
      if (
        lines.length < 2 ||
        lines.reduce((sum, line) => sum + cents(line.debit) - cents(line.credit), 0n) !== 0n
      )
        return invalid();
      const journal = account(row['journal']);
      if (journal.id !== row['journalId']) return invalid();
      return {
        id: storeId(row['id']),
        date: calendar(row['date']),
        postedAt: timestamp(row['postedAt']),
        description: text(row['description']),
        sourceType: row['sourceType'] === null ? null : text(row['sourceType']),
        sourceId: row['sourceId'] === null ? null : storeId(row['sourceId']),
        journal,
        lines,
      };
    }),
  );
  const nextCursor = data['nextCursor'] === null ? null : storeId(data['nextCursor']);
  if (entries.length > 100 || (nextCursor && (entries.length !== 100 || entries[99]?.id !== nextCursor)))
    return invalid();
  return { entries, nextCursor };
}

const sourceLabels: Record<string, string> = {
  INVOICE: 'Facture',
  CREDIT_NOTE: 'Avoir',
  CASH_TRANSFER: 'Transfert de caisse',
  PAYMENT: 'Règlement',
  PAYMENT_REVERSAL: 'Annulation de règlement',
  EXPENSE: 'Dépense',
  EXPENSE_REFUND: 'Remboursement de dépense',
  GOODS_RECEIPT: 'Réception fournisseur',
  SUPPLIER_RETURN: 'Retour fournisseur',
  CASH_MOVEMENT: 'Mouvement de caisse',
};
export function sourceLabel(type: string | null): string {
  return type ? (sourceLabels[type] ?? type) : 'Historique / correction';
}
