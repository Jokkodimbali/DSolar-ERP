import { Component, ChangeDetectionStrategy, inject, signal, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { DashboardApi } from '../infrastructure/dashboard.api';
import { type Overview, formatMoney } from '../domain/dashboard.contract';
import { DashboardReportComponent } from './dashboard-report.component';
import { reports } from '../domain/dashboard-reports.contract';
import { errorMessage } from '../../../core/api/http-error';
@Component({
  selector: 'app-dashboard-page',
  imports: [DashboardReportComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <div class="page-heading">
      <div>
        <p class="eyebrow">VUE D'ENSEMBLE</p>
        <h1>Tableau de bord</h1>
        <p class="muted">Indicateurs réels de votre activité.</p>
      </div>
      <button type="button" class="secondary" [disabled]="loading()" (click)="load()">Actualiser</button>
    </div>
    @if (loading()) {
      <p role="status">Chargement des indicateurs…</p>
    }
    @if (error()) {
      <p class="field-error" role="alert">{{ error() }}</p>
    }
    @if (data(); as d) {
      <div class="kpi-grid">
        <article class="panel kpi">
          <span>Facturation nette</span><strong>{{ money(d.netInvoiced) }}</strong
          ><small>Après déduction des avoirs</small>
        </article>
        <article class="panel kpi">
          <span>Encaissements</span><strong>{{ money(d.collected) }}</strong
          ><small>Montant enregistré</small>
        </article>
        <article class="panel kpi">
          <span>Commandes confirmées</span><strong>{{ d.confirmedOrders }}</strong
          ><small>Selon le backend</small>
        </article>
        <article class="panel kpi">
          <span>Magasins</span><strong>{{ d.stores }}</strong
          ><small>Vue globale</small>
        </article>
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
    @for (report of reports; track report.path) {
      <app-dashboard-report [definition]="report" />
    }`,
})
export class DashboardPage {
  private readonly api = inject(DashboardApi);
  private readonly destroy = inject(DestroyRef);
  readonly data = signal<Overview | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly money = formatMoney;
  readonly reports = reports;
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
