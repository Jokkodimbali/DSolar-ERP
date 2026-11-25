import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { errorMessage } from '../../../core/api/http-error';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { FeedbackComponent } from '../../../shared/ui/feedback.component';
import { SessionService } from '../../auth/application/session.service';
import type { Store } from '../../stores/domain/store.contract';
import { proformaInput, type CreatedProforma, type SaleOption } from '../domain/proforma.contract';
import { ProformaApi } from '../infrastructure/proforma.api';

function lineForm() {
  const field = (value = '') => new FormControl(value, { nonNullable: true, validators: [Validators.required] });
  return new FormGroup({
    productId: field(),
    storeId: field(),
    quantity: field('1'),
    unitPrice: field(),
    discount: field('0'),
    taxRate: field(),
  });
}

@Component({
  selector: 'app-new-sale-page',
  imports: [ReactiveFormsModule, RouterLink, PageHeaderComponent, FeedbackComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './new-sale.page.html',
})
export class NewSalePage {
  private readonly api = inject(ProformaApi);
  private readonly destroy = inject(DestroyRef);
  private readonly session = inject(SessionService);
  readonly customers = signal<SaleOption[]>([]);
  readonly products = signal<SaleOption[]>([]);
  readonly stores = signal<Store[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly created = signal<CreatedProforma | null>(null);
  readonly form = new FormGroup({
    customerId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    lines: new FormArray([lineForm()]),
  });

  constructor() {
    this.load();
  }

  load(): void {
    if (this.loading() || this.busy()) return;
    this.loading.set(true);
    this.error.set('');
    this.api.options().pipe(
      takeUntilDestroyed(this.destroy),
      finalize(() => this.loading.set(false)),
    ).subscribe({
      next: ({ customers, products, stores }) => {
        this.customers.set(customers);
        this.products.set(products);
        this.stores.set(stores.filter((store) => store.status === 'ACTIVE'));
      },
      error: (error: unknown) => this.error.set(errorMessage(error)),
    });
  }

  add(): void {
    if (!this.busy() && this.form.controls.lines.length < 100) this.form.controls.lines.push(lineForm());
  }

  remove(index: number): void {
    if (!this.busy() && this.form.controls.lines.length > 1) this.form.controls.lines.removeAt(index);
  }

  save(): void {
    if (this.busy() || this.loading() || this.created() || !this.session.can('sales.manage', 'sales.read', 'products.read', 'stores.read')) return;
    this.form.markAllAsTouched();
    this.error.set('');
    if (this.form.invalid) {
      this.error.set('Renseignez le client, le magasin, le produit, les quantités, les prix et le taux fiscal.');
      return;
    }
    const value = this.form.getRawValue();
    if (
      !this.customers().some((item) => item.id === value.customerId) ||
      value.lines.some((line) =>
        !this.products().some((item) => item.id === line.productId) ||
        !this.stores().some((item) => item.id === line.storeId),
      )
    ) {
      this.error.set('Sélectionnez uniquement des références et magasins autorisés.');
      return;
    }
    try {
      const input = proformaInput(value.customerId, value.lines);
      this.busy.set(true);
      this.form.disable();
      this.api.create(input).pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => {
          this.busy.set(false);
          if (!this.created()) this.form.enable();
        }),
      ).subscribe({
        next: (created) => this.created.set(created),
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Données commerciales invalides.');
    }
  }
}
