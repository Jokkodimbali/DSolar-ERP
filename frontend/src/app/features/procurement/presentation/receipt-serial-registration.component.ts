import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { errorMessage } from '../../../core/api/http-error';
import { FeedbackComponent } from '../../../shared/ui/feedback.component';
import { SessionService } from '../../auth/application/session.service';
import type { GoodsReceipt } from '../domain/goods-receipt.contract';
import { serialRegistration } from '../domain/serial-registration.contract';
import { SupplierReturnsApi } from '../infrastructure/supplier-returns.api';

@Component({
  selector: 'app-receipt-serial-registration',
  imports: [FeedbackComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel" aria-label="Enregistrement des numéros de série">
      <h3>Enregistrer les numéros de série</h3>
      <p class="muted">
        Une série par ligne. Cette opération identifie les articles déjà réceptionnés sans augmenter le stock.
      </p>
      <app-feedback [message]="error()" kind="error" />
      <app-feedback [message]="success()" kind="success" />
      <label class="ui-field">
        Produit réceptionné
        <select
          #product
          aria-label="Produit à sérialiser"
          [disabled]="busy()"
          (change)="choose(product.value)"
        >
          <option value="">Sélectionner…</option>
          @for (line of receipt().lines; track line.id) {
            <option [value]="line.id">
              {{ names()[line.productId] || line.productId }} · {{ line.quantity }}
            </option>
          }
        </select>
      </label>
      <label class="ui-field">
        Numéros de série
        <textarea
          #serials
          [value]="value()"
          [disabled]="busy()"
          maxlength="15100"
          (input)="value.set(serials.value)"
        ></textarea>
      </label>
      <button
        class="primary"
        type="button"
        [disabled]="busy() || !lineId() || !value().trim()"
        (click)="save()"
      >
        Enregistrer les séries
      </button>
    </section>
  `,
})
export class ReceiptSerialRegistrationComponent {
  private readonly api = inject(SupplierReturnsApi);
  private readonly destroy = inject(DestroyRef);
  private readonly session = inject(SessionService);
  readonly receipt = input.required<GoodsReceipt>();
  readonly names = input.required<Record<string, string>>();
  readonly lineId = signal('');
  readonly value = signal('');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');

  choose(id: string): void {
    if (this.busy()) return;
    this.lineId.set(this.receipt().lines.some((line) => line.id === id) ? id : '');
    this.value.set('');
    this.error.set('');
    this.success.set('');
  }

  save(): void {
    const receipt = this.receipt();
    const id = this.lineId();
    if (
      this.busy() ||
      receipt.status !== 'CONFIRMED' ||
      !receipt.lines.some((line) => line.id === id) ||
      !this.session.can('users.manage', 'inventory.manage')
    )
      return;
    this.error.set('');
    this.success.set('');
    try {
      const serials = serialRegistration(this.value());
      this.busy.set(true);
      this.api
        .registerSerials(id, serials)
        .pipe(
          takeUntilDestroyed(this.destroy),
          finalize(() => this.busy.set(false)),
        )
        .subscribe({
          next: (items) => {
            this.success.set(items.length + ' numéro(s) de série enregistré(s).');
            this.value.set('');
          },
          error: (error: unknown) =>
            this.error.set(errorMessage(error) + ' En cas de coupure, réessayez avec le même lot de séries.'),
        });
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Numéros de série invalides.');
    }
  }
}
