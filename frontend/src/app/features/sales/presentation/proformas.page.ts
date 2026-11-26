import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, finalize, forkJoin, of } from 'rxjs';
import { errorMessage } from '../../../core/api/http-error';
import { ConfirmComponent } from '../../../shared/ui/confirm.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state.component';
import { FeedbackComponent } from '../../../shared/ui/feedback.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { PaginationComponent } from '../../../shared/ui/pagination.component';
import { SessionService } from '../../auth/application/session.service';
import { formatMoney } from '../../dashboard/domain/dashboard.contract';
import { ProductsApi } from '../../products/infrastructure/products.api';
import { StoresApi } from '../../stores/infrastructure/stores.api';
import { CustomersApi } from '../infrastructure/customers.api';
import { ProformaApi } from '../infrastructure/proforma.api';
import {
  actionLabels,
  expectedStatus,
  proformaActions,
  proformaLabels,
  proformaStatuses,
  type Proforma,
  type ProformaAction,
  type ProformaStatus,
  type parseProformaPage,
} from '../domain/proforma-view.contract';

@Component({
  selector: 'app-proformas-page',
  imports: [
    DatePipe,
    RouterLink,
    ConfirmComponent,
    EmptyStateComponent,
    FeedbackComponent,
    PageHeaderComponent,
    PaginationComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './proformas.page.html',
})
export class ProformasPage {
  private readonly api = inject(ProformaApi);
  private readonly customers = inject(CustomersApi);
  private readonly products = inject(ProductsApi);
  private readonly stores = inject(StoresApi);
  private readonly destroy = inject(DestroyRef);
  readonly session = inject(SessionService);
  readonly labels = proformaLabels;
  readonly statuses = proformaStatuses;
  readonly actionLabels = actionLabels;
  readonly actions = proformaActions;
  readonly money = formatMoney;
  readonly result = signal<ReturnType<typeof parseProformaPage> | null>(null);
  readonly detail = signal<Proforma | null>(null);
  readonly customerNames = signal<Record<string, string>>({});
  readonly productNames = signal<Record<string, string>>({});
  readonly storeNames = signal<Record<string, string>>({});
  readonly query = signal('');
  readonly status = signal<ProformaStatus | ''>('');
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly pending = signal<ProformaAction | null>(null);

  constructor() {
    this.load(1);
    if (this.session.can('stores.read')) {
      this.stores
        .list(true)
        .pipe(takeUntilDestroyed(this.destroy))
        .subscribe({
          next: (items) => this.storeNames.set(Object.fromEntries(items.map((item) => [item.id, item.name]))),
          error: () => undefined,
        });
    }
  }

  filter(query: string, status: string): void {
    if (this.loading() || this.busy() || this.pending()) return;
    this.error.set('');
    this.query.set(query.trim());
    this.status.set(this.statuses.find((item) => item === status) ?? '');
    this.load(1);
  }

  load(page = this.result()?.page ?? 1): void {
    if (this.loading() || this.busy() || this.pending() || page < 1) return;
    this.loading.set(true);
    this.api
      .search(page, this.query(), this.status())
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (data) => {
          this.result.set(data);
          this.loadCustomerNames(data.items.map((item) => item.customerId));
        },
        error: (error: unknown) => {
          this.result.set(null);
          this.error.set(errorMessage(error));
        },
      });
  }

  private loadCustomerNames(ids: string[]): void {
    const missing = [...new Set(ids)].filter((id) => !this.customerNames()[id]);
    if (!missing.length) return;
    forkJoin(missing.map((id) => this.customers.get(id).pipe(catchError(() => of(null)))))
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe((items) =>
        this.customerNames.update((names) => ({
          ...names,
          ...Object.fromEntries(items.filter((item) => item !== null).map((item) => [item.id, item.name])),
        })),
      );
  }

  close(): void {
    if (this.busy() || this.pending()) return;
    this.detail.set(null);
  }

  open(id: string): void {
    if (this.busy() || this.pending() || this.loading()) return;
    this.detail.set(null);
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
          if (item.id !== id) {
            this.error.set('Identifiant de devis incohérent.');
            return;
          }
          this.detail.set(item);
          this.loadCustomerNames([item.customerId]);
          if (!this.session.can('products.read')) return;
          const ids = [...new Set(item.lines.map((line) => line.productId))];
          forkJoin(ids.map((productId) => this.products.get(productId).pipe(catchError(() => of(null)))))
            .pipe(takeUntilDestroyed(this.destroy))
            .subscribe((products) =>
              this.productNames.update((names) => ({
                ...names,
                ...Object.fromEntries(
                  products
                    .filter((product) => product !== null)
                    .map((product) => [product.id, product.name + ' · ' + product.sku]),
                ),
              })),
            );
        },
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }

  ask(action: ProformaAction): void {
    const item = this.detail();
    if (
      !item ||
      this.busy() ||
      this.loading() ||
      this.pending() ||
      !this.session.can('sales.manage') ||
      !this.actions(item).includes(action)
    )
      return;
    this.error.set('');
    this.success.set('');
    this.pending.set(action);
  }

  apply(): void {
    const item = this.detail();
    const action = this.pending();
    if (
      !item ||
      !action ||
      this.busy() ||
      !this.session.can('sales.manage') ||
      !this.actions(item).includes(action)
    )
      return;
    this.busy.set(true);
    this.api
      .action(item.id, action)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (updated) => {
          this.busy.set(false);
          this.pending.set(null);
          if (updated.id !== item.id || updated.status !== expectedStatus[action]) {
            this.detail.set(null);
            this.error.set('État non confirmé. Consultez de nouveau le devis.');
          } else {
            this.detail.set(updated);
            this.success.set('Statut du devis : ' + this.labels[updated.status] + '.');
          }
          this.load(1);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.pending.set(null);
          this.detail.set(null);
          this.error.set(errorMessage(error) + ' Consultez de nouveau le devis avant toute nouvelle action.');
          this.load(1);
        },
      });
  }
}
