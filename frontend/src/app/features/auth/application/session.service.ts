import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, finalize, map, of, shareReplay, switchMap, tap, throwError, type Observable } from 'rxjs';
import { AuthApi } from '../infrastructure/auth.api';
import { type AuthResult, type LoginInput, type Permission, hasPermissions } from '../domain/auth.contract';
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly api = inject(AuthApi);
  private readonly router = inject(Router);
  private readonly session = signal<AuthResult | null>(null);
  private refreshing: Observable<string> | null = null;
  private generation = 0;
  private readonly closing = signal(false);
  readonly sessionVersion = computed(() => this.sessionEpoch());
  private readonly sessionEpoch = signal(0);
  readonly user = computed(() => this.session()?.utilisateur ?? null);
  readonly authenticated = computed(() => this.user() !== null && !this.closing());
  accessToken(): string | null { return this.closing() ? null : this.session()?.jetonAcces ?? null; }
  can(...required: Permission[]): boolean { return hasPermissions(this.user(), required); }
  login(input: LoginInput) {
    const generation = ++this.generation;
    this.sessionEpoch.set(generation);
    this.session.set(null);
    return this.api.login(input).pipe(tap(result => {
      if (generation !== this.generation || this.closing()) throw new Error('Connexion annulée.');
      this.session.set(result);
    }));
  }
  refreshAfter(rejected: string, generation: number): Observable<string> {
    const current = this.session();
    if (!current || this.closing() || generation !== this.generation) return throwError(() => new Error('Session expirée.'));
    if (current.jetonAcces !== rejected) return of(current.jetonAcces);
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.api.refresh(current.jetonRenouvellement).pipe(
      map(result => {
        if (generation !== this.generation) throw new Error('Session remplacée.');
        this.session.set(result);
        return result.jetonAcces;
      }),
      catchError((error: unknown) => { if (generation === this.generation) this.expire(); return throwError(() => error); }),
      finalize(() => { this.refreshing = null; }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.refreshing;
  }
  expire(): void {
    this.generation++;
    this.sessionEpoch.set(this.generation);
    this.session.set(null);
    void this.router.navigateByUrl('/connexion');
  }
  logout(): Observable<unknown> {
    if (this.closing()) return of(null);
    this.closing.set(true);
    const pending = this.refreshing ?? of(null);
    return pending.pipe(
      catchError(() => of(null)),
      switchMap(() => {
        const token = this.session()?.jetonRenouvellement;
        this.generation++;
        this.sessionEpoch.set(this.generation);
        this.session.set(null);
        return token ? this.api.logout(token) : of(null);
      }),
      finalize(() => { this.closing.set(false); void this.router.navigateByUrl('/connexion'); }),
    );
  }
}
