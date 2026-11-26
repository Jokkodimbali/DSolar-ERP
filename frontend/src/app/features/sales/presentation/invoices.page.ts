import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, finalize, forkJoin, map, of, switchMap } from 'rxjs';
import { errorMessage } from '../../../core/api/http-error';
import { ConfirmComponent } from '../../../shared/ui/confirm.component';
import { FeedbackComponent } from '../../../shared/ui/feedback.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { PaginationComponent } from '../../../shared/ui/pagination.component';
import { SessionService } from '../../auth/application/session.service';
import { formatMoney } from '../../dashboard/domain/dashboard.contract';
import { ProductsApi } from '../../products/infrastructure/products.api';
import { storeId } from '../../stores/domain/store.contract';
import { canInvoice, invoiceLabels, type Invoice, type InvoiceAction, type InvoiceStatus, type parseInvoicePage } from '../domain/invoice.contract';
import type { OrderDetail } from '../domain/order-view.contract';
import { CustomersApi } from '../infrastructure/customers.api';
import { InvoicesApi } from '../infrastructure/invoices.api';
import { OrderViewApi } from '../infrastructure/order-view.api';
import { SalesDocumentButtonComponent } from './sales-document-button.component';

@Component({
  selector: 'app-invoices-page',
  imports: [DatePipe, RouterLink, ConfirmComponent, FeedbackComponent, PageHeaderComponent, PaginationComponent, SalesDocumentButtonComponent],
  templateUrl: './invoices.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvoicesPage {
  private readonly api = inject(InvoicesApi);
  private readonly orders = inject(OrderViewApi);
  private readonly customers = inject(CustomersApi);
  private readonly products = inject(ProductsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy = inject(DestroyRef);
  readonly session = inject(SessionService);
  readonly order = signal<OrderDetail | null>(null);
  readonly linked = signal<Invoice | null>(null);
  readonly checked = signal(false);
  readonly result = signal<ReturnType<typeof parseInvoicePage> | null>(null);
  readonly detail = signal<Invoice | null>(null);
  readonly names = signal<Record<string, string>>({});
  readonly productsNames = signal<Record<string, string>>({});
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly pending = signal<InvoiceAction | 'create' | null>(null);
  readonly query = signal('');
  readonly status = signal<InvoiceStatus | ''>('');
  readonly labels = invoiceLabels;
  readonly statuses = Object.keys(invoiceLabels) as InvoiceStatus[];
  readonly money = formatMoney;
  readonly eligible = canInvoice;
  private orderId: string | undefined;

  constructor() {
    try {
      const id = this.route.snapshot.paramMap.get('id');
      this.orderId = id ? storeId(id) : undefined;
      this.load(1);
    } catch {
      this.error.set('Référence de commande invalide.');
    }
  }

  filter(query: string, status: string): void {
    if (this.busy() || this.loading() || this.pending()) return;
    this.query.set(query.trim());
    this.status.set(this.statuses.find((value) => value === status) ?? '');
    this.load(1);
  }

  load(page = this.result()?.page ?? 1): void {
    if (this.loading() || this.busy() || this.pending()) return;
    this.loading.set(true);
    this.checked.set(false);
    const order = this.orderId ? this.orders.detail(this.orderId).pipe(
      switchMap((item) => this.api.linked(item).pipe(map((invoice) => ({ item, invoice })))),
    ) : of(null);
    forkJoin({ order, result: this.api.search(page, this.query(), this.status(), this.orderId) })
      .pipe(takeUntilDestroyed(this.destroy), finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ order, result }) => {
          this.order.set(order?.item ?? null);
          if (order) {
            this.names.update((names) => ({ ...names, [order.item.customerId]: order.item.customerName }));
            this.productsNames.update((names) => ({
              ...names,
              ...Object.fromEntries(order.item.lines.map((line) => [line.productId, line.product + ' · ' + line.sku])),
            }));
          }
          this.linked.set(order?.invoice ?? null);
          this.checked.set(true);
          this.result.set(result);
          const ids = [...new Set(result.items.map((item) => item.customerId))];
          if (ids.length) forkJoin(ids.map((id) => this.customers.get(id).pipe(catchError(() => of(null)))))
            .pipe(takeUntilDestroyed(this.destroy))
            .subscribe((items) => this.names.update((names) => ({
              ...names, ...Object.fromEntries(items.filter((item) => item !== null).map((item) => [item.id, item.name])),
            })));
        },
        error: (error: unknown) => {
          this.result.set(null);
          this.error.set(errorMessage(error));
        },
      });
  }

  open(id: string): void {
    if (this.loading() || this.busy() || this.pending()) return;
    this.error.set('');
    this.busy.set(true);
    this.api.get(id).pipe(takeUntilDestroyed(this.destroy), finalize(() => this.busy.set(false))).subscribe({
      next: (invoice) => {
        this.detail.set(invoice);
        if (!this.session.can('products.read')) return;
        const ids = [...new Set(invoice.lines.map((line) => line.productId))];
        forkJoin(ids.map((productId) => this.products.get(productId).pipe(catchError(() => of(null)))))
          .pipe(takeUntilDestroyed(this.destroy))
          .subscribe((items) => this.productsNames.update((names) => ({
            ...names, ...Object.fromEntries(items.filter((item) => item !== null).map((item) => [item.id, item.name + ' · ' + item.sku])),
          })));
      },
      error: (error: unknown) => this.error.set(errorMessage(error)),
    });
  }

  ask(action: InvoiceAction | 'create'): void {
    if (this.loading() || this.busy() || this.pending() || !this.session.can('sales.manage')) return;
    const order = this.order();
    if (action === 'create' ? !order || !canInvoice(order) || !this.checked() || this.linked() : this.detail()?.status !== 'DRAFT') return;
    this.error.set('');
    this.success.set('');
    this.pending.set(action);
  }

  apply(): void {
    const action = this.pending();
    const order = this.order();
    const detail = this.detail();
    if (!action || this.busy() || !this.session.can('sales.manage')) return;
    if (action === 'create' ? !order || !canInvoice(order) || !this.checked() || this.linked() : detail?.status !== 'DRAFT') return;
    const request = action === 'create' && order ? this.api.create(order) : detail && action !== 'create' ? this.api.action(detail.id, action) : null;
    if (!request) return;
    this.busy.set(true);
    request.pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: (invoice) => {
        this.busy.set(false);
        this.pending.set(null);
        this.detail.set(invoice);
        this.success.set('Facture ' + invoice.number + ' : ' + this.labels[invoice.status] + '.');
        this.load(1);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.pending.set(null);
        this.detail.set(null);
        this.error.set(errorMessage(error) + ' Vérifiez la facture associée avant de réessayer.');
        this.load(1);
      },
    });
  }
}
