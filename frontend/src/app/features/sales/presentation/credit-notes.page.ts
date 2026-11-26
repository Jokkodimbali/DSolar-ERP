import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, finalize, forkJoin, map, of } from 'rxjs';
import { errorMessage } from '../../../core/api/http-error';
import { ConfirmComponent } from '../../../shared/ui/confirm.component';
import { FeedbackComponent } from '../../../shared/ui/feedback.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { SessionService } from '../../auth/application/session.service';
import { formatMoney } from '../../dashboard/domain/dashboard.contract';
import { storeId } from '../../stores/domain/store.contract';
import { creditLineInput, creditLines, creditStorageKey, parseCreditCommand, type CreditCommand, type CreditNote, type CreditPreview } from '../domain/credit-note.contract';
import type { Invoice } from '../domain/invoice.contract';
import { CreditNotesApi } from '../infrastructure/credit-notes.api';
import { SalesDocumentButtonComponent } from './sales-document-button.component';
import { ProductsApi } from '../../products/infrastructure/products.api';
import { InvoicesApi } from '../infrastructure/invoices.api';

@Component({
  selector: 'app-credit-notes-page',
  imports: [DatePipe, RouterLink, ConfirmComponent, FeedbackComponent, PageHeaderComponent, SalesDocumentButtonComponent],
  templateUrl: './credit-notes.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreditNotesPage {
  private readonly api = inject(CreditNotesApi);
  private readonly invoices = inject(InvoicesApi);
  private readonly products = inject(ProductsApi);
  readonly productNames = signal<Record<string, string>>({});
  private readonly route = inject(ActivatedRoute);
  private readonly destroy = inject(DestroyRef);
  readonly session = inject(SessionService);
  readonly invoiceId = signal('');
  readonly invoice = signal<Invoice | null>(null);
  readonly notes = signal<CreditNote[]>([]);
  readonly rows = signal<ReturnType<typeof creditLines>>([]);
  readonly values = signal<Record<string, string>>({});
  readonly preview = signal<CreditPreview | null>(null);
  readonly command = signal<CreditCommand | null>(null);
  readonly pending = signal<CreditCommand | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly blocked = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly money = formatMoney;
  private storage: string | null = null;

  constructor() {
    try {
      this.invoiceId.set(storeId(this.route.snapshot.paramMap.get('id')));
      const actor = this.session.user()?.id;
      if (actor && this.session.can('sales.manage')) {
        this.storage = creditStorageKey(actor, this.invoiceId());
        const saved = sessionStorage.getItem(this.storage);
        if (saved !== null) this.pending.set(parseCreditCommand(JSON.parse(saved)));
      }
    } catch {
      this.blocked.set(true);
      this.error.set('Référence ou demande locale invalide. Vérifiez le stockage du navigateur.');
    }
    if (this.invoiceId()) this.load();
  }

  load(): void {
    if (this.loading() || this.busy() || this.command()) return;
    this.invoice.set(null);
    this.loading.set(true);
    forkJoin({ invoice: this.invoices.get(this.invoiceId()), notes: this.api.list(this.invoiceId()) })
      .pipe(map(({ invoice, notes }) => ({ invoice, notes, rows: creditLines(invoice, notes) })), takeUntilDestroyed(this.destroy), finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ invoice, notes, rows }) => { this.invoice.set(invoice); this.notes.set(notes); this.rows.set(rows);
          if (this.session.can('products.read')) {
            const ids = [...new Set(rows.map((line) => line.productId))];
            if (ids.length) forkJoin(ids.map((id) => this.products.get(id).pipe(catchError(() => of(null)))))
              .pipe(takeUntilDestroyed(this.destroy))
              .subscribe((products) => this.productNames.set(Object.fromEntries(products.filter((product) => product !== null).map((product) => [product.id, product.name + ' · ' + product.sku]))));
          }
        },
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }
  change(id: string, value: string): void {
    if (this.busy() || this.pending() || this.command()) return;
    this.values.update((items) => ({ ...items, [id]: value }));
  }
  ask(reason: string): void {
    const invoice = this.invoice();
    if (!invoice || this.busy() || this.loading() || this.blocked() || this.pending() || this.command() || !this.session.can('sales.manage')) return;
    this.error.set('');
    this.success.set('');
    try {
      const normalized = reason.trim();
      if (normalized.length < 10 || normalized.length > 500) throw new Error('Motif obligatoire : 10 à 500 caractères.');
      const lines = creditLineInput(invoice, this.notes(), this.values());
      this.busy.set(true);
      this.api.preview(invoice.id, lines).pipe(takeUntilDestroyed(this.destroy), finalize(() => this.busy.set(false)))
        .subscribe({
          next: (preview) => {
            this.preview.set(preview);
            this.command.set({ operationKey: crypto.randomUUID(), amount: preview.amount, reason: normalized, lines });
          },
          error: (error: unknown) => this.error.set(errorMessage(error)),
        });
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Avoir invalide.');
    }
  }
  confirm(): void {
    const command = this.command();
    if (!command || this.busy() || this.blocked() || this.pending() || !this.session.can('sales.manage')) return;
    try {
      if (!this.storage) throw new Error('Session indisponible.');
      sessionStorage.setItem(this.storage, JSON.stringify(command));
      this.pending.set(command);
      this.cancel();
      this.resume();
    } catch {
      this.error.set('Impossible de conserver la demande. Aucun avoir envoyé.');
    }
  }
  cancel(): void { this.command.set(null); this.preview.set(null); }
  resume(): void {
    const command = this.pending();
    if (!command || this.busy() || this.loading() || this.blocked() || !this.session.can('sales.manage')) return;
    this.busy.set(true);
    this.error.set('');
    this.api.issue(this.invoiceId(), command).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: (note) => {
        this.busy.set(false);
        try {
          if (this.storage) sessionStorage.removeItem(this.storage);
          this.pending.set(null);
          this.values.set({});
          this.success.set('Avoir émis : ' + note.number + '.');
          this.load();
        } catch { this.error.set('Avoir enregistré, mais demande locale non effacée.'); }
      },
      error: (error: unknown) => {
        this.busy.set(false);
        if (error instanceof HttpErrorResponse && error.status === 400) {
          try { if (this.storage) sessionStorage.removeItem(this.storage); this.pending.set(null); } catch { /* Conserver la référence. */ }
        }
        this.error.set(errorMessage(error) + ' Vérifiez l’historique avant de reprendre la même demande.');
        this.load();
      },
    });
  }
}
