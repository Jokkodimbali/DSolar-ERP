import { isRecord } from '../../../core/api/api-contract';
import { parsePage } from '../../inventory/domain/workflow.contract';
import { storeId } from '../../stores/domain/store.contract';

export const expenseLabels = {
  DRAFT: 'Brouillon',
  APPROVED: 'Approuvée',
  PAID: 'Réglée',
  CANCELLED: 'Annulée',
  REFUNDED: 'Remboursée',
} as const;
export const expenseMethods = {
  CASH: 'Espèces',
  BANK_TRANSFER: 'Virement bancaire',
  CHEQUE: 'Chèque',
  MOBILE_MONEY: 'Mobile Money',
  OTHER: 'Autre',
} as const;
export type ExpenseStatus = keyof typeof expenseLabels;
export type ExpenseMethod = keyof typeof expenseMethods;
export type ExpenseAction = 'approve' | 'pay' | 'cancel' | 'refund';

function invalid(): never { throw new Error('Données de dépense incohérentes.'); }
const record = (value: unknown) => isRecord(value) ? value : invalid();
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : invalid();
function text(value: unknown, max: number): string {
  return typeof value === 'string' && value.trim() && value.length <= max ? value : invalid();
}
function optionalText(value: unknown, max: number): string | null {
  return value === null ? null : text(value, max);
}
function date(value: unknown): string {
  const result = text(value, 40);
  return Number.isFinite(Date.parse(result)) ? result : invalid();
}
function optionalDate(value: unknown): string | null { return value === null ? null : date(value); }
export function expenseAmount(value: unknown, allowZero = false): string {
  if (typeof value !== 'string' || !/^\d{1,16}(?:\.\d{1,2})?$/.test(value)) return invalid();
  if (!allowZero && !/[1-9]/.test(value)) return invalid();
  return value;
}
export function cents(value: string): bigint {
  const [whole = '0', part = ''] = expenseAmount(value, true).split('.');
  return BigInt(whole) * 100n + BigInt(part.padEnd(2, '0'));
}
function status(value: unknown): ExpenseStatus {
  return (Object.keys(expenseLabels) as ExpenseStatus[]).find((key) => key === value) ?? invalid();
}
function method(value: unknown): ExpenseMethod {
  return (Object.keys(expenseMethods) as ExpenseMethod[]).find((key) => key === value) ?? invalid();
}
export function category(value: unknown) {
  const row = record(value);
  return { id: storeId(row['id']), name: text(row['name'], 100) };
}
function unique<T extends { id: string }>(items: T[]): T[] {
  if (new Set(items.map((item) => item.id)).size !== items.length) return invalid();
  return items;
}
export function parseCategories(value: unknown) { return unique(array(value).map(category)); }
export function parseExpense(value: unknown) {
  const row = record(value);
  const state = status(row['status']);
  const approvedAt = optionalDate(row['approvedAt']);
  const paidAt = optionalDate(row['paidAt']);
  const endedAt = optionalDate(row['endedAt']);
  const paid = state === 'PAID' || state === 'REFUNDED';
  const ended = state === 'CANCELLED' || state === 'REFUNDED';
  const paymentMethod = row['method'] === null ? null : method(row['method']);
  const reference = optionalText(row['reference'], 200);
  const cashMovementId = row['cashMovementId'] === null ? null : storeId(row['cashMovementId']);
  const refundMovementId = row['refundMovementId'] === null ? null : storeId(row['refundMovementId']);
  const endReason = optionalText(row['endReason'], 500);
  if ((state === 'DRAFT' && approvedAt !== null) ||
      ((state === 'APPROVED' || paid) && approvedAt === null) ||
      paid !== (paidAt !== null) || paid !== (paymentMethod !== null) ||
      ended !== (endedAt !== null) || ended !== (endReason !== null) ||
      (paymentMethod === 'CASH') !== (cashMovementId !== null) ||
      (state === 'REFUNDED' && paymentMethod === 'CASH') !== (refundMovementId !== null) ||
      (paid && paymentMethod !== 'CASH' && !reference)) return invalid();
  const categoryId = storeId(row['categoryId']);
  if (row['category'] !== undefined && category(row['category']).id !== categoryId) return invalid();
  return {
    id: storeId(row['id']), storeId: storeId(row['storeId']), categoryId,
    description: text(row['description'], 500), amount: expenseAmount(row['amount']), status: state,
    operationKey: storeId(row['operationKey']), createdAt: date(row['createdAt']), approvedAt, paidAt, endedAt,
    method: paymentMethod, reference, cashMovementId, refundMovementId, endReason,
  };
}
export type Expense = ReturnType<typeof parseExpense>;
export function parseExpensePage(value: unknown) {
  const result = parsePage(value, parseExpense);
  if (result.items.length !== Math.min(result.limit, Math.max(0, result.total - (result.page - 1) * result.limit)))
    return invalid();
  unique(result.items);
  return result;
}

