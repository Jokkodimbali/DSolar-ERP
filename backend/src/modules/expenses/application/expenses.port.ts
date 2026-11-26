import type { ListCriteria } from '../../../shared/pagination';

export interface ExpenseCriteria extends ListCriteria {
  storeId?: string;
  status?: 'DRAFT' | 'APPROVED' | 'PAID' | 'CANCELLED' | 'REFUNDED';
}

export const EXPENSES = Symbol('EXPENSES');
export type ExpenseMethod = 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'MOBILE_MONEY' | 'OTHER';

export interface NewExpense {
  storeId: string;
  categoryId: string;
  description: string;
  amount: string;
  operationKey: string;
}

export interface ExpensePayment {
  method: ExpenseMethod;
  sessionId?: string;
  reference?: string;
}

export interface ExpensesPort {
  categories(actor: string): Promise<unknown>;
  createCategory(name: string, actor: string): Promise<unknown>;
  list(actor: string, storeId?: string): Promise<unknown>;
  search(actor: string, query: ExpenseCriteria): Promise<unknown>;
  create(input: NewExpense, actor: string): Promise<unknown>;
  approve(id: string, actor: string): Promise<unknown>;
  pay(id: string, input: ExpensePayment, actor: string): Promise<unknown>;
  cancel(id: string, reason: string, actor: string): Promise<unknown>;
  refund(id: string, reason: string, actor: string): Promise<unknown>;
  summary(actor: string, storeId?: string): Promise<unknown>;
}
