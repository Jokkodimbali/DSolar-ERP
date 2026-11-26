import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize, forkJoin, of } from 'rxjs';
import { errorMessage } from '../../../core/api/http-error';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { FeedbackComponent } from '../../../shared/ui/feedback.component';
import { SessionService } from '../../auth/application/session.service';
import { formatMoney } from '../../dashboard/domain/dashboard.contract';
import type { Store } from '../../stores/domain/store.contract';
import { storeId } from '../../stores/domain/store.contract';
import {
  parsePendingProforma,
  proformaStorageKey,
  type PendingProforma,
} from '../domain/pending-proforma.contract';
import { proformaInput, type LineDraft, type SaleOption } from '../domain/proforma.contract';
import { proformaLabels, type Proforma } from '../domain/proforma-view.contract';
import { ProformaApi } from '../infrastructure/proforma.api';

function lineForm(line?: LineDraft) {
  const field = (value = '') =>
    new FormControl(value, { nonNullable: true, validators: [Validators.required] });
  return new FormGroup({
    productId: field(line?.productId),
    storeId: field(line?.storeId),
    quantity: field(line?.quantity ?? '1'),
    unitPrice: field(line?.unitPrice),
    discount: field(line?.discount ?? '0'),
    taxRate: field(line?.taxRate),
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
  private readonly route = inject(ActivatedRoute);
  readonly editId = this.route.snapshot.paramMap.get('id');
  readonly customers = signal<SaleOption[]>([]);
  readonly products = signal<SaleOption[]>([]);
  readonly stores = signal<Store[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly created = signal<Proforma | null>(null);
  readonly original = signal<Proforma | null>(null);
  readonly pending = signal<PendingProforma | null>(null);
  readonly reference = signal('PF-' + crypto.randomUUID().toUpperCase());
  readonly labels = proformaLabels;
  readonly money = formatMoney;
  private storageKey: string | null = null;
  readonly form = new FormGroup({
    customerId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    lines: new FormArray([lineForm()]),
  });

  constructor() {
    const actor = this.session.user()?.id;
    if (!this.editId && actor) {
      this.storageKey = proformaStorageKey(actor);
      try {
        const raw = sessionStorage.getItem(this.storageKey);
        if (raw !== null) {
          const pending = parsePendingProforma(JSON.parse(raw));
          this.pending.set(pending);
          this.reference.set(pending.number);
        }
      } catch {
        this.error.set('Impossible de récupérer la demande en attente. Vérifiez le stockage du navigateur.');
        this.form.disable();
        return;
      }
    }
    if (!this.pending()) this.load();
  }

  load(): void {
    if (this.loading() || this.busy() || this.pending()) return;
    this.loading.set(true);
    this.error.set('');
    try {
      const detail = this.editId && !this.original() ? this.api.get(storeId(this.editId)) : of(null);
      forkJoin({ options: this.api.options(), detail })
        .pipe(
          takeUntilDestroyed(this.destroy),
          finalize(() => this.loading.set(false)),
        )
        .subscribe({
          next: ({ options: { customers, products, stores }, detail: item }) => {
            this.customers.set(customers);
            this.products.set(products);
            this.stores.set(stores.filter((store) => store.status === 'ACTIVE'));
            if (item) {
              if (item.id !== this.editId || item.status !== 'DRAFT') {
                this.error.set('Seul un devis brouillon est modifiable.');
                return;
              }
              this.original.set(item);
              this.reference.set(item.number);
              this.form.controls.customerId.setValue(item.customerId);
              this.form.controls.lines.clear();
              for (const line of item.lines) this.form.controls.lines.push(lineForm(line));
            }
          },
          error: (error: unknown) => this.error.set(errorMessage(error)),
        });
    } catch (error: unknown) {
      this.loading.set(false);
      this.error.set(error instanceof Error ? error.message : 'Référence invalide.');
    }
  }

  add(): void {
    if (!this.busy() && !this.pending() && this.form.controls.lines.length < 100)
      this.form.controls.lines.push(lineForm());
  }

  remove(index: number): void {
    if (!this.busy() && !this.pending() && this.form.controls.lines.length > 1)
      this.form.controls.lines.removeAt(index);
  }

  private canManage(): boolean {
    return this.session.can('sales.manage', 'sales.read', 'products.read', 'stores.read');
  }

  save(): void {
    if (
      this.busy() ||
      this.loading() ||
      this.created() ||
      this.pending() ||
      this.form.disabled ||
      (this.editId && !this.original()) ||
      !this.canManage()
    )
      return;
    this.form.markAllAsTouched();
    this.error.set('');
    if (this.form.invalid) {
      this.error.set('Renseignez le client, le magasin, le produit, les quantités, les prix et le taux fiscal.');
      return;
    }
    const value = this.form.getRawValue();
    if (
      !this.customers().some((item) => item.id === value.customerId) ||
      value.lines.some(
        (line) =>
          !this.products().some((item) => item.id === line.productId) ||
          !this.stores().some((item) => item.id === line.storeId),
      )
    ) {
      this.error.set('Sélectionnez uniquement des références et magasins autorisés.');
      return;
    }
    try {
      const expiry = this.original()?.expiresAt;
      const input = {
        ...proformaInput(value.customerId, value.lines),
        number: this.reference(),
        ...(expiry ? { expiresAt: expiry } : {}),
      };
      if (this.editId) {
        this.busy.set(true);
        this.form.disable();
        this.api
          .update(this.editId, input)
          .pipe(takeUntilDestroyed(this.destroy))
          .subscribe({
            next: (item) => {
              this.busy.set(false);
              this.created.set(item);
            },
            error: (error: unknown) => {
              this.busy.set(false);
              this.error.set(errorMessage(error) + ' Rechargez le devis avant toute nouvelle modification.');
            },
          });
        return;
      }
      if (!this.storageKey) throw new Error('Session indisponible.');
      const pending = parsePendingProforma(input);
      sessionStorage.setItem(this.storageKey, JSON.stringify(pending));
      this.pending.set(pending);
      this.resume();
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Données commerciales invalides.');
    }
  }

  resume(): void {
    const input = this.pending();
    if (!input || this.busy() || this.editId || !this.canManage()) return;
    this.error.set('');
    this.busy.set(true);
    this.api
      .create(input)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (item) => {
          this.busy.set(false);
          try {
            this.clearPending();
            this.created.set(item);
          } catch {
            this.error.set('Devis retrouvé, mais la demande locale ne peut pas être effacée.');
          }
        },
        error: (error: unknown) => {
          this.busy.set(false);
          if (error instanceof HttpErrorResponse && error.status === 400) {
            try {
              this.clearPending();
              this.load();
            } catch {
              // Conserver la même référence si le stockage ne peut pas être effacé.
            }
          }
          this.error.set(errorMessage(error) + ' En cas de résultat incertain, reprenez la même demande.');
        },
      });
  }

  private clearPending(): void {
    if (this.storageKey) sessionStorage.removeItem(this.storageKey);
    this.pending.set(null);
  }
}
