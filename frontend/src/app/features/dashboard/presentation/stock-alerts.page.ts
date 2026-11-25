import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { errorMessage } from '../../../core/api/http-error';
import { FeedbackComponent } from '../../../shared/ui/feedback.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { ProductThumbnailComponent } from '../../../shared/ui/product-thumbnail.component';
import type { StoreAlerts } from '../domain/dashboard-operations.contract';
import { DashboardOperationsApi } from '../infrastructure/dashboard-operations.api';

@Component({
  selector: 'app-stock-alerts-page',
  imports: [PageHeaderComponent, FeedbackComponent, ProductThumbnailComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      eyebrow="STOCKS"
      heading="Alertes de stock"
      description="Disponibilité actuelle par magasin actif. Seuil : 5 unités."
    >
      <button type="button" class="secondary" [disabled]="loading()" (click)="load()">Actualiser</button>
    </app-page-header>
    <app-feedback [message]="error()" kind="error" />
    <app-feedback [message]="loading() ? 'Chargement…' : ''" />
    @for (store of alerts(); track store.storeId) {
      <section class="panel">
        <h2>{{ store.storeName }} · {{ store.items.length }} alerte(s)</h2>
        @for (item of store.items; track item.productId) {
          <div class="stock-alert-item">
            <app-product-thumbnail [productId]="item.productId" />
            <div class="stock-product-text">
              <strong>{{ item.name }}</strong>
              <p class="muted small">{{ item.sku }} · {{ item.available }} {{ item.unit }}</p>
            </div>
            <span class="ui-status" [class.stock-critical]="item.severity === 'OUT_OF_STOCK'">{{
              item.severity === 'OUT_OF_STOCK' ? 'Rupture' : 'Stock faible'
            }}</span>
          </div>
        } @empty {
          <p class="muted">Aucune alerte pour ce magasin.</p>
        }
      </section>
    } @empty {
      @if (!loading() && !error()) {
        <section class="panel">
          <p>Aucun magasin actif.</p>
          <a routerLink="/magasins" class="dashboard-see-all">Consulter les magasins</a>
        </section>
      }
    }
  `,
})
export class StockAlertsPage {
  private readonly api = inject(DashboardOperationsApi);
  private readonly destroy = inject(DestroyRef);
  readonly alerts = signal<StoreAlerts[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');

  constructor() {
    this.load();
  }

  load(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.alerts.set([]);
    this.api
      .alerts()
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (alerts) => this.alerts.set(alerts),
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }
}
