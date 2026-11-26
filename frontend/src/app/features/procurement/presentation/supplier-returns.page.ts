import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, finalize, forkJoin, of } from 'rxjs';
import { errorMessage } from '../../../core/api/http-error';
import { ConfirmComponent } from '../../../shared/ui/confirm.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state.component';
import { FeedbackComponent } from '../../../shared/ui/feedback.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { PaginationComponent } from '../../../shared/ui/pagination.component';
import { formatMoney } from '../../dashboard/domain/dashboard.contract';
import { SessionService } from '../../auth/application/session.service';
import { ProductsApi } from '../../products/infrastructure/products.api';
import { StoresApi } from '../../stores/infrastructure/stores.api';
import type { Store } from '../../stores/domain/store.contract';
import {
  matchesReturnAction,
  returnAction,
  returnLabels,
  type ReturnAction,
  returnStatuses,
  type ReturnStatus,
  type SupplierReturn,
  type parseSupplierReturnPage,
} from '../domain/supplier-return.contract';
import { SupplierReturnsApi } from '../infrastructure/supplier-returns.api';
import { GoodsReceiptsApi } from '../infrastructure/goods-receipts.api';
import type { parseReceiptPage } from '../domain/goods-receipt.contract';
import {
  matchesReturnCreation,
  parseReturnCreation,
  returnCreation,
  returnCreationStorageKey,
  type ReturnCreation,
  type ReturnOptions,
} from '../domain/return-creation.contract';

