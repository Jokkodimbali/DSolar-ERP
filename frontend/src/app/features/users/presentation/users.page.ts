import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize, forkJoin, type Observable } from 'rxjs';
import { errorMessage } from '../../../core/api/http-error';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { FeedbackComponent } from '../../../shared/ui/feedback.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state.component';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import { ConfirmComponent } from '../../../shared/ui/confirm.component';
import { PaginationComponent } from '../../../shared/ui/pagination.component';
import { SessionService } from '../../auth/application/session.service';
import { StoresApi } from '../../stores/infrastructure/stores.api';
import type { Store } from '../../stores/domain/store.contract';
import { accessInput, type ManagedUser, type UserRole } from '../domain/users.contract';
import { UsersApi } from '../infrastructure/users.api';

@Component({
  selector: 'app-users-page',
  imports: [
    ReactiveFormsModule,
    PageHeaderComponent,
    FeedbackComponent,
    EmptyStateComponent,
    StatusBadgeComponent,
    ConfirmComponent,
    PaginationComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './users.page.html',
})
export class UsersPage {
  private readonly api = inject(UsersApi);
  private readonly storesApi = inject(StoresApi);
  private readonly destroy = inject(DestroyRef);
  readonly session = inject(SessionService);
  readonly users = signal<ManagedUser[]>([]);
  readonly stores = signal<Store[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly query = signal('');
  readonly filter = signal('ALL');
  readonly page = signal(1);
  readonly filtered = computed(() =>
    this.users().filter(
      (user) =>
        (this.filter() === 'ALL' || user.status === this.filter()) &&
        (user.nomComplet + ' ' + user.email)
          .toLocaleLowerCase('fr')
          .includes(this.query().trim().toLocaleLowerCase('fr')),
    ),
  );
  readonly pages = computed(() => Math.max(1, Math.ceil(this.filtered().length / 10)));
  readonly visible = computed(() => this.filtered().slice((this.page() - 1) * 10, this.page() * 10));
  readonly editing = signal<ManagedUser | 'new' | null>(null);
  readonly disabling = signal<ManagedUser | null>(null);
  readonly form = new FormGroup({
    fullName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(180)],
    }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email, Validators.maxLength(254)],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(12), Validators.maxLength(1024)],
    }),
    role: new FormControl<UserRole>('MAGASINIER', { nonNullable: true }),
    stores: new FormControl<string[]>([], { nonNullable: true }),
  });

  constructor() {
    this.load();
  }

  load(): void {
    if (this.loading() || this.busy() || !this.session.can('users.manage')) return;
    this.loading.set(true);
    this.error.set('');
    forkJoin({ users: this.api.list(), stores: this.storesApi.list() })
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: ({ users, stores }) => {
          this.users.set(users);
          this.stores.set(stores.filter((store) => store.status === 'ACTIVE'));
          this.page.set(Math.min(this.page(), this.pages()));
        },
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }

  edit(user: ManagedUser | 'new'): void {
    if (
      this.loading() ||
      this.busy() ||
      !this.session.can('users.manage') ||
      (user !== 'new' && user.status !== 'ACTIVE')
    )
      return;
    this.error.set('');
    this.success.set('');
    this.disabling.set(null);
    this.editing.set(user);
    this.form.reset(
      user === 'new'
        ? { fullName: '', email: '', password: '', role: 'MAGASINIER', stores: [] }
        : {
            fullName: user.nomComplet,
            email: user.email,
            password: '',
            role: user.role,
            stores: user.magasinsAutorises.filter((id) => this.stores().some((store) => store.id === id)),
          },
    );
    for (const field of [
      this.form.controls.fullName,
      this.form.controls.email,
      this.form.controls.password,
    ]) {
      if (user === 'new') field.enable();
      else field.disable();
    }
  }

  toggleStore(id: string, checked: boolean): void {
    if (this.busy()) return;
    const current = this.form.controls.stores.value;
    this.form.controls.stores.setValue(
      checked ? [...new Set([...current, id])] : current.filter((value) => value !== id),
    );
  }

  close(): void {
    if (this.busy()) return;
    this.editing.set(null);
    this.disabling.set(null);
    this.form.controls.password.reset();
  }

  save(): void {
    const target = this.editing();
    if (!target || this.busy() || !this.session.can('users.manage')) return;
    this.form.markAllAsTouched();
    const value = this.form.getRawValue();
    if (this.form.invalid || (target === 'new' && value.fullName.trim().length < 2)) {
      this.error.set('Vérifiez le nom, l’adresse électronique et le mot de passe (12 caractères minimum).');
      return;
    }
    const self = target !== 'new' && target.id === this.session.user()?.id;
    if (self && !window.confirm('Modifier vos accès peut révoquer votre session. Continuer ?')) return;
    const access = accessInput(value.role, value.stores);
    const request =
      target === 'new'
        ? this.api.create({
            ...access,
            fullName: value.fullName.trim(),
            email: value.email.trim(),
            password: value.password,
          })
        : this.api.access(target.id, access);
    this.form.controls.password.reset();
    this.mutate(request, target === 'new' ? 'Utilisateur créé.' : 'Autorisations mises à jour.', self);
  }

  askDisable(user: ManagedUser): void {
    if (this.busy() || user.status !== 'ACTIVE' || user.id === this.session.user()?.id) return;
    this.close();
    this.disabling.set(user);
  }

  disable(): void {
    const user = this.disabling();
    if (!user || user.id === this.session.user()?.id || !this.session.can('users.manage')) return;
    this.mutate(this.api.disable(user.id), 'Utilisateur désactivé.');
  }

  private mutate(request: Observable<unknown>, message: string, self = false): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.success.set('');
    request
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.close();
          if (self) {
            this.session.expire();
            return;
          }
          this.success.set(message);
          this.load();
        },
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }
}
