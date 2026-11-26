import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize, type Observable } from 'rxjs';
import { errorMessage } from '../../../core/api/http-error';
import { ConfirmComponent } from '../../../shared/ui/confirm.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state.component';
import { FeedbackComponent } from '../../../shared/ui/feedback.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { PaginationComponent } from '../../../shared/ui/pagination.component';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import { SessionService } from '../../auth/application/session.service';
import { type Supplier, type SupplierFilter, type parseSupplierPage } from '../domain/supplier.contract';
import { SuppliersApi } from '../infrastructure/suppliers.api';

@Component({
  selector: 'app-suppliers-page',
  imports: [
    ReactiveFormsModule,
    ConfirmComponent,
    EmptyStateComponent,
    FeedbackComponent,
    PageHeaderComponent,
    PaginationComponent,
    StatusBadgeComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './suppliers.page.html',
  styleUrl: './suppliers.page.css',
})
export class SuppliersPage {
  private readonly api = inject(SuppliersApi);
  private readonly destroy = inject(DestroyRef);
  readonly session = inject(SessionService);
  readonly result = signal<ReturnType<typeof parseSupplierPage> | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly search = signal('');
  readonly status = signal<SupplierFilter>('ALL');
  readonly appliedSearch = signal('');
  readonly appliedStatus = signal<SupplierFilter>('ALL');
  readonly editing = signal<Supplier | 'new' | null>(null);
  readonly detail = signal<Supplier | null>(null);
  readonly pendingStatus = signal<Supplier | null>(null);
  private creationKey: string | null = null;
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
    this.load();
  }

  load(page = this.result()?.page ?? 1): void {
    if (this.loading() || this.busy() || !this.session.can('inventory.read') || page < 1) return;
    this.loading.set(true);
    this.error.set('');
    this.api
      .search(page, this.appliedSearch(), this.appliedStatus())
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

  setSearch(search: string): void {
    this.search.set(search);
  }

  setStatus(status: string): void {
    if (status === 'ALL' || status === 'ACTIVE' || status === 'INACTIVE') {
      this.status.set(status);
    }
  }

  applyFilters(): void {
    if (this.loading() || this.busy()) return;
    this.appliedSearch.set(this.search().trim());
    this.appliedStatus.set(this.status());
    this.load(1);
  }

  movePage(page: number): void {
    if (Number.isInteger(page) && page >= 1 && page <= (this.result()?.pages ?? 0)) this.load(page);
  }

  view(supplier: Supplier): void {
    if (!this.session.can('inventory.read') || this.busy() || this.loading()) return;
    this.close();
    this.busy.set(true);
    this.api
      .get(supplier.id)
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: (value) => this.detail.set(value),
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }

  edit(supplier: Supplier | 'new'): void {
    if (!this.session.can('inventory.manage') || this.busy() || this.loading()) return;
    this.close();
    this.editing.set(supplier);
    this.creationKey = supplier === 'new' ? crypto.randomUUID() : null;
    this.form.reset(
      supplier === 'new'
        ? { name: '', taxId: '', phone: '', email: '', address: '' }
        : {
            name: supplier.name,
            taxId: supplier.taxId ?? '',
            phone: supplier.phone ?? '',
            email: supplier.email ?? '',
            address: supplier.address ?? '',
          },
    );
  }

  save(): void {
    const target = this.editing();
    if (!target || !this.session.can('inventory.manage') || this.busy() || this.loading()) return;
    this.form.markAllAsTouched();
    const { name, taxId, phone, email, address } = this.form.getRawValue();
    if (this.form.invalid || !name.trim()) {
      this.error.set('Vérifiez le nom, l’adresse e-mail et la longueur des coordonnées.');
      return;
    }
    const input = {
      name: name.trim(),
      taxId: taxId.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      address: address.trim() || null,
    };
    const request =
      target === 'new'
        ? this.api.create(input, (this.creationKey ??= crypto.randomUUID()))
        : this.api.update(target.id, input);
    this.mutate(request, target === 'new' ? 'Fournisseur créé.' : 'Fournisseur mis à jour.');
  }

  askStatus(supplier: Supplier): void {
    if (!this.session.can('inventory.manage') || this.busy() || this.loading()) return;
    this.close();
    this.pendingStatus.set(supplier);
  }

  confirmStatus(): void {
    const supplier = this.pendingStatus();
    if (!supplier || !this.session.can('inventory.manage')) return;
    this.mutate(
      this.api.setActive(supplier.id, !supplier.active),
      supplier.active ? 'Fournisseur désactivé.' : 'Fournisseur activé.',
    );
  }

  close(): void {
    if (this.busy()) return;
    this.editing.set(null);
    this.creationKey = null;
    this.detail.set(null);
    this.pendingStatus.set(null);
    this.error.set('');
    this.success.set('');
  }

  private mutate(request: Observable<Supplier>, message: string): void {
    if (this.busy() || this.loading()) return;
    this.busy.set(true);
    this.error.set('');
    this.success.set('');
    request.pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: () => {
        this.busy.set(false);
        this.close();
        this.success.set(message);
        this.load(1);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(errorMessage(error));
      },
    });
  }
}
