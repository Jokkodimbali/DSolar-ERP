import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, forkJoin } from 'rxjs';
import { errorMessage } from '../../../core/api/http-error';
import { ConfirmComponent } from '../../../shared/ui/confirm.component';
import { FeedbackComponent } from '../../../shared/ui/feedback.component';
import { PaginationComponent } from '../../../shared/ui/pagination.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { SessionService } from '../../auth/application/session.service';
import { formatMoney } from '../../dashboard/domain/dashboard.contract';
import { StoresApi } from '../../stores/infrastructure/stores.api';
import type { parseStores } from '../../stores/domain/store.contract';
import { expenseActions, expenseLabels, expenseMethods, expensePayment, expenseStorageKey, parseNewExpense,
  type Expense, type ExpenseStatus, type ExpenseAction, type ExpensePayment, type ExpenseSummary, type NewExpense,
  type OpenCashSession, type parseCategories, type parseExpensePage } from '../domain/expense.contract';
import { ExpensesApi } from '../infrastructure/expenses.api';

type Action = { expense: Expense; kind: ExpenseAction; input: ExpensePayment | { reason: string } | Record<string, never> };
@Component({
  selector: 'app-expenses-page',
  imports: [DatePipe, ConfirmComponent, FeedbackComponent, PageHeaderComponent, PaginationComponent],
  templateUrl: './expenses.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpensesPage {
  private readonly api = inject(ExpensesApi);
  private readonly storesApi = inject(StoresApi);
  private readonly session = inject(SessionService);
  private readonly destroy = inject(DestroyRef);
  readonly stores = signal<ReturnType<typeof parseStores>>([]);
  readonly categories = signal<ReturnType<typeof parseCategories>>([]);
  readonly result = signal<ReturnType<typeof parseExpensePage> | null>(null);
  readonly summary = signal<ExpenseSummary>([]);
  readonly sessions = signal<OpenCashSession[]>([]);
  readonly filterStore = signal('');
  readonly query = signal('');
  readonly filterStatus = signal('');
  readonly selected = signal<Expense | null>(null);
  readonly mode = signal('CASH');
  readonly pending = signal<NewExpense | null>(null);
  readonly confirmation = signal<Action | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly blocked = signal(false);
  readonly ready = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly labels = expenseLabels;
  readonly methods = expenseMethods;
  readonly statuses = Object.keys(expenseLabels) as ExpenseStatus[];
  readonly methodKeys = Object.keys(expenseMethods) as (keyof typeof expenseMethods)[];
  readonly money = formatMoney;
  readonly actions = expenseActions;
  readonly allowed = computed(() => this.session.can('users.manage', 'sales.manage'));
  readonly activeStores = computed(() => this.stores().filter((store) => store.status === 'ACTIVE'));

  private storage: string | null = null;

  constructor() {
    const actor = this.session.user()?.id;
    if (actor && this.allowed()) {
      try {
        this.storage = expenseStorageKey(actor);
        const saved = sessionStorage.getItem(this.storage);
        if (saved !== null) this.pending.set(parseNewExpense(JSON.parse(saved)));
      } catch {
        this.blocked.set(true);
        this.error.set('Impossible de récupérer la dépense en attente.');
      }
    }
    this.load();
  }
  load(page = this.result()?.page ?? 1): void {
    if (this.loading() || this.busy() || this.confirmation()) return;
    this.loading.set(true);
    this.ready.set(false);
    this.selected.set(null);
    this.result.set(null);
    this.summary.set([]);
    const store = this.filterStore() || undefined;
    forkJoin({ result: this.api.search(page, this.filterStore(), this.filterStatus(), this.query()), summary: this.api.summary(store), categories: this.api.categories(),
      stores: this.storesApi.list(), sessions: this.api.openSessions() })
      .pipe(takeUntilDestroyed(this.destroy), finalize(() => this.loading.set(false)))
      .subscribe({
        next: (data) => {
          this.result.set(data.result); this.summary.set(data.summary); this.categories.set(data.categories);
          this.stores.set(data.stores); this.sessions.set(data.sessions); this.ready.set(true);
        },
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }
  filter(store: string, status: string, query: string): void {
    if (this.loading() || this.busy() || this.confirmation()) return;
    this.filterStore.set(store);
    this.filterStatus.set(status);
    this.query.set(query.trim());
    this.load(1);
  }
  categoryName(id: string): string { return this.categories().find((item) => item.id === id)?.name ?? id; }
  storeName(id: string): string { return this.stores().find((item) => item.id === id)?.name ?? id; }
  cashSessions(expense: Expense) { return this.sessions().filter((item) => item.storeId === expense.storeId); }
  createCategory(name: string): void {
    if (!this.allowed() || !this.ready() || this.busy() || this.loading() || this.confirmation()) return;
    const value = name.trim();
    this.error.set(''); this.success.set('');
    if (!value || value.length > 100) { this.error.set('Nom de catégorie invalide.'); return; }
    if (this.categories().some((item) => item.name === value)) { this.error.set('Cette catégorie existe déjà.'); return; }
    this.busy.set(true);
    this.api.createCategory(value).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: (category) => { this.busy.set(false); this.success.set('Catégorie enregistrée : ' + category.name); this.load(); },
      error: (error: unknown) => { this.busy.set(false); this.error.set(errorMessage(error) + ' Vérifiez les catégories avant de réessayer.'); this.load(); },
    });
  }
  save(storeId: string, categoryId: string, description: string, amount: string): void {
    if (!this.allowed() || !this.ready() || this.busy() || this.loading() || this.pending() || this.blocked() || this.confirmation()) return;
    this.error.set(''); this.success.set('');
    try {
      if (!this.activeStores().some((store) => store.id === storeId) || !this.categories().some((item) => item.id === categoryId))
        throw new Error('Magasin actif et catégorie obligatoires.');
      const input = parseNewExpense({ storeId, categoryId, description: description.trim(), amount: amount.trim().replace(',', '.'), operationKey: crypto.randomUUID() });
      if (!this.storage) throw new Error('Session indisponible.');
      sessionStorage.setItem(this.storage, JSON.stringify(input));
      this.pending.set(input);
      this.resume();
    } catch (error: unknown) { this.error.set(error instanceof Error ? error.message : 'Dépense invalide.'); }
  }
  resume(): void {
    const input = this.pending();
    if (!input || !this.allowed() || this.loading() || this.busy() || this.blocked()) return;
    this.busy.set(true); this.error.set('');
    this.api.create(input).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: () => {
        this.busy.set(false);
        try {
          if (this.storage) sessionStorage.removeItem(this.storage);
          this.pending.set(null); this.success.set('Dépense enregistrée et vérifiée.');
          this.load();
        } catch { this.error.set('Dépense enregistrée, mais demande locale non effacée.'); }
      },
      error: (error: unknown) => {
        this.busy.set(false);
        if (error instanceof HttpErrorResponse && error.status === 400) {
          try { if (this.storage) sessionStorage.removeItem(this.storage); this.pending.set(null); } catch { /* Conserver la clé. */ }
        }
        this.error.set(errorMessage(error) + ' En cas de résultat incertain, reprenez la même dépense.');
        this.load();
      },
    });
  }
  open(expense: Expense): void {
    if (this.busy() || this.loading() || this.confirmation()) return;
    this.mode.set('CASH');
    this.selected.set(expense);
  }
  ask(kind: ExpenseAction, mode = '', sessionId = '', reference = '', reason = ''): void {
    const expense = this.selected();
    if (!expense || !this.allowed() || this.busy() || this.loading() || this.confirmation() || !expenseActions(expense.status).includes(kind)) return;
    this.error.set(''); this.success.set('');
    try {
      const normalized = reason.trim();
      if (['cancel', 'refund'].includes(kind) && (!normalized || normalized.length > 500)) throw new Error('Motif obligatoire (500 caractères maximum).');
      const input = kind === 'pay' ? expensePayment(expense, mode, sessionId, reference, this.sessions()) :
        kind === 'approve' ? {} : { reason: normalized };
      this.confirmation.set({ expense, kind, input });
    } catch (error: unknown) { this.error.set(error instanceof Error ? error.message : 'Opération invalide.'); }
  }
  apply(): void {
    const action = this.confirmation();
    if (!action || this.busy() || !this.allowed()) return;
    this.busy.set(true);
    this.api.action(action.expense, action.kind, action.input).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: (expense) => { this.busy.set(false); this.confirmation.set(null); this.success.set('Dépense : ' + this.labels[expense.status] + '.'); this.load(); },
      error: (error: unknown) => { this.busy.set(false); this.confirmation.set(null); this.error.set(errorMessage(error) + ' Actualisez avant toute nouvelle opération.'); this.load(); },
    });
  }
}
