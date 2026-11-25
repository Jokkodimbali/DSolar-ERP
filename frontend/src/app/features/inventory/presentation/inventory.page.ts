import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { finalize, forkJoin } from 'rxjs';
import { errorMessage } from '../../../core/api/http-error';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { FeedbackComponent } from '../../../shared/ui/feedback.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state.component';
import { PaginationComponent } from '../../../shared/ui/pagination.component';
import { KpiCardComponent } from '../../../shared/ui/kpi-card.component';
import { ProductThumbnailComponent } from '../../../shared/ui/product-thumbnail.component';
import { UiIconComponent } from '../../../shared/ui/ui-icon.component';
import { SessionService } from '../../auth/application/session.service';
import { StoresApi } from '../../stores/infrastructure/stores.api';
import type { Store } from '../../stores/domain/store.contract';
import { ProductsApi } from '../../products/infrastructure/products.api';
import { emptyFilters, type Product } from '../../products/domain/product.contract';
import {
  adjustmentInput,
  parsePendingAdjustment,
  unavailable,
  type parseMovements,
  type StockAdjustment,
  type StockItem,
  type StockBalance,
  type parseStockSummary,
} from '../domain/stock.contract';
import { clearPending, pendingKey, readPending, savePending } from '../infrastructure/pending-stock-operation';
import { InventoryApi } from '../infrastructure/inventory.api';

