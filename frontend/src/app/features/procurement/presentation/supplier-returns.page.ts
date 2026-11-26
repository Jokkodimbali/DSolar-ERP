import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, finalize, forkJoin, of } from 'rxjs';
import { errorMessage } from '../../../core/api/http-error';
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
  returnLabels,
  returnStatuses,
  type ReturnStatus,
  type SupplierReturn,
  type parseSupplierReturnPage,
} from '../domain/supplier-return.contract';
import { SupplierReturnsApi } from '../infrastructure/supplier-returns.api';

@Component({
  selector: 'app-supplier-returns-page',
  imports: [DatePipe, EmptyStateComponent, FeedbackComponent, PageHeaderComponent, PaginationComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './supplier-returns.page.html',
})
export class SupplierReturnsPage {
  private readonly api = inject(SupplierReturnsApi);
  private readonly storesApi = inject(StoresApi);
  private readonly productsApi = inject(ProductsApi);
  private readonly session = inject(SessionService);
  private readonly destroy = inject(DestroyRef);
  readonly money = formatMoney;
  readonly labels = returnLabels;
  readonly statuses = returnStatuses;
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly stores = signal<Store[]>([]);
  readonly search = signal('');
  readonly status = signal<ReturnStatus | ''>('');
  readonly store = signal('');
  readonly result = signal<ReturnType<typeof parseSupplierReturnPage> | null>(null);
  readonly detail = signal<SupplierReturn | null>(null);
  readonly names = signal<Record<string, string>>({});

  constructor() {
    this.load(1);
    if (this.session.can('stores.read')) {
      this.storesApi.list().pipe(takeUntilDestroyed(this.destroy)).subscribe({
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
    this.error.set('');
    this.api.search(page, this.search(), this.status(), this.store())
      .pipe(takeUntilDestroyed(this.destroy), finalize(() => this.loading.set(false)))
      .subscribe({
        next: (result) => this.result.set(result),
        error: (error: unknown) => {
          this.result.set(null);
          this.error.set(errorMessage(error));
        },
      });
  }

  open(id: string): void {
    if (this.busy()) return;
    this.detail.set(null);
    this.names.set({});
    this.error.set('');
    this.busy.set(true);
    this.api.get(id)
      .pipe(takeUntilDestroyed(this.destroy), finalize(() => this.busy.set(false)))
      .subscribe({
        next: (item) => {
          this.detail.set(item);
          const ids = item.lines.map((line) => line.productId).filter((id) => id !== null);
          if (!ids.length || !this.session.can('products.read')) return;
          forkJoin(ids.map((id) => this.productsApi.get(id).pipe(catchError(() => of(null)))))
            .pipe(takeUntilDestroyed(this.destroy))
            .subscribe((products) => {
              if (this.detail()?.id !== item.id) return;
              this.names.set(Object.fromEntries(products.filter((p) => p !== null).map((p) => [p.id, p.name + ' · ' + p.sku])));
            });
        },
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }
}
