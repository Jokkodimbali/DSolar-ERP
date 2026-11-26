import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { apiPath } from '../../../core/api/api-contract';
import { storeId } from '../../stores/domain/store.contract';
import { category, parseCategories, parseExpensePage, parseExpenseSummary, parseOpenCashSessions,
  verifyCreatedExpense, verifyExpenseAction, type Expense, type ExpenseAction, type ExpensePayment, type NewExpense } from '../domain/expense.contract';

@Injectable({ providedIn: 'root' })
export class ExpensesApi {
  private readonly http = inject(HttpClient);
  private readonly base = apiPath('/expenses');
  categories() { return this.http.get<unknown>(this.base + '/categories').pipe(map(parseCategories)); }
  createCategory(name: string) { return this.http.post<unknown>(this.base + '/categories', { name }).pipe(map(category)); }
  search(page: number, store: string, status: string, search: string) {
    return this.http.get<unknown>(this.base + '/search', {
      params: { page, limit: 20, search, ...(store ? { storeId: storeId(store) } : {}), ...(status ? { status } : {}) },
    }).pipe(map(parseExpensePage));
  }
  summary(store?: string) {
    return this.http.get<unknown>(this.base + '/summary', { params: store ? { storeId: storeId(store) } : {} }).pipe(map(parseExpenseSummary));
  }
  openSessions() { return this.http.get<unknown>(apiPath('/treasury/registers')).pipe(map(parseOpenCashSessions)); }
  create(input: NewExpense) {
    return this.http.post<unknown>(this.base, input).pipe(map((value) => verifyCreatedExpense(value, input)));
  }
  action(expense: Expense, action: ExpenseAction, input: ExpensePayment | { reason: string } | Record<string, never>) {
    return this.http.post<unknown>(this.base + '/' + storeId(expense.id) + '/' + action, input)
      .pipe(map((value) => verifyExpenseAction(value, expense, action)));
  }
}
