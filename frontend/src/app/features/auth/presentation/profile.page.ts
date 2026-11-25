import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { errorMessage } from '../../../core/api/http-error';
import { SessionService } from '../application/session.service';
import { ProfileApi } from '../infrastructure/profile.api';
import type { PublicIdentity } from '../domain/auth.contract';

@Component({
  selector: 'app-profile-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-heading">
      <div>
        <p class="eyebrow">MON ESPACE</p>
        <h1>Mon compte</h1>
        <p class="muted">Identité et droits retournés par le serveur.</p>
      </div>
      <button class="secondary" type="button" [disabled]="loading()" (click)="load()">Actualiser</button>
    </div>
    @if (loading()) {
      <p role="status">Vérification du compte…</p>
    }
    @if (error()) {
      <p class="field-error" role="alert">{{ error() }}</p>
    }
    @if (identity(); as user) {
      <section class="panel">
        <h2>Informations personnelles</h2>
        <dl class="metrics">
          <div>
            <dt>Nom complet</dt>
            <dd>{{ user.nomComplet }}</dd>
          </div>
          <div>
            <dt>Adresse électronique</dt>
            <dd>{{ user.email }}</dd>
          </div>
          <div>
            <dt>Magasins affectés</dt>
            <dd>{{ user.magasinsAutorises.length }}</dd>
          </div>
        </dl>
      </section>
      <section class="panel">
        <h2>Autorisations effectives</h2>
        @if (!user.permissions.length) {
          <p class="muted">Aucune permission attribuée.</p>
        }
        <ul class="permission-list">
          @for (permission of user.permissions; track permission) {
            <li>{{ permission }}</li>
          }
        </ul>
        <p class="muted small">
          Les droits sont administrés par le serveur. Contactez votre administrateur pour toute modification.
        </p>
      </section>
    }
  `,
})
export class ProfilePage {
  private readonly api = inject(ProfileApi);
  private readonly session = inject(SessionService);
  private readonly destroy = inject(DestroyRef);
  readonly identity = signal<PublicIdentity | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');

  constructor() {
    this.load();
  }

  load(): void {
    if (this.loading()) return;
    const epoch = this.session.sessionVersion();
    this.identity.set(null);
    this.error.set('');
    this.loading.set(true);
    this.api
      .me()
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (identity) => {
          if (this.session.updateIdentity(epoch, identity)) this.identity.set(identity);
        },
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }
}
