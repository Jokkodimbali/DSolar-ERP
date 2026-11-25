import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
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
  isZero,
  unavailable,
  type parseMovements,
  type StockAdjustment,
  type StockItem,
} from '../domain/stock.contract';
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
  readonly counters = computed(() => {
    const items = this.items();
    if (!items) return null;
    return {
      products: items.length,
      available: items.filter((row) => !unavailable(row.available)).length,
      reserved: items.filter((row) => !isZero(row.reserved)).length,
      empty: items.filter((row) => unavailable(row.available)).length,
    };
  });
  readonly filtered = computed(() => {
    const query = this.query().trim().toLocaleLowerCase('fr');
    return (this.items() ?? []).filter(
      (row) =>
        (row.name + ' ' + row.sku).toLocaleLowerCase('fr').includes(query) &&
        (this.filter() === 'ALL' ||
          (this.filter() === 'EMPTY' && unavailable(row.available)) ||
          (this.filter() === 'AVAILABLE' && !unavailable(row.available)) ||
          (this.filter() === 'RESERVED' && !isZero(row.reserved))),
    );
  });
  readonly pages = computed(() => Math.max(1, Math.ceil(this.filtered().length / 10)));
  readonly visible = computed(() => this.filtered().slice((this.page() - 1) * 10, this.page() * 10));
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
          this.selectStore(this.stores()[0]?.id ?? '');
        },
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }

  selectStore(id: string): void {
    if (this.loading() || this.busy() || this.editing() || this.historyLoading()) return;
    if (id && !this.stores().some((store) => store.id === id)) return;
    this.selectedStore.set(id);
    this.historyOpen.set(false);
    this.history.set(null);
    this.page.set(1);
    this.load();
  }

  load(): void {
    if (this.loading() || this.busy()) return;
    const id = this.selectedStore();
    this.items.set(null);
    if (!id) return;
    this.loading.set(true);
    this.error.set('');
    this.api
      .stock(id)
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (items) => {
          this.items.set(items);
          this.page.set(Math.min(this.page(), this.pages()));
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
          this.resetAdjustment();
          this.success.set('Ajustement de stock enregistré.');
          this.load();
          if (this.historyOpen()) this.loadHistory(1);
        },
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }
}
