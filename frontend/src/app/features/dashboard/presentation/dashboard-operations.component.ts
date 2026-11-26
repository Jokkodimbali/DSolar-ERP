import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { errorMessage } from '../../../core/api/http-error';
import { RouterLink } from '@angular/router';
import { ProductThumbnailComponent } from '../../../shared/ui/product-thumbnail.component';
import { FeedbackComponent } from '../../../shared/ui/feedback.component';
import { UiIconComponent } from '../../../shared/ui/ui-icon.component';
import { SessionService } from '../../auth/application/session.service';
import type { RecentOrder, StoreAlerts } from '../domain/dashboard-operations.contract';
import { DashboardOperationsApi } from '../infrastructure/dashboard-operations.api';

@Component({
  selector: 'app-dashboard-operations',
  imports: [FeedbackComponent, UiIconComponent, RouterLink, ProductThumbnailComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-operations.component.html',
})
export class DashboardOperationsComponent {
  private readonly api = inject(DashboardOperationsApi);
  private readonly destroy = inject(DestroyRef);
  readonly session = inject(SessionService);
  readonly alerts = signal<StoreAlerts[] | null>(null);
  readonly orders = signal<RecentOrder[] | null>(null);
  readonly alertCount = computed(() => this.alerts()?.reduce((sum, store) => sum + store.items.length, 0));
  readonly alertsLoading = signal(false);
  readonly ordersLoading = signal(false);
  readonly alertsError = signal('');
  readonly ordersError = signal('');

  constructor() {
    this.loadAlerts();
    this.loadOrders();
  }

  loadAlerts(): void {
    if (this.alertsLoading() || !this.session.can('stores.read', 'inventory.read')) return;
    this.alertsLoading.set(true);
    this.alertsError.set('');
    this.alerts.set(null);
    this.api
      .alerts()
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.alertsLoading.set(false)),
      )
      .subscribe({
        next: (alerts) => this.alerts.set(alerts),
        error: (error: unknown) => this.alertsError.set(errorMessage(error)),
      });
  }

  loadOrders(): void {
    if (this.ordersLoading() || !this.session.can('sales.read')) return;
    this.ordersLoading.set(true);
    this.ordersError.set('');
    this.orders.set(null);
    this.api
      .orders()
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.ordersLoading.set(false)),
      )
      .subscribe({
        next: (orders) => this.orders.set(orders),
        error: (error: unknown) => this.ordersError.set(errorMessage(error)),
      });
  }
}
