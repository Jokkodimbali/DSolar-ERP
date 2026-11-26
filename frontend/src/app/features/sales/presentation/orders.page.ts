import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { BehaviorSubject, catchError, combineLatest, finalize, of, switchMap } from 'rxjs';
import { errorMessage } from '../../../core/api/http-error';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { FeedbackComponent } from '../../../shared/ui/feedback.component';
import {
  matchesOrderAction,
  orderActions,
  orderStatusLabels,
  type OrderAction,
  type OrderStatus,
  type parseOrderDetail,
  type parseOrderPage,
} from '../domain/order-view.contract';
import { ConfirmComponent } from '../../../shared/ui/confirm.component';
import { PaginationComponent } from '../../../shared/ui/pagination.component';
import { SessionService } from '../../auth/application/session.service';
import { OrderViewApi } from '../infrastructure/order-view.api';

@Component({
  selector: 'app-orders-page',
  imports: [PageHeaderComponent, FeedbackComponent, RouterLink, ConfirmComponent, PaginationComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './orders.page.html',
})
export class OrdersPage {
  private readonly api = inject(OrderViewApi);
  private readonly destroy = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  readonly detail = signal<ReturnType<typeof parseOrderDetail> | null>(null);
  readonly result = signal<ReturnType<typeof parseOrderPage> | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly page = signal(1);
  readonly query = signal('');
  readonly detailMode = this.route.snapshot.paramMap.has('id');
  readonly session = inject(SessionService);
  readonly busy = signal(false);
  readonly success = signal('');
  readonly pending = signal<OrderAction | null>(null);
  readonly status = signal<OrderStatus | ''>('');
  readonly statuses = Object.keys(orderStatusLabels) as OrderStatus[];
  readonly labels = orderStatusLabels;
  readonly actions = orderActions;
  private readonly reload = new BehaviorSubject(0);

  constructor() {
    if (this.detailMode) {
      combineLatest([this.route.paramMap, this.reload])
        .pipe(
          switchMap(([params]) => {
            this.detail.set(null);
            this.pending.set(null);
            this.error.set('');
            this.loading.set(true);
            const id = params.get('id') ?? '';
            if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) {
              this.error.set('Référence de commande invalide.');
              this.loading.set(false);
              return of(null);
            }
            return this.api.detail(id).pipe(
              catchError((error: unknown) => {
                this.error.set(errorMessage(error));
                return of(null);
              }),
              finalize(() => this.loading.set(false)),
            );
          }),
          takeUntilDestroyed(this.destroy),
        )
        .subscribe((value) => this.detail.set(value));
    } else {
      this.load(1);
    }
  }

  search(value: string, status = ''): void {
    if (this.loading() || this.busy()) return;
    this.query.set(value.trim());
    this.status.set(this.statuses.find((item) => item === status) ?? '');
    this.load(1);
  }

  refreshDetail(): void {
    if (!this.busy() && !this.loading() && !this.pending()) this.reload.next(this.reload.value + 1);
  }

  ask(action: OrderAction): void {
    const item = this.detail();
    if (
      !item || this.loading() || this.busy() || this.pending() ||
      !this.session.can('sales.manage') || !this.actions(item.rawStatus).includes(action)
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
      !item || !action || this.busy() || this.loading() ||
      !this.session.can('sales.manage') || !this.actions(item.rawStatus).includes(action)
    )
      return;
    this.busy.set(true);
    this.api
      .action(item.id, action)
      .pipe(takeUntilDestroyed(this.destroy), finalize(() => this.busy.set(false)))
      .subscribe({
        next: (updated) => {
          this.pending.set(null);
          if (this.route.snapshot.paramMap.get('id') !== item.id) return;
          if (!matchesOrderAction(updated, item.id, action)) {
            this.detail.set(null);
            this.error.set('État non confirmé. Actualisez la commande.');
            return;
          }
          this.detail.set(updated);
          this.success.set(action === 'confirm' ? 'Commande confirmée. Stock réservé.' : 'Commande annulée.');
        },
        error: (error: unknown) => {
          this.pending.set(null);
          if (this.route.snapshot.paramMap.get('id') !== item.id) return;
          this.detail.set(null);
          this.error.set(errorMessage(error) + ' Actualisez la commande avant toute nouvelle opération.');
        },
      });
  }

  load(page: number): void {
    if (this.loading() || page < 1) return;
    this.loading.set(true);
    this.error.set('');
    this.result.set(null);
    this.page.set(page);
    this.api
      .list(page, this.query(), this.status())
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (result) => this.result.set(result),
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }
}