@Component({
  selector: 'app-supplier-returns-page',
  imports: [
    DatePipe,
    ConfirmComponent,
    EmptyStateComponent,
    FeedbackComponent,
    PageHeaderComponent,
    PaginationComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './supplier-returns.page.html',
})
export class SupplierReturnsPage {
  private readonly api = inject(SupplierReturnsApi);
  private readonly receiptsApi = inject(GoodsReceiptsApi);
  private readonly storesApi = inject(StoresApi);
  private readonly productsApi = inject(ProductsApi);
  readonly session = inject(SessionService);
  private readonly destroy = inject(DestroyRef);
  readonly money = formatMoney;
  readonly labels = returnLabels;
  readonly statuses = returnStatuses;
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly action = signal<ReturnAction | null>(null);
  readonly actionText = signal('');
  readonly stores = signal<Store[]>([]);
  readonly search = signal('');
  readonly status = signal<ReturnStatus | ''>('');
  readonly store = signal('');
  readonly result = signal<ReturnType<typeof parseSupplierReturnPage> | null>(null);
  readonly detail = signal<SupplierReturn | null>(null);
  readonly names = signal<Record<string, string>>({});

  readonly creating = signal(false);
  readonly receipts = signal<ReturnType<typeof parseReceiptPage> | null>(null);
  readonly receiptSearch = signal('');
  readonly receiptLoading = signal(false);
  readonly options = signal<ReturnOptions | null>(null);
  readonly quantities = signal<Record<string, string>>({});
  readonly reason = signal('');
  readonly pendingCreation = signal<ReturnCreation | null>(null);
  private storageKey: string | null = null;

  constructor() {
    this.load(1);
    const actor = this.session.user()?.id;
    if (actor && this.session.can('users.manage', 'inventory.manage')) {
      this.storageKey = returnCreationStorageKey(actor);
      try {
        const pending = sessionStorage.getItem(this.storageKey);
        if (pending !== null) this.pendingCreation.set(parseReturnCreation(JSON.parse(pending)));
      } catch {
        this.error.set('Impossible de lire le retour en attente.');
      }
    }
    if (this.session.can('stores.read')) {
      this.storesApi
        .list()
        .pipe(takeUntilDestroyed(this.destroy))
        .subscribe({
          next: (stores) => this.stores.set(stores),
          error: (error: unknown) => this.error.set(errorMessage(error)),
        });
    }
  }

  storeName(id: string): string {
    return this.stores().find((item) => item.id === id)?.name ?? id;
  }

  filter(search: string, status: string, store: string): void {
    if (this.loading() || this.busy()) return;
    this.search.set(search.trim());
    this.status.set(this.statuses.find((item) => item === status) ?? '');
    this.store.set(this.stores().some((item) => item.id === store) ? store : '');
    this.load(1);
  }

  load(page = this.result()?.page ?? 1): void {
    if (this.loading() || this.busy() || page < 1) return;
    this.loading.set(true);
    this.api
      .search(page, this.search(), this.status(), this.store())
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (result) => this.result.set(result),
        error: (error: unknown) => {
          this.result.set(null);
          this.error.set(errorMessage(error));
        },
      });
  }

  open(id: string): void {
    if (this.busy() || this.action() || this.creating() || this.pendingCreation()) return;
    this.detail.set(null);
    this.names.set({});
    this.actionText.set('');
    this.error.set('');
    this.busy.set(true);
    this.api
      .get(id)
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: (item) => {
          this.detail.set(item);
          const ids = item.lines.map((line) => line.productId).filter((id) => id !== null);
          if (!ids.length || !this.session.can('products.read')) return;
          forkJoin(ids.map((id) => this.productsApi.get(id).pipe(catchError(() => of(null)))))
            .pipe(takeUntilDestroyed(this.destroy))
            .subscribe((products) => {
              if (this.detail()?.id !== item.id) return;
              this.names.set(
                Object.fromEntries(
                  products.filter((p) => p !== null).map((p) => [p.id, p.name + ' · ' + p.sku]),
                ),
              );
            });
        },
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }

  ask(kind: ReturnAction['kind']): void {
    const item = this.detail();
    if (!item || this.busy() || this.action()) return;
    if (!this.session.can('users.manage', kind === 'credit' ? 'sales.manage' : 'inventory.manage')) return;
    this.error.set('');
    this.success.set('');
    try {
      this.action.set(returnAction(item, kind, this.actionText()));
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Vérifiez les données du retour.');
    }
  }

  apply(): void {
    const item = this.detail();
    const action = this.action();
    if (!item || !action || this.busy()) return;
    if (!this.session.can('users.manage', action.kind === 'credit' ? 'sales.manage' : 'inventory.manage'))
      return;
    this.busy.set(true);
    this.error.set('');
    this.api
      .action(item.id, action)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (updated) => {
          this.busy.set(false);
          this.action.set(null);
          if (updated.id !== item.id || !matchesReturnAction(updated, action)) {
            this.detail.set(null);
            this.error.set('État du retour non confirmé. Actualisez la liste avant de réessayer.');
            this.load(1);
            return;
          }
          this.detail.set(updated);
          this.actionText.set('');
          this.success.set(
            action.kind === 'confirm'
              ? 'Retour confirmé et stock mis à jour.'
              : action.kind === 'cancel'
                ? 'Retour annulé.'
                : 'Avoir fournisseur enregistré.',
          );
          this.load(1);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.action.set(null);
          this.detail.set(null);
          this.error.set(
            errorMessage(error) + ' Consultez de nouveau le retour avant toute nouvelle action.',
          );
          this.load(1);
        },
      });
  }

  start(): void {
    if (this.busy() || this.action() || this.creating() || this.pendingCreation() || !this.session.can('users.manage', 'inventory.manage')) return;
    this.detail.set(null);
    this.options.set(null);
    this.quantities.set({});
    this.reason.set('');
    this.error.set('');
    this.success.set('');
    this.creating.set(true);
    this.lookupReceipts('', 1);
  }

  lookupReceipts(search: string, page: number): void {
    if (this.busy() || this.receiptLoading() || !this.creating()) return;
    this.receiptSearch.set(search.trim());
    this.receiptLoading.set(true);
    this.receiptsApi.search(page, this.receiptSearch(), 'CONFIRMED', '')
      .pipe(takeUntilDestroyed(this.destroy), finalize(() => this.receiptLoading.set(false)))
      .subscribe({
        next: (result) => this.receipts.set(result),
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }

  chooseReceipt(id: string): void {
    if (this.busy() || !this.creating()) return;
    this.options.set(null);
    this.quantities.set({});
    const receipt = this.receipts()?.items.find((item) => item.id === id);
    if (!receipt || !receipt.purchaseOrderId) return;
    this.busy.set(true);
    this.api.options(id)
      .pipe(takeUntilDestroyed(this.destroy), finalize(() => this.busy.set(false)))
      .subscribe({
        next: (options) => {
          if (options.receiptId !== id || options.storeId !== receipt.storeId) {
            this.error.set('Réception incohérente. Rechargez la liste.');
            return;
          }
          this.options.set(options);
        },
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }

  changeQuantity(id: string, value: string): void {
    if (!this.busy() && this.creating()) this.quantities.update((items) => ({ ...items, [id]: value }));
  }

  save(): void {
    const options = this.options();
    if (!options || !this.creating() || this.busy() || this.pendingCreation() || !this.session.can('users.manage', 'inventory.manage')) return;
    this.error.set('');
    try {
      const input = returnCreation(options, this.quantities(), this.reason(), crypto.randomUUID());
      if (!this.storageKey) throw new Error('Session indisponible.');
      sessionStorage.setItem(this.storageKey, JSON.stringify(input));
      this.pendingCreation.set(input);
      this.creating.set(false);
      this.resumeCreation();
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Données de retour invalides.');
    }
  }

  private clearCreation(): void {
    if (this.storageKey) sessionStorage.removeItem(this.storageKey);
    this.pendingCreation.set(null);
  }

  resumeCreation(): void {
    const input = this.pendingCreation();
    if (!input || this.busy() || !this.session.can('users.manage', 'inventory.manage')) return;
    this.busy.set(true);
    this.error.set('');
    this.api.create(input).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: (item) => {
        this.busy.set(false);
        if (!matchesReturnCreation(item, input)) {
          this.error.set('Le retour enregistré ne correspond pas à la demande en attente.');
          return;
        }
        try {
          this.clearCreation();
        } catch {
          this.error.set('Retour enregistré. Le stockage local ne peut pas être effacé.');
          return;
        }
        this.load(1);
        this.open(item.id);
        this.success.set('Retour enregistré. Vérifiez son statut avant toute confirmation.');
      },
      error: (error: unknown) => {
        this.busy.set(false);
        if (error instanceof HttpErrorResponse && error.status === 400) {
          try {
            this.clearCreation();
          } catch {
            // Conserver la clé si le stockage est indisponible.
          }
        }
        this.error.set(errorMessage(error) + ' Ne créez pas de nouveau retour avant résolution.');
      },
    });
  }

}
