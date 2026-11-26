import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize, map, of, switchMap, type Observable } from 'rxjs';
import { errorMessage } from '../../../core/api/http-error';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { FeedbackComponent } from '../../../shared/ui/feedback.component';
import { PaginationComponent } from '../../../shared/ui/pagination.component';
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
import { expiryInput, keepSelected, localExpiry } from '../domain/proforma-form.contract';
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
  imports: [ReactiveFormsModule, RouterLink, PageHeaderComponent, FeedbackComponent, PaginationComponent],
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
  readonly customerPage = signal({ page: 1, pages: 0 });
  readonly productPage = signal({ page: 1, pages: 0 });
  readonly customerQuery = signal('');
  readonly productQuery = signal('');
  readonly referencesLoading = signal(false);
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
    expiry: new FormControl('', { nonNullable: true }),
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
    if (this.loading() || this.busy() || this.pending() || this.referencesLoading()) return;
    this.loading.set(true);
    this.error.set('');
    try {
      const detail: Observable<Proforma | null> =
        this.editId && !this.original() ? this.api.get(storeId(this.editId)) : of(null);
      detail
        .pipe(
          switchMap((item) =>
            this.api.options(item ?? this.original()).pipe(map((options) => ({ options, detail: item }))),
          ),
        )
        .pipe(
          takeUntilDestroyed(this.destroy),
          finalize(() => this.loading.set(false)),
        )
        .subscribe({
          next: ({
            options: { customers, products, stores, selectedCustomer, selectedProducts },
            detail: item,
          }) => {
            this.customerPage.set({ page: customers.page, pages: customers.pages });
            this.productPage.set({ page: products.page, pages: products.pages });
            this.customerQuery.set('');
            this.productQuery.set('');
            this.customers.set(
              keepSelected(
                this.customers(),
                [...(selectedCustomer ? [selectedCustomer] : []), ...customers.items],
                [this.form.controls.customerId.value],
              ),
            );
            this.products.set(
              keepSelected(
                this.products(),
                [...selectedProducts, ...products.items],
                this.form.controls.lines.getRawValue().map((line) => line.productId),
              ),
            );
            this.stores.set(stores.filter((store) => store.status === 'ACTIVE'));
            if (item) {
              if (item.id !== this.editId || item.status !== 'DRAFT') {
                this.error.set('Seul un devis brouillon est modifiable.');
                return;
              }
              this.original.set(item);
              this.reference.set(item.number);
              this.form.controls.customerId.setValue(item.customerId);
              this.form.controls.expiry.setValue(item.expiresAt ? localExpiry(item.expiresAt) : '');
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

  searchCustomers(search: string, page = 1): void {
    if (this.loading() || this.busy() || this.referencesLoading() || this.pending() || this.form.disabled)
      return;
    this.referencesLoading.set(true);
    this.error.set('');
    this.customerQuery.set(search.trim());
    this.api
      .customerOptions(page, this.customerQuery())
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.referencesLoading.set(false)),
      )
      .subscribe({
        next: (result) => {
          this.customerPage.set({ page: result.page, pages: result.pages });
          this.customers.set(
            keepSelected(this.customers(), result.items, [this.form.controls.customerId.value]),
          );
        },
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }

  searchProducts(search: string, page = 1): void {
    if (this.loading() || this.busy() || this.referencesLoading() || this.pending() || this.form.disabled)
      return;
    this.referencesLoading.set(true);
    this.error.set('');
    this.productQuery.set(search.trim());
    this.api
      .productOptions(page, this.productQuery())
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.referencesLoading.set(false)),
      )
      .subscribe({
        next: (result) => {
          this.productPage.set({ page: result.page, pages: result.pages });
          this.products.set(
            keepSelected(
              this.products(),
              result.items,
              this.form.controls.lines.getRawValue().map((line) => line.productId),
            ),
          );
        },
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
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
      this.referencesLoading() ||
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
      this.error.set(
        'Renseignez le client, le magasin, le produit, les quantités, les prix et le taux fiscal.',
      );
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
      const expiry = expiryInput(value.expiry, this.original()?.expiresAt);
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
