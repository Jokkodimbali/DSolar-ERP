import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { errorMessage } from '../../../core/api/http-error';
import { ConfirmComponent } from '../../../shared/ui/confirm.component';
import { FeedbackComponent } from '../../../shared/ui/feedback.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { SessionService } from '../../auth/application/session.service';
import { formatMoney } from '../../dashboard/domain/dashboard.contract';
import { storeId } from '../../stores/domain/store.contract';
import { allocationInput, type AllocationSnapshot } from '../domain/payment-allocation.contract';
import { paymentCents } from '../domain/payment.contract';
import { PaymentAllocationsApi } from '../infrastructure/payment-allocations.api';

type Action =
  | { kind: 'allocate'; paymentId: string; invoiceId: string; amount: string }
  | { kind: 'cancel'; paymentId: string; allocationId: string; reason: string };

@Component({
  selector: 'app-payment-allocations-page',
  imports: [RouterLink, ConfirmComponent, FeedbackComponent, PageHeaderComponent],
  templateUrl: './payment-allocations.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentAllocationsPage {
  private readonly api = inject(PaymentAllocationsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy = inject(DestroyRef);
  readonly session = inject(SessionService);
  readonly orderId = signal('');
  readonly data = signal<AllocationSnapshot | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly pending = signal<Action | null>(null);
  readonly error = signal('');
  readonly success = signal('');
  readonly money = formatMoney;
  eligibleInvoices(snapshot: AllocationSnapshot, payment: AllocationSnapshot['payments'][number]) {
    return snapshot.invoices.filter(
      (invoice) =>
        paymentCents(invoice.remaining) > 0n &&
        !payment.allocations.some((allocation) => allocation.invoiceId === invoice.id),
    );
  }
  readonly positive = (value: string) => paymentCents(value) > 0n;

  constructor() {
    try {
      this.orderId.set(storeId(this.route.snapshot.paramMap.get('id')));
      this.load();
    } catch {
      this.error.set('Référence de commande invalide.');
    }
  }

  load(): void {
    if (!this.orderId() || this.loading() || this.busy() || this.pending()) return;
    this.data.set(null);
    this.loading.set(true);
    this.api
      .snapshot(this.orderId())
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (snapshot) => this.data.set(snapshot),
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }

  askAllocate(paymentId: string, invoiceId: string, amount: string): void {
    const snapshot = this.data();
    if (!snapshot || this.loading() || this.busy() || this.pending() || !this.session.can('sales.manage'))
      return;
    this.error.set('');
    this.success.set('');
    try {
      this.pending.set({
        kind: 'allocate',
        paymentId,
        ...allocationInput(snapshot, paymentId, invoiceId, amount),
      });
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Affectation invalide.');
    }
  }

  askCancel(paymentId: string, allocationId: string, reason: string): void {
    const payment = this.data()?.payments.find((item) => item.id === paymentId);
    if (
      !payment?.active ||
      !payment.allocations.some((item) => item.id === allocationId) ||
      this.loading() ||
      this.busy() ||
      this.pending() ||
      !this.session.can('sales.manage')
    )
      return;
    const normalized = reason.trim();
    this.error.set('');
    this.success.set('');
    if (normalized.length < 10 || normalized.length > 500) {
      this.error.set('Le motif doit contenir de 10 à 500 caractères.');
      return;
    }
    this.pending.set({ kind: 'cancel', paymentId, allocationId, reason: normalized });
  }

  apply(): void {
    const action = this.pending();
    if (!action || this.busy() || this.loading() || !this.session.can('sales.manage')) return;
    const orderId = this.orderId();
    const request =
      action.kind === 'allocate'
        ? this.api.allocate(orderId, action.paymentId, { invoiceId: action.invoiceId, amount: action.amount })
        : this.api.cancel(orderId, action.paymentId, action.allocationId, action.reason);
    this.busy.set(true);
    request.pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: (snapshot) => {
        this.busy.set(false);
        this.pending.set(null);
        this.data.set(snapshot);
        this.success.set(action.kind === 'allocate' ? 'Règlement affecté.' : 'Affectation annulée.');
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.pending.set(null);
        this.error.set(errorMessage(error) + ' Vérifiez les affectations avant de réessayer.');
        this.load();
      },
    });
  }
}
