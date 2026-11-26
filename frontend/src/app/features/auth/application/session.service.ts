import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import {
  catchError,
  finalize,
  map,
  of,
  shareReplay,
  switchMap,
  tap,
  throwError,
  type Observable,
} from 'rxjs';
import { AuthApi } from '../infrastructure/auth.api';
import {
  type BrowserAuthResult,
  type LoginInput,
  type Permission,
  type PublicIdentity,
  hasPermissions,
} from '../domain/auth.contract';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly api = inject(AuthApi);
  private readonly router = inject(Router);
  private readonly session = signal<BrowserAuthResult | null>(null);
  private readonly sessionEpoch = signal(0);
  private readonly closing = signal(false);
  private readonly warning = signal('');
  private restored = false;
  private restoring: Observable<boolean> | null = null;
  private refreshing: { epoch: number; result: Observable<string> } | null = null;
  readonly sessionVersion = this.sessionEpoch.asReadonly();
  readonly notice = this.warning.asReadonly();
  readonly user = computed(() => this.session()?.utilisateur ?? null);
  readonly authenticated = computed(() => this.user() !== null && !this.closing());

  accessToken(): string | null {
    return this.closing() ? null : (this.session()?.jetonAcces ?? null);
  }

  can(...required: Permission[]): boolean {
    return this.authenticated() && hasPermissions(this.user(), required);
  }

  private invalidate(): number {
    this.restored = true;
    this.sessionEpoch.update((epoch) => epoch + 1);
    this.session.set(null);
    return this.sessionEpoch();
  }

  restore(): Observable<boolean> {
    if (this.authenticated() || this.restored) return of(this.authenticated());
    if (this.restoring) return this.restoring;
    const epoch = this.sessionEpoch();
    this.restoring = this.api.refresh().pipe(
      map((result) => {
        if (epoch !== this.sessionEpoch() || this.closing()) return false;
        this.session.set(result);
        return true;
      }),
      catchError((error: unknown) => {
        if (epoch === this.sessionEpoch() && (!(error instanceof HttpErrorResponse) || error.status !== 401))
          this.warning.set('Impossible de restaurer la session. Veuillez réessayer.');
        return of(false);
      }),
      finalize(() => {
        this.restored = true;
        this.restoring = null;
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.restoring;
  }

  login(input: LoginInput): Observable<BrowserAuthResult> {
    if (this.closing()) return throwError(() => new Error('Déconnexion en cours.'));
    const epoch = this.invalidate();
    this.warning.set('');
    return this.api.login(input).pipe(
      tap((result) => {
        if (epoch !== this.sessionEpoch() || this.closing()) throw new Error('Connexion annulée.');
        this.session.set(result);
      }),
    );
  }

  updateIdentity(epoch: number, identity: PublicIdentity): boolean {
    const current = this.session();
    if (!current || this.closing() || epoch !== this.sessionEpoch()) return false;
    if (identity.id !== current.utilisateur.id) {
      this.expire();
      return false;
    }
    this.session.set({ ...current, utilisateur: identity });
    return true;
  }

  refreshAfter(rejected: string, epoch: number): Observable<string> {
    const current = this.session();
    if (!current || this.closing() || epoch !== this.sessionEpoch())
      return throwError(() => new Error('Session expirée.'));
    if (current.jetonAcces !== rejected) return of(current.jetonAcces);
    if (this.refreshing?.epoch === epoch) return this.refreshing.result;

    const result = this.api.refresh().pipe(
      map((next) => {
        if (epoch !== this.sessionEpoch() || next.utilisateur.id !== current.utilisateur.id)
          throw new Error('Session remplacée ou identité invalide.');
        this.session.set(next);
        return next.jetonAcces;
      }),
      catchError((error: unknown) => {
        if (epoch === this.sessionEpoch() && error instanceof HttpErrorResponse && error.status === 401)
          this.expire();
        return throwError(() => error);
      }),
      finalize(() => {
        if (this.refreshing?.epoch === epoch) this.refreshing = null;
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.refreshing = { epoch, result };
    return result;
  }

  expire(): void {
    this.invalidate();
    this.warning.set('Votre session a expiré. Veuillez vous reconnecter.');
    void this.router.navigateByUrl('/connexion');
  }

  logout(): Observable<unknown> {
    if (this.closing()) return of(null);
    this.closing.set(true);
    const pending: Observable<string | null> =
      this.refreshing?.epoch === this.sessionEpoch() ? this.refreshing.result : of(null);
    return pending.pipe(
      catchError(() => of(null)),
      switchMap(() => {
        this.invalidate();
        return this.api.logout();
      }),
      catchError((error: unknown) => {
        this.warning.set(
          'Vous êtes déconnecté de cet appareil. La révocation de la session serveur n’a pas pu être confirmée.',
        );
        return throwError(() => error);
      }),
      finalize(() => {
        this.closing.set(false);
        void this.router.navigateByUrl('/connexion');
      }),
    );
  }
}