@Component({
  selector: 'app-inventory-page',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    PageHeaderComponent,
    FeedbackComponent,
    EmptyStateComponent,
    PaginationComponent,
    KpiCardComponent,
    ProductThumbnailComponent,
    UiIconComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './inventory.page.html',
})
export class InventoryPage {
  private readonly api = inject(InventoryApi);
  private readonly storesApi = inject(StoresApi);
  private readonly productsApi = inject(ProductsApi);
  private readonly destroy = inject(DestroyRef);
  readonly session = inject(SessionService);
  readonly stores = signal<Store[]>([]);
  readonly selectedStore = signal('');
  readonly items = signal<StockItem[] | null>(null);
  readonly loading = signal(false);
  readonly loadingStores = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly query = signal('');
  readonly filter = signal('ALL');
  readonly page = signal(1);
  readonly unavailable = unavailable;
  readonly history = signal<ReturnType<typeof parseMovements> | null>(null);
  readonly historyOpen = signal(false);
  readonly historyLoading = signal(false);
  readonly historyError = signal('');
  readonly historyQuery = signal('');
  readonly newDate = (value: string) => new Date(value);
  readonly historyDate = new Intl.DateTimeFormat('fr-SN', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Africa/Dakar',
  });
  readonly counters = signal<ReturnType<typeof parseStockSummary> | null>(null);
  readonly total = signal(0);
  readonly pages = signal(1);
  readonly detail = signal<{ item: StockItem; balance: StockBalance } | null>(null);

  applyFilters(search: string, availability: string): void {
    if (this.loading() || this.busy()) return;
    this.query.set(search.trim());
    this.filter.set(availability);
    this.load(1);
  }

  showBalance(item: StockItem): void {
    if (this.busy() || this.loading() || this.editing()) return;
    this.busy.set(true);
    this.error.set('');
    this.api.balance(item.storeId, item.productId).pipe(takeUntilDestroyed(this.destroy), finalize(() => this.busy.set(false))).subscribe({
      next: (balance) => this.detail.set({ item, balance }),
      error: (error: unknown) => this.error.set(errorMessage(error)),
    });
  }
  readonly editing = signal(false);
  readonly pending = signal<StockAdjustment | null>(null);
  readonly productResults = signal<Product[]>([]);
  readonly productLoading = signal(false);
  readonly chosen = signal<{ id: string; name: string; sku: string } | null>(null);
  readonly form = new FormGroup({
    direction: new FormControl<'IN' | 'OUT'>('IN', { nonNullable: true }),
    quantity: new FormControl('', { nonNullable: true }),
    reason: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    this.loadStores();
  }

  loadStores(): void {
    if (this.loadingStores()) return;
    this.loadingStores.set(true);
    this.error.set('');
    this.storesApi
      .list()
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.loadingStores.set(false)),
      )
      .subscribe({
        next: (stores) => {
          this.stores.set(stores.filter((store) => store.status === 'ACTIVE'));
          this.restoreAdjustment();
          if (!this.editing()) this.selectStore(this.stores()[0]?.id ?? '');
        },
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }

  private adjustmentKey(): string {
    const actor = this.session.user()?.id;
    if (!actor) throw new Error('Session indisponible.');
    return pendingKey(actor, 'adjustment');
  }

  private restoreAdjustment(): void {
    if (!this.session.can('inventory.manage', 'products.read')) return;
    try {
      const command = readPending(this.adjustmentKey(), parsePendingAdjustment);
      if (!command) return;
      if (!this.stores().some((store) => store.id === command.storeId)) {
        this.error.set('Un ajustement est en attente dans un magasin désormais inaccessible. Contactez un administrateur.');
        return;
      }
      this.selectedStore.set(command.storeId);
      this.load(1);
      this.chosen.set({ id: command.productId, name: 'Ajustement à reprendre', sku: command.productId });
      this.form.reset({ direction: command.direction, quantity: command.quantity, reason: command.reason });
      this.form.disable();
      this.pending.set(command);
      this.attempted.set(true);
      this.editing.set(true);
      this.success.set('Opération précédente retrouvée. Vérifiez-la ou réessayez avec la même clé.');
      this.productsApi.get(command.productId).pipe(takeUntilDestroyed(this.destroy)).subscribe({
        next: (product) => { if (this.pending()?.operationKey === command.operationKey) this.chosen.set(product); },
        error: () => undefined,
      });
    } catch {
      this.error.set('Impossible de restaurer l’ajustement conservé. Vérifiez le journal avant une nouvelle écriture.');
    }
  }

  selectStore(id: string): void {
    if (this.loading() || this.busy() || this.editing() || this.historyLoading()) return;
    if (id && !this.stores().some((store) => store.id === id)) return;
    this.selectedStore.set(id);
    this.detail.set(null);
    this.historyOpen.set(false);
    this.history.set(null);
    this.page.set(1);
    this.load();
  }

  load(page = this.page()): void {
    if (this.loading() || this.busy()) return;
    const id = this.selectedStore();
    this.items.set(null);
    this.counters.set(null);
    this.detail.set(null);
    if (!id) return;
    this.loading.set(true);
    this.error.set('');
    forkJoin({ result: this.api.search(id, page, this.query(), this.filter()), counters: this.api.summary(id) })
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: ({ result, counters }) => {
          this.items.set(result.items);
          this.counters.set(counters);
          this.total.set(result.total);
          this.pages.set(result.pages || 1);
          this.page.set(result.page);
        },
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }

  toggleHistory(): void {
    this.historyOpen.update((open) => !open);
    if (this.historyOpen()) this.loadHistory(1);
  }

  searchHistory(search: string): void {
    this.historyQuery.set(search.trim());
    this.loadHistory(1);
  }

  loadHistory(page: number): void {
    const id = this.selectedStore();
    if (!id || this.historyLoading() || page < 1) return;
    this.historyLoading.set(true);
    this.historyError.set('');
    this.history.set(null);
    this.api
      .movements(id, page, this.historyQuery())
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.historyLoading.set(false)),
      )
      .subscribe({
        next: (result) => {
          if (this.selectedStore() === id) this.history.set(result);
        },
        error: (error: unknown) => this.historyError.set(errorMessage(error)),
      });
  }

  openAdjustment(row?: StockItem): void {
    if (
      this.busy() ||
      this.editing() ||
      !this.selectedStore() ||
      !this.session.can('inventory.manage', 'products.read')
    )
      return;
    this.error.set('');
    this.success.set('');
    this.detail.set(null);
    this.form.reset();
    this.form.enable();
    this.pending.set(null);
    this.chosen.set(row ? { id: row.productId, name: row.name, sku: row.sku } : null);
    this.productResults.set([]);
    this.editing.set(true);
  }

  searchProducts(term: string): void {
    if (this.productLoading() || this.pending() || !this.editing()) return;
    this.productLoading.set(true);
    this.productResults.set([]);
    this.productsApi
      .search(1, { ...emptyFilters, active: 'true', search: term.trim() })
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.productLoading.set(false)),
      )
      .subscribe({
        next: (result) => {
          if (this.editing() && !this.pending()) this.productResults.set(result.items);
        },
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }

  choose(product: Product): void {
    if (!this.pending()) this.chosen.set(product);
  }

  prepare(): void {
    if (this.pending() || this.busy() || !this.editing() || !this.session.can('inventory.manage')) return;
    const product = this.chosen();
    if (!product) {
      this.error.set('Sélectionnez un produit.');
      return;
    }
    try {
      this.pending.set(
        adjustmentInput({
          ...this.form.getRawValue(),
          storeId: this.selectedStore(),
          productId: product.id,
          operationKey: crypto.randomUUID(),
        }),
      );
      this.form.disable();
      this.error.set('');
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Ajustement invalide.');
    }
  }

  readonly attempted = signal(false);

  cancel(): void {
    if (this.busy()) return;
    if (
      this.attempted() &&
      !window.confirm(
        'Le résultat de cette opération doit être vérifié avant de créer un nouvel ajustement. Abandonner cette tentative ?',
      )
    )
      return;
    if (this.attempted()) {
      try { clearPending(this.adjustmentKey()); } catch { this.error.set('Impossible de supprimer la tentative conservée.'); return; }
    }
    this.resetAdjustment();
    this.load();
  }

  private resetAdjustment(): void {
    this.pending.set(null);
    this.attempted.set(false);
    this.editing.set(false);
    this.chosen.set(null);
    this.form.reset();
    this.form.enable();
    this.productResults.set([]);
  }

  submit(): void {
    const pending = this.pending();
    if (!pending || this.busy() || !this.session.can('inventory.manage')) return;
    let key: string;
    try {
      key = this.adjustmentKey();
      savePending(key, pending);
    } catch {
      this.error.set('Impossible de conserver la clé d’opération. L’ajustement n’a pas été envoyé.');
      return;
    }
    this.attempted.set(true);
    this.busy.set(true);
    this.error.set('');
    this.api
      .adjust(pending)
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: () => {
          this.busy.set(false);
          try { clearPending(key); } catch { this.error.set('Ajustement enregistré ; impossible de supprimer sa reprise locale.'); return; }
          this.resetAdjustment();
          this.success.set('Ajustement de stock enregistré.');
          this.load();
          if (this.historyOpen()) this.loadHistory(1);
        },
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }
}
