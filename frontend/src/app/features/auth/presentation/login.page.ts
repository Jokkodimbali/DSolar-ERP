import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { SessionService } from '../application/session.service';
import { errorMessage } from '../../../core/api/http-error';
@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <main class="login-layout">
    <section class="brand-panel">
      <div class="brand-mark">D<span>·</span>Solar</div>
      <p class="eyebrow">D-SOLAR AND AGRI</p>
      <h1>La gestion, en toute clarté.</h1>
      <p>Votre espace de gestion interne : magasins, stocks, ventes et finances.</p>
      <small>DSolar-ERP · Accès réservé à l'équipe</small>
    </section>
    <section class="login-panel">
      <form class="login-card" [formGroup]="form" (ngSubmit)="submit()">
        <p class="eyebrow">ESPACE PROFESSIONNEL</p>
        <h2>Connexion</h2>
        <p class="muted">Identifiez-vous pour accéder à votre espace de travail.</p>
        <label for="email">Adresse électronique</label
        ><input
          id="email"
          type="email"
          autocomplete="username"
          formControlName="email"
          placeholder="nom@entreprise.sn"
        />
        @if (form.controls.email.touched && form.controls.email.invalid) {
          <p class="field-error">Saisissez une adresse électronique valide (254 caractères maximum).</p>
        }
        <label for="password">Mot de passe</label
        ><input id="password" type="password" autocomplete="current-password" formControlName="password" />
        @if (form.controls.password.touched && form.controls.password.invalid) {
          <p class="field-error">Le mot de passe est obligatoire (1 024 caractères maximum).</p>
        }
        @if (error()) {
          <p class="field-error" role="alert">{{ error() }}</p>
        }
        <button class="primary" type="submit" [disabled]="busy()">
          {{ busy() ? 'Connexion en cours…' : 'Se connecter' }}
        </button>
        <p class="muted small">Besoin d'un accès ? Contactez votre administrateur.</p>
      </form>
    </section>
  </main>`,
})
export class LoginPage {
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password: ['', [Validators.required, Validators.maxLength(1024)]],
  });
  submit(): void {
    if (this.busy()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.error.set('');
    this.busy.set(true);
    this.session
      .login(this.form.getRawValue())
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: () => {
          this.form.controls.password.reset();
          void this.router.navigateByUrl(
            this.session.can('sales.read', 'users.manage') ? '/tableau-de-bord' : '/',
          );
        },
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }
}
