import { Component, ChangeDetectionStrategy, inject, signal, DestroyRef, viewChild, viewChildren } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { SessionService } from '../../auth/application/session.service';
import { DashboardApi } from '../infrastructure/dashboard.api';
import { type Overview, formatMoney } from '../domain/dashboard.contract';
import { DashboardOperationsComponent } from './dashboard-operations.component';
import { DashboardReportComponent } from './dashboard-report.component';
import { reports } from '../domain/dashboard-reports.contract';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { UiIconComponent } from '../../../shared/ui/ui-icon.component';
import { KpiCardComponent } from '../../../shared/ui/kpi-card.component';
import { FeedbackComponent } from '../../../shared/ui/feedback.component';
import { errorMessage } from '../../../core/api/http-error';
@Component({
  selector: 'app-dashboard-page',
  imports: [
    DashboardReportComponent,
    DashboardOperationsComponent,
    PageHeaderComponent,
    FeedbackComponent,
    KpiCardComponent,
    UiIconComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <app-page-header
      [eyebrow]="'Bonjour, ' + (session.user()?.nomComplet ?? '')"
      heading="Tableau de bord"
      description="Vue d’ensemble de l’activité de votre entreprise."
    >
      <button type="button" class="dashboard-refresh" [disabled]="loading()" (click)="load()">
        <app-ui-icon name="refresh" /> Actualiser
      </button>
    </app-page-header>
    <app-feedback [message]="loading() ? 'Chargement des indicateurs…' : ''" />
    <app-feedback [message]="error()" kind="error" />
    <div class="kpi-grid">
      <app-kpi-card
        icon="trend"
        label="Facturation nette"
        [value]="displayMoney(data()?.netInvoiced)"
        description="Après déduction des avoirs"
      />
      <app-kpi-card
        icon="box"
        tone="blue"
        label="Commandes confirmées"
        [value]="data()?.confirmedOrders ?? '—'"
        description="Commandes enregistrées"
      />
      <app-kpi-card
        icon="alert"
        tone="orange"
        label="Alertes de stock"
        [value]="operations()?.alertCount() ?? '—'"
        description="Magasins actifs"
      />
      <app-kpi-card
        icon="wallet"
        tone="green"
        label="Encaissements"
        [value]="displayMoney(data()?.collected)"
        description="Montant enregistré"
      />
    </div>
    <app-dashboard-operations>
      @if (revenueReport; as report) {
        <app-dashboard-report dashboardRevenue [definition]="report" />
      }
      @if (activityReport; as report) {
        <app-dashboard-report dashboardActivity [definition]="report" />
      }
    </app-dashboard-operations>
    <button
      type="button"
      class="dashboard-more"
      [attr.aria-expanded]="showReports()"
      aria-controls="dashboard-detail-reports"
      (click)="showReports.set(!showReports())"
    >
      {{ showReports() ? 'Masquer les rapports détaillés' : 'Afficher les rapports détaillés' }}
      <span aria-hidden="true">{{ showReports() ? '−' : '+' }}</span>
    </button>
    <section id="dashboard-detail-reports" [hidden]="!showReports()">
    @if (showReports()) {
    @if (data(); as d) {
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
    <div class="dashboard-reports">
      @for (report of otherReports; track report.path) {
        <app-dashboard-report [definition]="report" />
      }
    </div>
    }
    </section>`,
})
export class DashboardPage {
  private readonly api = inject(DashboardApi);
  private readonly destroy = inject(DestroyRef);
  readonly data = signal<Overview | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly money = formatMoney;
  readonly session = inject(SessionService);
  readonly operations = viewChild(DashboardOperationsComponent);
  readonly reportComponents = viewChildren(DashboardReportComponent);
  readonly showReports = signal(false);
  readonly revenueReport = reports.find((report) => report.path === 'monthly-revenue');
  readonly activityReport = reports.find((report) => report.path === 'recent-activity');
  readonly otherReports = reports.filter(
    (report) => report !== this.revenueReport && report !== this.activityReport,
  );
  displayMoney(value: string | null | undefined): string {
    return value === undefined || value === null ? '—' : formatMoney(value);
  }
  constructor() {
    this.load();
  }
  load(): void {
    if (this.loading()) return;
    this.operations()?.loadAlerts();
    this.operations()?.loadOrders();
    for (const report of this.reportComponents()) report.load();
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
