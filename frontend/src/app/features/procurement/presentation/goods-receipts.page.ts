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
import { SessionService } from '../../auth/application/session.service';
import { StoresApi } from '../../stores/infrastructure/stores.api';
import type { Store } from '../../stores/domain/store.contract';
import { ProductsApi } from '../../products/infrastructure/products.api';
import { formatMoney } from '../../dashboard/domain/dashboard.contract';
import {
  receiptInput,
  receiptLabels,
  receiptStatuses,
  type GoodsReceipt,
  type ReceiptDraftLine,
  type ReceiptInput,
  type ReceiptStatus,
  type parseReceiptPage,
} from '../domain/goods-receipt.contract';
import type {
  PurchaseOrder,
  PurchaseProgress,
  parsePurchaseOrderPage,
} from '../domain/purchase-order.contract';
import { GoodsReceiptsApi } from '../infrastructure/goods-receipts.api';
import { PurchaseOrdersApi } from '../infrastructure/purchase-orders.api';
import {
  matchesReceipt,
  parsePendingReceipt,
  receiptStorageKey,
} from '../infrastructure/pending-goods-receipt';

@Component({
  selector: 'app-goods-receipts-page',
  imports: [
    DatePipe,
    ConfirmComponent,
    EmptyStateComponent,
    FeedbackComponent,
    PageHeaderComponent,
    PaginationComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './goods-receipts.page.html',
})
export class GoodsReceiptsPage {
  private readonly api = inject(GoodsReceiptsApi);
  private readonly ordersApi = inject(PurchaseOrdersApi);
  private readonly storesApi = inject(StoresApi);
  private readonly productsApi = inject(ProductsApi);
  private readonly destroy = inject(DestroyRef);
  readonly session = inject(SessionService);
  readonly labels = receiptLabels;
  readonly statuses = receiptStatuses;
  readonly money = formatMoney;
  readonly stores = signal<Store[]>([]);
  readonly result = signal<ReturnType<typeof parseReceiptPage> | null>(null);
  readonly options = signal<ReturnType<typeof parsePurchaseOrderPage> | null>(null);
  readonly selectedOrder = signal<PurchaseOrder | null>(null);
  readonly progress = signal<PurchaseProgress | null>(null);
  readonly draft = signal<ReceiptDraftLine[]>([]);
  readonly detail = signal<GoodsReceipt | null>(null);
  readonly productNames = signal<Record<string, string>>({});
  readonly orderName = signal('');
  readonly reference = signal('');
  readonly destination = signal('');
  readonly filterStore = signal('');
  readonly search = signal('');
  readonly status = signal<ReceiptStatus | ''>('');
  readonly orderSearch = signal('');
  readonly error = signal('');
  readonly success = signal('');
  readonly loading = signal(false);
  readonly optionsLoading = signal(false);
  readonly busy = signal(false);
  readonly creating = signal(false);
  readonly pending = signal<'confirm' | 'cancel' | null>(null);
  readonly pendingCreation = signal<ReceiptInput | null>(null);
  private storageKey: string | null = null;

  constructor() {
    this.load();
    const actor = this.session.user()?.id;
    if (actor && this.session.can('inventory.manage')) {
      this.storageKey = receiptStorageKey(actor);
      try {
        const raw = sessionStorage.getItem(this.storageKey);
        if (raw !== null) this.pendingCreation.set(parsePendingReceipt(JSON.parse(raw)));
      } catch {
        this.error.set('Impossible de lire la réception en attente. Vérifiez le stockage du navigateur.');
      }
    }
    if (this.session.can('stores.read')) {
      this.storesApi
        .list()
        .pipe(takeUntilDestroyed(this.destroy))
        .subscribe({
          next: (stores) => this.stores.set(stores.filter((store) => store.status === 'ACTIVE')),
          error: (error: unknown) => this.error.set(errorMessage(error)),
        });
    }
  }

  storeName(id: string): string {
    return this.stores().find((store) => store.id === id)?.name ?? id;
  }

  filter(search: string, status: string, store: string): void {
    if (this.loading() || this.busy()) return;
    this.search.set(search.trim());
    this.status.set(this.statuses.find((item) => item === status) ?? '');
    this.filterStore.set(this.stores().some((item) => item.id === store) ? store : '');
    this.load(1);
  }

  load(page = this.result()?.page ?? 1): void {
    if (this.loading() || this.busy() || page < 1) return;
    this.loading.set(true);
    this.api
      .search(page, this.search(), this.status(), this.filterStore())
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

  start(): void {
    if (
      this.busy() ||
      this.creating() ||
      this.pendingCreation() ||
      !this.session.can('inventory.manage', 'stores.read')
    )
      return;
    this.close();
    this.error.set('');
    this.success.set('');
    this.creating.set(true);
    this.reference.set('BR-' + crypto.randomUUID().toUpperCase());
    this.destination.set('');
    this.lookup('', 1);
  }

  lookup(search: string, page: number): void {
    if (this.busy() || this.optionsLoading() || page < 1) return;
    this.orderSearch.set(search.trim());
    this.optionsLoading.set(true);
    this.ordersApi
      .outstanding(page, this.orderSearch())
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.optionsLoading.set(false)),
      )
      .subscribe({
        next: (options) => this.options.set(options),
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }

  chooseOrder(id: string): void {
    if (this.busy()) return;
    this.selectedOrder.set(null);
    this.progress.set(null);
    this.draft.set([]);
    if (!this.options()?.items.some((item) => item.id === id)) return;
    this.busy.set(true);
    forkJoin({ order: this.ordersApi.get(id), progress: this.ordersApi.progress(id) })
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: ({ order, progress }) => {
          if (
            progress.orderId !== order.id ||
            progress.status !== order.status ||
            !['CONFIRMED', 'PARTIALLY_DELIVERED'].includes(order.status)
          ) {
            this.error.set('La commande a changé. Sélectionnez une commande encore ouverte.');
            return;
          }
          this.selectedOrder.set(order);
          this.progress.set(progress);
          this.draft.set(
            order.lines
              .filter((line) =>
                progress.lines.some((item) => item.productId === line.productId && !item.complete),
              )
              .map((line) => ({ productId: line.productId, quantity: '', unitCost: line.unitCost })),
          );
          this.loadNames(order.lines.map((line) => line.productId));
        },
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }

  change(id: string, field: 'quantity' | 'unitCost', value: string): void {
    if (!this.busy())
      this.draft.update((lines) =>
        lines.map((line) => (line.productId === id ? { ...line, [field]: value } : line)),
      );
  }

  remaining(id: string): string {
    return this.progress()?.lines.find((line) => line.productId === id)?.remaining ?? '—';
  }

  save(): void {
    const order = this.selectedOrder();
    const progress = this.progress();
    if (
      this.busy() ||
      !this.creating() ||
      this.pendingCreation() ||
      !order ||
      !progress ||
      !this.session.can('inventory.manage')
    )
      return;
    if (!this.stores().some((store) => store.id === this.destination())) {
      this.error.set('Sélectionnez un magasin actif autorisé.');
      return;
    }
    try {
      const input = receiptInput(this.reference(), order.id, this.destination(), this.draft(), progress);
      if (!this.storageKey) throw new Error('Session indisponible.');
      sessionStorage.setItem(this.storageKey, JSON.stringify(input));
      this.pendingCreation.set(input);
      this.creating.set(false);
      this.submit(input);
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Vérifiez les quantités et les coûts.');
    }
  }

  resumeCreation(): void {
    const input = this.pendingCreation();
    if (!input || this.busy() || !this.session.can('inventory.manage')) return;
    this.error.set('');
    this.busy.set(true);
    this.api
      .search(1, input.number, '', input.storeId)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (page) => {
          const receipt = page.items.find((item) => item.number === input.number);
          this.busy.set(false);
          if (receipt) {
            this.creationSucceeded(receipt);
          } else if (page.pages > 1) {
            this.error.set('Recherche ambiguë. Vérifiez la référence avant de réessayer.');
          } else {
            this.submit(input);
          }
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.error.set(errorMessage(error));
        },
      });
  }

  private clearCreation(): void {
    this.pendingCreation.set(null);
    if (this.storageKey) {
      try {
        sessionStorage.removeItem(this.storageKey);
      } catch {
        // La référence reste unique en base.
      }
    }
  }

  private submit(input: ReceiptInput): void {
    this.busy.set(true);
    this.error.set('');
    this.api
      .create(input)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (receipt) => this.creationSucceeded(receipt),
        error: (error: unknown) => {
          this.busy.set(false);
          if (error instanceof HttpErrorResponse && error.status === 400) this.clearCreation();
          this.error.set(errorMessage(error) + ' Vérifiez la référence ' + input.number + '.');
        },
      });
  }

  private creationSucceeded(receipt: GoodsReceipt): void {
    this.busy.set(false);
    const input = this.pendingCreation();
    if (!input || !matchesReceipt(receipt, input)) {
      this.error.set('La réception trouvée ne correspond pas au bon en attente.');
      return;
    }
    this.clearCreation();
    this.success.set('Bon de réception retrouvé. Vérifiez son statut avant toute confirmation.');
    this.load(1);
    this.open(receipt.id);
  }

  open(id: string): void {
    if (this.busy()) return;
    this.close();
    this.busy.set(true);
    this.api
      .get(id)
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: (receipt) => {
          this.detail.set(receipt);
          this.loadNames(receipt.lines.map((line) => line.productId));
          if (receipt.purchaseOrderId) {
            this.ordersApi
              .get(receipt.purchaseOrderId)
              .pipe(takeUntilDestroyed(this.destroy))
              .subscribe({
                next: (order) => {
                  if (this.detail()?.id === receipt.id) this.orderName.set(order.number);
                },
                error: () => undefined,
              });
          }
        },
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }

  private loadNames(ids: string[]): void {
    if (!this.session.can('products.read') || !ids.length) return;
    forkJoin(ids.map((id) => this.productsApi.get(id).pipe(catchError(() => of(null)))))
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe((products) => {
        this.productNames.update((names) => ({
          ...names,
          ...Object.fromEntries(
            products.filter((p) => p !== null).map((p) => [p.id, p.name + ' · ' + p.sku]),
          ),
        }));
      });
  }

  ask(action: 'confirm' | 'cancel'): void {
    if (!this.busy() && this.detail()?.status === 'DRAFT' && this.session.can('inventory.manage'))
      this.pending.set(action);
  }

  applyAction(): void {
    const receipt = this.detail();
    const action = this.pending();
    if (
      this.busy() ||
      !receipt ||
      !action ||
      receipt.status !== 'DRAFT' ||
      !this.session.can('inventory.manage')
    )
      return;
    this.busy.set(true);
    this.error.set('');
    this.api
      .action(receipt.id, action)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (updated) => {
          this.busy.set(false);
          this.pending.set(null);
          this.success.set(
            action === 'confirm' ? 'Réception confirmée et stock mis à jour.' : 'Réception annulée.',
          );
          this.load(1);
          this.open(updated.id);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.pending.set(null);
          this.error.set(errorMessage(error));
          this.open(receipt.id);
        },
      });
  }

  close(): void {
    if (this.busy()) return;
    this.creating.set(false);
    this.detail.set(null);
    this.selectedOrder.set(null);
    this.progress.set(null);
    this.draft.set([]);
    this.pending.set(null);
    this.orderName.set('');
  }
}
