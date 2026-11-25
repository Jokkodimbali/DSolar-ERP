import { Component, ChangeDetectionStrategy, inject, signal, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { DashboardApi } from '../infrastructure/dashboard.api';
import { type Overview, formatMoney } from '../domain/dashboard.contract';
import { DashboardReportComponent } from './dashboard-report.component';
import { reports } from '../domain/dashboard-reports.contract';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { KpiCardComponent } from '../../../shared/ui/kpi-card.component';
import { FeedbackComponent } from '../../../shared/ui/feedback.component';
import { errorMessage } from '../../../core/api/http-error';
@Component({
  selector: 'app-dashboard-page',
  imports: [DashboardReportComponent, PageHeaderComponent, FeedbackComponent, KpiCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <app-page-header
      eyebrow="VUE D’ENSEMBLE"
      heading="Tableau de bord"
      description="Indicateurs réels de votre activité."
    >
      <button type="button" class="secondary" [disabled]="loading()" (click)="load()">Actualiser</button>
    </app-page-header>
    <app-feedback [message]="loading() ? 'Chargement des indicateurs…' : ''" />
    <app-feedback [message]="error()" kind="error" />
    @if (data(); as d) {
      <div class="kpi-grid">
        <app-kpi-card
          icon="trend"
          label="Facturation nette"
          [value]="money(d.netInvoiced)"
          description="Après déduction des avoirs"
        />
        <app-kpi-card
          icon="box"
          tone="blue"
          label="Commandes confirmées"
          [value]="d.confirmedOrders"
          description="Vue globale"
        />
        <app-kpi-card
          icon="store"
          tone="orange"
          label="Magasins"
          [value]="d.stores"
          description="Vue globale"
        />
        <app-kpi-card
          icon="wallet"
          tone="green"
          label="Encaissements"
          [value]="money(d.collected)"
          description="Montant enregistré"
        />
      </div>
      <section class="panel">
        <h2>Activité de l'entreprise</h2>
        <dl class="metrics">
          <div>
            <dt>Produits actifs</dt>
            <dd>{{ d.activeProducts }}</dd>
          </div>
          <div>
            <dt>Clients</dt>
            <dd>{{ d.customers }}</dd>
          </div>
          <div>
            <dt>Fournisseurs</dt>
            <dd>{{ d.suppliers }}</dd>
          </div>
          <div>
            <dt>Achats en attente</dt>
            <dd>{{ d.pendingPurchaseOrders }}</dd>
          </div>
          <div>
            <dt>Factures émises</dt>
            <dd>{{ d.issuedInvoices }}</dd>
          </div>
          <div>
            <dt>Avoirs</dt>
            <dd>{{ money(d.creditNotes) }}</dd>
          </div>
        </dl>
      </section>
    }
    <div class="dashboard-grid">
      @for (report of featuredReports; track report.path) {
        <app-dashboard-report [definition]="report" />
      }
    </div>
    <div class="dashboard-reports">
      @for (report of otherReports; track report.path) {
        <app-dashboard-report [definition]="report" />
      }
    </div>`,
})
export class DashboardPage {
  private readonly api = inject(DashboardApi);
  private readonly destroy = inject(DestroyRef);
  readonly data = signal<Overview | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly money = formatMoney;
  readonly featuredReports = ['monthly-revenue', 'overview', 'store-sales', 'recent-activity'].flatMap(
    (path) => reports.filter((report) => report.path === path),
  );
  readonly otherReports = reports.filter((report) => !this.featuredReports.includes(report));
  constructor() {
    this.load();
  }
  load(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.data.set(null);
    this.api
      .overview()
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({ next: (d) => this.data.set(d), error: (e: unknown) => this.error.set(errorMessage(e)) });
  }
}