export function parseExpenseSummary(value: unknown) {
  const rows = array(value).map((raw) => {
    const row = record(raw);
    const count = row['_count'];
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count <= 0) return invalid();
    return { status: status(row['status']), categoryId: storeId(row['categoryId']),
      count, amount: expenseAmount(record(row['_sum'])['amount']) };
  });
  if (new Set(rows.map((row) => row.status + ':' + row.categoryId)).size !== rows.length) return invalid();
  return rows;
}
export type ExpenseSummary = ReturnType<typeof parseExpenseSummary>;
export function parseOpenCashSessions(value: unknown) {
  const registers = unique(array(value).map((raw) => {
    const row = record(raw);
    const id = storeId(row['id']);
    const sessions = unique(array(row['sessions']).map((rawSession) => {
      const session = record(rawSession);
      if (session['registerId'] !== id) return invalid();
      return { id: storeId(session['id']), closedAt: optionalDate(session['closedAt']) };
    })).filter((session) => session.closedAt === null);
    if (sessions.length > 1) return invalid();
    return { id, storeId: storeId(row['storeId']), name: text(row['name'], 100), sessions };
  }));
  return unique(registers.flatMap((register) => register.sessions.map((session) => ({
    id: session.id, storeId: register.storeId, name: register.name,
  }))));
}
export type OpenCashSession = ReturnType<typeof parseOpenCashSessions>[number];

export interface NewExpense {
  storeId: string; categoryId: string; description: string; amount: string; operationKey: string;
}
export function parseNewExpense(value: unknown): NewExpense {
  const row = record(value);
  return { storeId: storeId(row['storeId']), categoryId: storeId(row['categoryId']),
    description: text(row['description'], 500).trim(), amount: expenseAmount(row['amount']),
    operationKey: storeId(row['operationKey']) };
}
export function verifyCreatedExpense(value: unknown, input: NewExpense): Expense {
  const expense = parseExpense(value);
  if (expense.storeId !== input.storeId || expense.categoryId !== input.categoryId ||
    expense.operationKey !== input.operationKey || expense.description !== input.description ||
    cents(expense.amount) !== cents(input.amount)) return invalid();
  return expense;
}
export function expenseStorageKey(actor: string) {
  return 'dsolar.expense.pending.v1:' + storeId(actor);
}
export function expenseActions(state: ExpenseStatus): readonly ExpenseAction[] {
  switch (state) {
    case 'DRAFT': return ['approve', 'cancel'];
    case 'APPROVED': return ['pay', 'cancel'];
    case 'PAID': return ['refund'];
    default: return [];
  }
}
export type ExpensePayment = { method: ExpenseMethod; sessionId?: string; reference?: string };
export function expensePayment(expense: Expense, mode: string, sessionId: string, reference: string, sessions: OpenCashSession[]): ExpensePayment {
  if (expense.status !== 'APPROVED') return invalid();
  const paymentMethod = method(mode);
  if (paymentMethod === 'CASH') {
    if (!sessions.some((session) => session.id === sessionId && session.storeId === expense.storeId))
      throw new Error('Sélectionnez une caisse ouverte du magasin de la dépense.');
    return { method: paymentMethod, sessionId };
  }
  const normalized = reference.trim();
  if (!normalized || normalized.length > 200) throw new Error('Référence externe obligatoire (200 caractères maximum).');
  return { method: paymentMethod, reference: normalized };
}
export function verifyExpenseAction(value: unknown, expense: Expense, action: ExpenseAction) {
  const result = parseExpense(value);
  const expected = { approve: 'APPROVED', pay: 'PAID', cancel: 'CANCELLED', refund: 'REFUNDED' };
  if (result.id !== expense.id || result.operationKey !== expense.operationKey ||
    result.storeId !== expense.storeId || result.categoryId !== expense.categoryId ||
    result.description !== expense.description || cents(result.amount) !== cents(expense.amount) ||
    result.status !== expected[action]) return invalid();
  return result;
}
