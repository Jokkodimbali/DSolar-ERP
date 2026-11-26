import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { errorMessage } from '../../../core/api/http-error';
import { EmptyStateComponent } from '../../../shared/ui/empty-state.component';
import { FeedbackComponent } from '../../../shared/ui/feedback.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { PaginationComponent } from '../../../shared/ui/pagination.component';
import { SessionService } from '../../auth/application/session.service';
import {
  customerInput,
  customerStorageKey,
  parsePendingCustomer,
  type Customer,
  type PendingCustomer,
  type parseCustomerPage,
} from '../domain/customer.contract';
import { CustomersApi } from '../infrastructure/customers.api';

@Component({
  selector: 'app-customers-page',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    EmptyStateComponent,
    FeedbackComponent,
    PageHeaderComponent,
    PaginationComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './customers.page.html',
  styles: ['.customer-form { display: grid; gap: 14px; max-width: 560px; }'],
})
export class CustomersPage {
  private readonly api = inject(CustomersApi);
  private readonly destroy = inject(DestroyRef);
  readonly session = inject(SessionService);
  readonly result = signal<ReturnType<typeof parseCustomerPage> | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly search = signal('');
  readonly appliedSearch = signal('');
  readonly detail = signal<Customer | null>(null);
  readonly editing = signal<Customer | 'new' | null>(null);
  readonly pending = signal<PendingCustomer | null>(null);
  private storageKey: string | null = null;
  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(180)],
    }),
    taxId: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(100)] }),
    phone: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(50)] }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.email, Validators.maxLength(254)],
    }),
    address: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
  });

  constructor() {
    this.load(1);
    const actor = this.session.user()?.id;
    if (!actor || !this.session.can('sales.manage')) return;
    this.storageKey = customerStorageKey(actor);
    try {
      const raw = sessionStorage.getItem(this.storageKey);
      if (raw !== null) this.pending.set(parsePendingCustomer(JSON.parse(raw)));
    } catch {
      this.error.set('Impossible de récupérer la création en attente.');
    }
  }

  load(page = this.result()?.page ?? 1): void {
    if (this.loading() || this.busy() || !this.session.can('sales.read') || page < 1) return;
    this.loading.set(true);
    this.api
      .search(page, this.appliedSearch())
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (result) => this.result.set(result),
        error: (error: unknown) => {
          this.result.set(null);
          this.error.set(errorMessage(error));
        },
      });
  }

  filter(): void {
    if (this.loading() || this.busy()) return;
    this.error.set('');
    this.appliedSearch.set(this.search().trim());
    this.load(1);
  }

  close(): void {
    if (this.busy()) return;
    this.detail.set(null);
    this.editing.set(null);
  }

  view(id: string, edit = false): void {
    if (this.busy() || this.loading() || this.editing() || (edit && !this.session.can('sales.manage')))
      return;
    this.error.set('');
    this.detail.set(null);
    this.busy.set(true);
    this.api
      .get(id)
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: (customer) => {
          if (customer.id !== id) {
            this.error.set('Identifiant du client incohérent.');
            return;
          }
          if (edit) {
            this.editing.set(customer);
            this.resetForm(customer);
          } else this.detail.set(customer);
        },
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }

  start(): void {
    if (this.busy() || this.loading() || this.editing() || !this.session.can('sales.manage')) return;
    this.error.set('');
    this.success.set('');
    this.detail.set(null);
    this.editing.set('new');
    this.resetForm(this.pending()?.input);
  }

  private resetForm(input?: ReturnType<typeof customerInput>): void {
    this.form.reset({
      name: input?.name ?? '',
      taxId: input?.taxId ?? '',
      phone: input?.phone ?? '',
      email: input?.email ?? '',
      address: input?.address ?? '',
    });
  }

  save(): void {
    const target = this.editing();
    if (!target || this.busy() || this.loading() || !this.session.can('sales.manage')) return;
    this.error.set('');
    this.success.set('');
    this.form.markAllAsTouched();
    try {
      if (this.form.invalid) throw new Error('Vérifiez le nom et les coordonnées du client.');
      const input = customerInput(this.form.getRawValue());
      if (target === 'new') {
        const pending = this.pending() ?? { input, operationKey: crypto.randomUUID() };
        if (!this.storageKey) throw new Error('Session indisponible.');
        sessionStorage.setItem(this.storageKey, JSON.stringify(pending));
        this.pending.set(pending);
        this.submit(pending);
      } else {
        this.busy.set(true);
        this.api
          .update(target.id, input)
          .pipe(takeUntilDestroyed(this.destroy))
          .subscribe({
            next: (updated) => {
              this.busy.set(false);
              this.editing.set(null);
              if (updated.id !== target.id) {
                this.error.set('Modification non vérifiée. Consultez de nouveau le client.');
              } else {
                this.detail.set(updated);
                this.success.set('Informations du client mises à jour.');
              }
              this.load(1);
            },
            error: (error: unknown) => {
              this.busy.set(false);
              this.editing.set(null);
              this.error.set(
                errorMessage(error) + ' Consultez de nouveau le client avant de modifier ses données.',
              );
              this.load(1);
            },
          });
      }
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Coordonnées invalides.');
    }
  }

  private clearPending(): void {
    if (this.storageKey) sessionStorage.removeItem(this.storageKey);
    this.pending.set(null);
  }

  private submit(pending: PendingCustomer): void {
    this.busy.set(true);
    this.api
      .create(pending.input, pending.operationKey)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (customer) => {
          this.busy.set(false);
          try {
            this.clearPending();
          } catch {
            this.error.set('Client enregistré, mais la clé locale ne peut pas être effacée.');
            return;
          }
          this.editing.set(null);
          this.detail.set(customer);
          this.success.set('Client créé avec succès.');
          this.load(1);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          if (error instanceof HttpErrorResponse && error.status === 400) {
            try {
              this.clearPending();
            } catch {
              // La clé reste disponible pour une nouvelle tentative.
            }
          }
          this.error.set(
            errorMessage(error) + ' Réessayez avec la même demande si sa création est incertaine.',
          );
        },
      });
  }
}
