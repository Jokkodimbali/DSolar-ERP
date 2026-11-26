import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
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
import { canReverse, parsePaymentInput, paymentInput, paymentMethods, paymentStorageKey, type Payment, type PaymentInput, type PaymentMethod, type PaymentSummary } from '../domain/payment.contract';
import { PaymentsApi } from '../infrastructure/payments.api';
import { SalesDocumentButtonComponent } from './sales-document-button.component';

@Component({
  selector: 'app-order-payments-page',
  imports: [DatePipe, RouterLink, ConfirmComponent, FeedbackComponent, PageHeaderComponent, SalesDocumentButtonComponent],
  templateUrl: './order-payments.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderPaymentsPage {
  private readonly api = inject(PaymentsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy = inject(DestroyRef);
  readonly session = inject(SessionService);
  readonly orderId = signal('');
  readonly summary = signal<PaymentSummary | null>(null);
  readonly pending = signal<PaymentInput | null>(null);
  readonly confirmation = signal<PaymentInput | null>(null);
  readonly reversal = signal<{ payment: Payment; reason: string } | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly blocked = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly methods = Object.keys(paymentMethods) as PaymentMethod[];
  readonly labels = paymentMethods;
  readonly money = formatMoney;
  readonly canReverse = canReverse;
  private storage: string | null = null;

  constructor() {
    try {
      this.orderId.set(storeId(this.route.snapshot.paramMap.get('id')));
      const actor = this.session.user()?.id;
      if (actor && this.session.can('sales.manage')) {
        this.storage = paymentStorageKey(actor, this.orderId());
        const saved = sessionStorage.getItem(this.storage);
        if (saved !== null) this.pending.set(parsePaymentInput(JSON.parse(saved)));
      }
    } catch {
      this.blocked.set(true);
      this.error.set('Référence ou demande locale invalide. Vérifiez la commande et le stockage du navigateur.');
    }
    if (this.orderId()) this.load();
  }

  load(): void {
    if (this.loading() || this.busy() || this.confirmation() || this.reversal()) return;
    this.loading.set(true);
    this.summary.set(null);
    this.api.summary(this.orderId()).pipe(takeUntilDestroyed(this.destroy), finalize(() => this.loading.set(false)))
      .subscribe({ next: (summary) => this.summary.set(summary), error: (error: unknown) => this.error.set(errorMessage(error)) });
  }

  askRecord(amount: string, method: string, reference: string): void {
    const summary = this.summary();
    if (!summary || this.loading() || this.busy() || this.blocked() || this.pending() || this.confirmation() ||
      this.reversal() || !this.session.can('sales.manage')) return;
    this.error.set('');
    this.success.set('');
    try {
      this.confirmation.set(paymentInput(summary, amount, method, crypto.randomUUID(), reference));
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Règlement invalide.');
    }
  }

  confirmRecord(): void {
    const input = this.confirmation();
    if (!input || this.busy() || this.blocked() || this.pending() || !this.session.can('sales.manage')) return;
    try {
      if (!this.storage) throw new Error('Session indisponible.');
      sessionStorage.setItem(this.storage, JSON.stringify(input));
      this.pending.set(input);
      this.confirmation.set(null);
      this.resume();
    } catch {
      this.error.set('Impossible de conserver la demande. Aucun règlement envoyé.');
    }
  }

  resume(): void {
    const input = this.pending();
    if (!input || this.busy() || this.loading() || this.blocked() || !this.session.can('sales.manage')) return;
    this.busy.set(true);
    this.error.set('');
    this.api.record(this.orderId(), input).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: (summary) => {
        this.busy.set(false);
        this.summary.set(summary);
        try {
          if (this.storage) sessionStorage.removeItem(this.storage);
          this.pending.set(null);
          this.success.set('Règlement enregistré et vérifié.');
        } catch {
          this.error.set('Règlement enregistré, mais la demande locale ne peut pas être effacée.');
        }
      },
      error: (error: unknown) => {
        this.busy.set(false);
        if (error instanceof HttpErrorResponse && error.status === 400) {
          try {
            if (this.storage) sessionStorage.removeItem(this.storage);
            this.pending.set(null);
          } catch {
            // Conserver la demande originale.
          }
        }
        this.error.set(errorMessage(error) + ' En cas de résultat incertain, reprenez le même règlement.');
        this.load();
      },
    });
  }

  askReverse(payment: Payment, reason: string): void {
    const summary = this.summary();
    if (!summary || !canReverse(summary, payment) || this.busy() || this.loading() || this.pending() ||
      this.confirmation() || this.reversal() || !this.session.can('sales.manage')) return;
    const normalized = reason.trim();
    this.error.set('');
    this.success.set('');
    if (normalized.length < 10 || normalized.length > 500) {
      this.error.set('Le motif de contrepassation doit contenir de 10 à 500 caractères.');
      return;
    }
    this.reversal.set({ payment, reason: normalized });
  }

  reverse(): void {
    const action = this.reversal();
    if (!action || this.busy() || !this.session.can('sales.manage')) return;
    this.busy.set(true);
    this.api.reverse(this.orderId(), action.payment.id, action.reason)
      .pipe(takeUntilDestroyed(this.destroy)).subscribe({
        next: (summary) => {
          this.busy.set(false);
          this.reversal.set(null);
          this.summary.set(summary);
          this.success.set('Règlement contrepassé.');
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.reversal.set(null);
          this.error.set(errorMessage(error) + ' Vérifiez le récapitulatif avant de réessayer.');
          this.load();
        },
      });
  }
}
