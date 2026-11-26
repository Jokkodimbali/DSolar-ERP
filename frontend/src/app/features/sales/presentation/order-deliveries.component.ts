import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, type OnInit, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, forkJoin } from 'rxjs';
import { errorMessage } from '../../../core/api/http-error';
import { ConfirmComponent } from '../../../shared/ui/confirm.component';
import { FeedbackComponent } from '../../../shared/ui/feedback.component';
import { PaginationComponent } from '../../../shared/ui/pagination.component';
import { SessionService } from '../../auth/application/session.service';
import { deliveryInput, deliveryKey, deliveryLabels, deliveryStorageKey, parseDeliveryInput, type Delivery, type DeliveryAction, type DeliveryInput, type DeliveryProgress, type parseDeliveryPage } from '../domain/delivery.contract';
import { DeliveriesApi } from '../infrastructure/deliveries.api';

@Component({
  selector: 'app-order-deliveries',
  imports: [DatePipe, ConfirmComponent, FeedbackComponent, PaginationComponent],
  templateUrl: './order-deliveries.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderDeliveriesComponent implements OnInit {
  readonly orderId = input.required<string>();
  readonly changed = output<void>();
  private readonly api = inject(DeliveriesApi);
  private readonly destroy = inject(DestroyRef);
  readonly session = inject(SessionService);
  readonly progress = signal<DeliveryProgress | null>(null);
  readonly result = signal<ReturnType<typeof parseDeliveryPage> | null>(null);
  readonly pending = signal<DeliveryInput | null>(null);
  readonly quantities = signal<Record<string, string>>({});
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly blocked = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly action = signal<{ note: Delivery; kind: DeliveryAction } | null>(null);
  readonly labels = deliveryLabels;
  readonly key = deliveryKey;
  private storage: string | null = null;

  ngOnInit(): void {
    const actor = this.session.user()?.id;
    if (actor && this.session.can('sales.manage')) {
      this.storage = deliveryStorageKey(actor, this.orderId());
      try {
        const saved = sessionStorage.getItem(this.storage);
        if (saved !== null) this.pending.set(parseDeliveryInput(JSON.parse(saved)));
      } catch {
        this.blocked.set(true);
        this.error.set('Impossible de récupérer le bon en attente. Vérifiez le stockage du navigateur.');
      }
    }
    this.load(1);
  }
  load(page = this.result()?.page ?? 1): void {
    if (this.loading() || this.busy() || this.action()) return;
    this.loading.set(true);
    this.progress.set(null);
    this.result.set(null);
    forkJoin({
      progress: this.api.progress(this.orderId()),
      result: this.api.search(this.orderId(), page),
    }).pipe(takeUntilDestroyed(this.destroy), finalize(() => this.loading.set(false))).subscribe({
      next: ({ progress, result }) => {
        this.progress.set(progress);
        this.result.set(result);
      },
      error: (error: unknown) => this.error.set(errorMessage(error)),
    });
  }
  change(key: string, value: string): void {
    if (this.busy() || this.pending() || this.action() || this.loading()) return;
    this.quantities.update((items) => ({ ...items, [key]: value }));
  }
  save(): void {
    const progress = this.progress();
    if (!progress || this.busy() || this.pending() || this.action() || this.loading() || this.blocked() || !this.session.can('sales.manage')) return;
    this.error.set('');
    this.success.set('');
    try {
      const command = deliveryInput(progress, this.quantities(), crypto.randomUUID());
      if (!this.storage) throw new Error('Session indisponible.');
      sessionStorage.setItem(this.storage, JSON.stringify(command));
      this.pending.set(command);
      this.resume();
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Quantités invalides.');
    }
  }
  resume(): void {
    const command = this.pending();
    if (!command || this.busy() || this.loading() || this.action() || this.blocked() || !this.session.can('sales.manage')) return;
    this.busy.set(true);
    this.error.set('');
    this.api.create(this.orderId(), command).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: (note) => {
        this.busy.set(false);
        try {
          this.clearPending();
          this.quantities.set({});
          this.success.set('Bon enregistré : ' + note.number + '.');
          this.load(1);
        } catch {
          this.error.set('Bon enregistré, mais la demande locale ne peut pas être effacée.');
        }
      },
      error: (error: unknown) => {
        this.busy.set(false);
        if (error instanceof HttpErrorResponse && error.status === 400) {
          try {
            this.clearPending();
          } catch {
            // Conserver la clé si le stockage est indisponible.
          }
        }
        this.error.set(errorMessage(error) + ' En cas de résultat incertain, reprenez le même bon.');
      },
    });
  }
  private clearPending(): void {
    if (this.storage) sessionStorage.removeItem(this.storage);
    this.pending.set(null);
  }
  ask(note: Delivery, kind: DeliveryAction): void {
    const status = this.progress()?.status;
    if (this.busy() || this.loading() || this.pending() || this.action() || note.status !== 'DRAFT' ||
      !this.session.can('sales.manage') || (kind === 'confirm' && status !== 'CONFIRMED' && status !== 'PARTIALLY_DELIVERED')) return;
    this.error.set('');
    this.success.set('');
    this.action.set({ note, kind });
  }
  apply(): void {
    const action = this.action();
    if (!action || this.busy() || !this.session.can('sales.manage')) return;
    this.busy.set(true);
    this.api.action(this.orderId(), action.note.id, action.kind).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: () => {
        this.busy.set(false);
        this.action.set(null);
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.action.set(null);
        this.error.set(errorMessage(error) + ' Vérifiez le statut avant toute nouvelle opération.');
        this.load(1);
      },
    });
  }
}
