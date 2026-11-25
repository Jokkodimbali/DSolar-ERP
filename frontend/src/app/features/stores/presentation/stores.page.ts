import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize, type Observable } from 'rxjs';
import { errorMessage } from '../../../core/api/http-error';
import { SessionService } from '../../auth/application/session.service';
import type { PublicIdentity } from '../../auth/domain/auth.contract';
import { filterStores, type Store, type StoreStatus } from '../domain/store.contract';
import { StoresApi } from '../infrastructure/stores.api';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { FeedbackComponent } from '../../../shared/ui/feedback.component';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import { PaginationComponent } from '../../../shared/ui/pagination.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state.component';
import { ConfirmComponent } from '../../../shared/ui/confirm.component';

@Component({
  selector: 'app-stores-page',
  imports: [
    ReactiveFormsModule,
    PageHeaderComponent,
    FeedbackComponent,
    StatusBadgeComponent,
    PaginationComponent,
    EmptyStateComponent,
    ConfirmComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './stores.page.html',
  styleUrl: './stores.page.css',
})
export class StoresPage {
  private readonly api = inject(StoresApi);
  private readonly destroy = inject(DestroyRef);
  readonly session = inject(SessionService);
  readonly stores = signal<Store[]>([]);
  readonly users = signal<PublicIdentity[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly search = signal('');
  readonly status = signal<StoreStatus | 'ALL'>('ALL');
  readonly mine = signal(false);
  readonly page = signal(1);
  readonly filtered = computed(() => filterStores(this.stores(), this.search(), this.status()));
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / 10)));
  readonly visible = computed(() => this.filtered().slice((this.page() - 1) * 10, this.page() * 10));
  readonly editing = signal<Store | 'new' | null>(null);
  readonly selected = signal<Store | null>(null);
  readonly detail = signal<Store | null>(null);
  readonly pendingStatus = signal<Store | null>(null);
  readonly form = new FormGroup({
    code: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(30)],
    }),
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(160)],
    }),
    address: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    this.load();
  }

  load(): void {
    if (this.loading() || this.busy()) return;
    this.loading.set(true);
    this.detail.set(null);
    this.error.set('');
    this.stores.set([]);
    this.page.set(1);
    this.api
      .list(this.mine())
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (stores) => this.stores.set(stores),
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }

  setMine(mine: boolean): void {
    if (this.loading() || this.busy()) return;
    this.mine.set(mine);
    this.close();
    this.load();
  }

  movePage(page: number): void {
    if (Number.isInteger(page)) this.page.set(Math.min(this.pageCount(), Math.max(1, page)));
  }

  setSearch(search: string): void {
    this.search.set(search);
    this.page.set(1);
  }

  setStatus(status: string): void {
    if (status === 'ALL' || status === 'ACTIVE' || status === 'INACTIVE') {
      this.status.set(status);
      this.page.set(1);
    }
  }

  view(store: Store): void {
    if (!this.session.can('stores.read') || this.busy() || this.loading()) return;
    this.close();
    // L’API de détail refuse les magasins inactifs ; seul l’administrateur les reçoit dans la liste.
    if (store.status === 'INACTIVE') {
      if (this.session.can('stores.manage')) this.detail.set(store);
      return;
    }
    this.busy.set(true);
    this.api
      .get(store.id)
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: (value) => this.detail.set(value),
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }

  edit(store: Store | 'new'): void {
    if (!this.session.can('stores.manage') || this.busy()) return;
    this.close();
    this.editing.set(store);
    this.form.reset(
      store === 'new'
        ? { code: '', name: '', address: '' }
        : { code: store.code, name: store.name, address: store.address ?? '' },
    );
    if (store === 'new') this.form.controls.code.enable();
    else this.form.controls.code.disable();
  }

  save(): void {
    const target = this.editing();
    if (!target || !this.session.can('stores.manage') || this.busy()) return;
    this.form.markAllAsTouched();
    const { code, name, address } = this.form.getRawValue();
    if (this.form.invalid || !name.trim() || (target === 'new' && !code.trim())) {
      this.error.set('Renseignez le code et le nom du magasin.');
      return;
    }
    const request =
      target === 'new'
        ? this.api.create({
            code: code.trim(),
            name: name.trim(),
            ...(address.trim() ? { address: address.trim() } : {}),
          })
        : this.api.update(target.id, { name: name.trim(), address: address.trim() || null });
    this.mutate(request, target === 'new' ? 'Magasin créé.' : 'Magasin modifié.', () => {
      this.editing.set(null);
    });
  }

  askStatus(store: Store): void {
    if (!this.session.can('stores.manage') || this.busy()) return;
    this.close();
    this.pendingStatus.set(store);
  }

  confirmStatus(): void {
    const store = this.pendingStatus();
    if (!store || !this.session.can('stores.manage')) return;
    const status = store.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    this.mutate(
      this.api.setStatus(store.id, status),
      status === 'ACTIVE' ? 'Magasin activé.' : 'Magasin désactivé.',
      () => this.pendingStatus.set(null),
    );
  }

  assignments(store: Store): void {
    if (!this.session.can('stores.manage', 'users.manage') || this.busy()) return;
    this.close();
    this.selected.set(store);
    this.loadUsers();
  }

  loadUsers(): void {
    if (!this.selected() || this.busy() || !this.session.can('stores.manage', 'users.manage')) return;
    this.users.set([]);
    this.busy.set(true);
    this.error.set('');
    this.api
      .users()
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: (users) => this.users.set(users.filter((user) => user.id !== this.session.user()?.id)),
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }

  changeAssignment(user: PublicIdentity): void {
    const store = this.selected();
    if (!store || !this.session.can('stores.manage', 'users.manage')) return;
    const assigned = !user.magasinsAutorises.includes(store.id);
    if (assigned && store.status !== 'ACTIVE') return;
    this.mutate(
      this.api.assign(store.id, user.id, assigned),
      assigned ? 'Accès accordé.' : 'Accès retiré.',
      () => {
        this.users.update((users) =>
          users.map((entry) =>
            entry.id === user.id
              ? {
                  ...entry,
                  magasinsAutorises: assigned
                    ? [...entry.magasinsAutorises, store.id]
                    : entry.magasinsAutorises.filter((id) => id !== store.id),
                }
              : entry,
          ),
        );
      },
      false,
    );
  }

  close(): void {
    if (this.busy()) return;
    this.editing.set(null);
    this.detail.set(null);
    this.pendingStatus.set(null);
    this.selected.set(null);
    this.users.set([]);
    this.error.set('');
    this.success.set('');
  }

  private mutate<T>(request: Observable<T>, message: string, onSuccess: () => void, reload = true): void {
    if (this.busy() || this.loading()) return;
    this.busy.set(true);
    this.error.set('');
    this.success.set('');
    request.pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: () => {
        onSuccess();
        this.success.set(message);
        this.busy.set(false);
        if (reload) this.load();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(errorMessage(error));
      },
    });
  }
}
