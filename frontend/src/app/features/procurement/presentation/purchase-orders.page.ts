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
import { emptyFilters, type Product, type parseProductPage } from '../../products/domain/product.contract';
import { ProductsApi } from '../../products/infrastructure/products.api';
import { formatMoney } from '../../dashboard/domain/dashboard.contract';
import { type Supplier, type parseSupplierPage } from '../domain/supplier.contract';
import {
  purchaseOrderInput,
  purchaseStatuses,
  purchaseStatusLabels,
  type PurchaseDraftLine,
  type PurchaseOrder,
  type PurchaseOrderInput,
  type PurchaseProgress,
  type PurchaseStatus,
  type parsePurchaseOrderPage,
} from '../domain/purchase-order.contract';
import { PurchaseOrdersApi } from '../infrastructure/purchase-orders.api';
import { SuppliersApi } from '../infrastructure/suppliers.api';
import {
  matchesPurchase,
  parsePendingPurchase,
  purchaseStorageKey,
} from '../infrastructure/pending-purchase-order';

type DraftLine = PurchaseDraftLine & { label: string };

@Component({
  selector: 'app-purchase-orders-page',
  imports: [
    DatePipe,
    ConfirmComponent,
    EmptyStateComponent,
    FeedbackComponent,
    PageHeaderComponent,
    PaginationComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './purchase-orders.page.html',
  styleUrl: './purchase-orders.page.css',
})
export class PurchaseOrdersPage {
  private readonly api = inject(PurchaseOrdersApi);
  private readonly suppliersApi = inject(SuppliersApi);
  private readonly productsApi = inject(ProductsApi);
  private readonly destroy = inject(DestroyRef);
  readonly session = inject(SessionService);
  readonly statuses = purchaseStatuses;
  readonly labels = purchaseStatusLabels;
  readonly money = formatMoney;
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly optionsLoading = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly result = signal<ReturnType<typeof parsePurchaseOrderPage> | null>(null);
  readonly search = signal('');
  readonly status = signal<PurchaseStatus | ''>('');
  readonly creating = signal(false);
  readonly number = signal('');
  readonly supplier = signal<Supplier | null>(null);
  readonly supplierOptions = signal<ReturnType<typeof parseSupplierPage> | null>(null);
  readonly productOptions = signal<ReturnType<typeof parseProductPage> | null>(null);
  readonly supplierTerm = signal('');
  readonly productTerm = signal('');
  readonly draft = signal<DraftLine[]>([]);
  readonly detail = signal<PurchaseOrder | null>(null);
  readonly progress = signal<PurchaseProgress | null>(null);
  readonly productNames = signal<Record<string, string>>({});
  readonly pending = signal<'confirm' | 'cancel' | null>(null);
  readonly pendingCreation = signal<PurchaseOrderInput | null>(null);
  private storageKey: string | null = null;

  constructor() {
    this.load(1);
    const actor = this.session.user()?.id;
    if (!actor || !this.session.can('inventory.manage')) return;
    this.storageKey = purchaseStorageKey(actor);
    try {
      const raw = sessionStorage.getItem(this.storageKey);
      if (raw !== null) this.pendingCreation.set(parsePendingPurchase(JSON.parse(raw)));
    } catch {
      this.error.set('Impossible de lire la commande en attente. Vérifiez le stockage du navigateur.');
    }
  }

  private clearCreation(): void {
    this.pendingCreation.set(null);
    if (this.storageKey) {
      try {
        sessionStorage.removeItem(this.storageKey);
      } catch {
        // La référence reste unique en base même si le stockage local ne peut être effacé.
      }
    }
  }

  filter(search: string, status: string): void {
    if (this.loading() || this.busy()) return;
    this.search.set(search.trim());
    this.status.set(this.statuses.find((item) => item === status) ?? '');
    this.load(1);
  }

  load(page = this.result()?.page ?? 1): void {
    if (this.loading() || this.busy() || page < 1) return;
    this.loading.set(true);
    this.api
      .search(page, this.search(), this.status())
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (value) => this.result.set(value),
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
      !this.session.can('inventory.manage', 'products.read')
    )
      return;
    this.detail.set(null);
    this.pending.set(null);
    this.error.set('');
    this.success.set('');
    this.creating.set(true);
    this.number.set('CF-' + crypto.randomUUID().toUpperCase());
    this.supplier.set(null);
    this.draft.set([]);
    this.supplierTerm.set('');
    this.productTerm.set('');
    this.lookup('supplier', '', 1);
  }

  lookup(kind: 'supplier' | 'product', term: string, page: number): void {
    if (this.optionsLoading() || this.busy() || page < 1) return;
    this.optionsLoading.set(true);
    const finish = () => this.optionsLoading.set(false);
    const fail = (error: unknown) => this.error.set(errorMessage(error));
    if (kind === 'supplier') {
      this.supplierTerm.set(term.trim());
      this.suppliersApi
        .search(page, this.supplierTerm(), 'ACTIVE')
        .pipe(takeUntilDestroyed(this.destroy), finalize(finish))
        .subscribe({ next: (value) => this.supplierOptions.set(value), error: fail });
    } else {
      this.productTerm.set(term.trim());
      this.productsApi
        .search(page, { ...emptyFilters, search: this.productTerm(), active: 'true' })
        .pipe(takeUntilDestroyed(this.destroy), finalize(finish))
        .subscribe({ next: (value) => this.productOptions.set(value), error: fail });
    }
  }

  chooseSupplier(id: string): void {
    if (this.busy()) return;
    const supplier = this.supplierOptions()?.items.find((item) => item.id === id);
    if (supplier) {
      this.supplier.set(supplier);
      this.lookup('product', '', 1);
    }
  }

  addProduct(product: Product): void {
    if (
      this.busy() ||
      this.draft().length >= 100 ||
      this.draft().some((line) => line.productId === product.id)
    )
      return;
    this.draft.update((lines) => [
      ...lines,
      { productId: product.id, label: product.name + ' · ' + product.sku, quantity: '1', unitCost: '' },
    ]);
  }

  changeLine(id: string, field: 'quantity' | 'unitCost', value: string): void {
    if (!this.busy())
      this.draft.update((lines) =>
        lines.map((line) => (line.productId === id ? { ...line, [field]: value } : line)),
      );
  }

  removeLine(id: string): void {
    if (!this.busy()) this.draft.update((lines) => lines.filter((line) => line.productId !== id));
  }

  save(): void {
    const supplier = this.supplier();
    if (this.busy() || !this.creating() || !supplier || !this.session.can('inventory.manage')) return;
    if (this.pendingCreation()) return;
    this.error.set('');
    try {
      const input = purchaseOrderInput(this.number(), supplier.id, this.draft());
      if (!this.storageKey) throw new Error('Session invalide.');
      sessionStorage.setItem(this.storageKey, JSON.stringify(input));
      this.pendingCreation.set(input);
      this.creating.set(false);
      this.submit(input);
    } catch {
      this.error.set('Vérifiez les quantités, les coûts, le fournisseur et le stockage du navigateur.');
    }
  }

  resumeCreation(): void {
    const input = this.pendingCreation();
    if (!input || this.busy() || !this.session.can('inventory.manage')) return;
    this.error.set('');
    this.busy.set(true);
    this.api
      .search(1, input.number, '')
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (page) => {
          const existing = page.items.find((order) => order.number === input.number);
          this.busy.set(false);
          if (existing) {
            if (matchesPurchase(existing, input)) this.creationSucceeded(existing);
            else
              this.error.set(
                'La référence existe avec des données différentes. Contactez un administrateur.',
              );
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

  private submit(input: PurchaseOrderInput): void {
    this.busy.set(true);
    this.api
      .create(input)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (order) => this.creationSucceeded(order),
        error: (error: unknown) => {
          this.busy.set(false);
          if (error instanceof HttpErrorResponse && error.status === 400) this.clearCreation();
          this.error.set(errorMessage(error) + ' Vérifiez la référence ' + input.number + '.');
        },
      });
  }

  private creationSucceeded(order: PurchaseOrder): void {
    const input = this.pendingCreation();
    this.busy.set(false);
    if (!input || !matchesPurchase(order, input)) {
      this.error.set('La réponse ne correspond pas à la commande en attente.');
      return;
    }
    this.clearCreation();
    this.creating.set(false);
    this.success.set('Commande fournisseur créée.');
    this.load(1);
    this.open(order.id);
  }

  close(): void {
    if (this.busy()) return;
    this.creating.set(false);
    this.detail.set(null);
    this.progress.set(null);
    this.pending.set(null);
  }

  open(id: string): void {
    if (this.busy()) return;
    this.creating.set(false);
    this.pending.set(null);
    this.detail.set(null);
    this.progress.set(null);
    this.productNames.set({});
    this.busy.set(true);
    forkJoin({ order: this.api.get(id), progress: this.api.progress(id) })
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: ({ order, progress }) => {
          if (
            progress.orderId !== order.id ||
            progress.status !== order.status ||
            progress.lines.length !== order.lines.length ||
            !order.lines.every((line) => progress.lines.some((item) => item.productId === line.productId))
          ) {
            this.error.set('La commande a changé. Actualisez son détail.');
            return;
          }
          this.detail.set(order);
          this.progress.set(progress);
          if (this.session.can('products.read')) {
            forkJoin(
              order.lines.map((line) =>
                this.productsApi.get(line.productId).pipe(catchError(() => of(null))),
              ),
            )
              .pipe(takeUntilDestroyed(this.destroy))
              .subscribe((products) => {
                if (this.detail()?.id !== order.id) return;
                this.productNames.set(
                  Object.fromEntries(
                    products.filter((p) => p !== null).map((p) => [p.id, p.name + ' · ' + p.sku]),
                  ),
                );
              });
          }
        },
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }

  ask(action: 'confirm' | 'cancel'): void {
    if (!this.busy() && this.detail()?.status === 'DRAFT' && this.session.can('inventory.manage'))
      this.pending.set(action);
  }

  applyAction(): void {
    const order = this.detail();
    const action = this.pending();
    if (this.busy() || !order || !action || order.status !== 'DRAFT' || !this.session.can('inventory.manage'))
      return;
    this.busy.set(true);
    this.error.set('');
    this.api
      .action(order.id, action)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (updated) => {
          this.pending.set(null);
          this.busy.set(false);
          this.detail.set(updated);
          this.success.set(action === 'confirm' ? 'Commande confirmée.' : 'Commande annulée.');
          this.load(1);
          this.open(updated.id);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.pending.set(null);
          this.error.set(errorMessage(error));
        },
      });
  }
}
