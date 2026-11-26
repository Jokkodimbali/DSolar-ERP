import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { HttpErrorResponse, HttpRequest, HttpResponse, type HttpHandlerFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom, of, Subject, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AuthApi } from '../infrastructure/auth.api';
import { SessionService } from './session.service';
import type { AuthResult } from '../domain/auth.contract';
import { authInterceptor } from '../../../core/api/auth.interceptor';
import { RetryRequiredError } from '../../../core/api/http-error';

const result = (id: string, token: string, refresh: string): AuthResult => ({
  jetonAcces: token,
  jetonRenouvellement: refresh,
  utilisateur: {
    id,
    email: 'test@example.test',
    nomComplet: 'Compte test',
    permissions: ['inventory.read'],
    magasinsAutorises: ['store'],
  },
});

function setup() {
  const initial = result('user', 'access', 'refresh');
  const rotated = result('user', 'next-access', 'next-refresh');
  const pending = new Subject<AuthResult>();
  const api = {
    login: vi.fn(() => of(initial)),
    refresh: vi.fn(() => pending.asObservable()),
    logout: vi.fn<() => ReturnType<AuthApi['logout']>>(() => of({ message: 'Déconnexion effectuée.' })),
  };
  const navigateByUrl = vi.fn(async () => true);
  const injector = Injector.create({
    providers: [
      { provide: AuthApi, useValue: api },
      { provide: Router, useValue: { navigateByUrl } },
      { provide: SessionService, useFactory: () => new SessionService() },
    ],
  });
  const session = injector.get(SessionService);
  const login = () => firstValueFrom(session.login({ email: 'test@example.test', password: 'test' }));
  const request = (method: string, path: string, next: HttpHandlerFn) =>
    firstValueFrom(
      runInInjectionContext(injector, () => authInterceptor(new HttpRequest(method, path, null), next)),
    );
  return { api, session, pending, initial, rotated, login, request, navigateByUrl };
}

const unauthorized = () => new HttpErrorResponse({ status: 401 });

describe('Cycle de session et intégration HTTP', () => {
  it('restaure la session une seule fois avant la navigation', async () => {
    const { session, api, pending, rotated } = setup();
    const first = firstValueFrom(session.restore());
    const second = firstValueFrom(session.restore());
    expect(api.refresh).toHaveBeenCalledTimes(1);
    pending.next(rotated);
    pending.complete();
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(await firstValueFrom(session.restore())).toBe(true);
    expect(session.accessToken()).toBe('next-access');
    expect(api.refresh).toHaveBeenCalledTimes(1);
  });

  it('reste anonyme si le cookie de session est absent ou expiré', async () => {
    const { session, api, pending } = setup();
    const restored = firstValueFrom(session.restore());
    pending.error(unauthorized());
    expect(await restored).toBe(false);
    expect(await firstValueFrom(session.restore())).toBe(false);
    expect(api.refresh).toHaveBeenCalledTimes(1);
  });

  it('connecte avec le contrat réel et filtre les permissions', async () => {
    const { session, login } = setup();
    expect(session.authenticated()).toBe(false);
    await login();
    expect(session.authenticated()).toBe(true);
    expect(session.can('inventory.read')).toBe(true);
    expect(session.can('users.manage')).toBe(false);
  });

  it('mutualise deux réponses 401 et rejoue les lectures une seule fois', async () => {
    const { api, login, request, pending, rotated } = setup();
    await login();
    const handler: HttpHandlerFn = (req) =>
      req.headers.get('Authorization') === 'Bearer access'
        ? throwError(unauthorized)
        : of(new HttpResponse({ body: 'ok' }));
    const first = request('GET', '/api/v1/auth/me', handler);
    const second = request('GET', '/api/v1/dashboard/overview', handler);
    expect(api.refresh).toHaveBeenCalledTimes(1);
    pending.next(rotated);
    pending.complete();
    await Promise.all([first, second]);
    expect(api.refresh).toHaveBeenCalledTimes(1);
  });

  it('ne rejoue jamais une mutation après renouvellement', async () => {
    const { login, request, pending, rotated } = setup();
    await login();
    const handler = vi.fn<HttpHandlerFn>(() => throwError(unauthorized));
    const response = request('POST', '/api/v1/sales-orders/order/payments', handler);
    const check = expect(response).rejects.toBeInstanceOf(RetryRequiredError);
    pending.next(rotated);
    pending.complete();
    await check;
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('ne transmet aucun jeton à une URL externe', async () => {
    const { login, request } = setup();
    await login();
    await request('GET', 'https://example.test/api/v1/auth/me', (req) => {
      expect(req.headers.has('Authorization')).toBe(false);
      return of(new HttpResponse());
    });
  });

  it('ne renouvelle pas une session sur une erreur 403', async () => {
    const { login, request, api } = setup();
    await login();
    await expect(
      request('GET', '/api/v1/dashboard/overview', () =>
        throwError(() => new HttpErrorResponse({ status: 403 })),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(api.refresh).not.toHaveBeenCalled();
  });

  it('déconnecte avec le dernier refresh après rotation', async () => {
    const { session, login, pending, rotated, api } = setup();
    await login();
    const refresh = firstValueFrom(session.refreshAfter('access', session.sessionVersion()));
    const logout = firstValueFrom(session.logout());
    expect(session.authenticated()).toBe(false);
    expect(session.accessToken()).toBeNull();
    pending.next(rotated);
    pending.complete();
    await refresh;
    await logout;
    expect(api.logout).toHaveBeenCalledWith();
    expect(session.user()).toBeNull();
  });

  it('efface localement la session et signale une révocation non confirmée', async () => {
    const { api, session, login } = setup();
    await login();
    api.logout.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 503 })));
    await expect(firstValueFrom(session.logout())).rejects.toMatchObject({ status: 503 });
    expect(session.user()).toBeNull();
    expect(session.notice()).toContain('n’a pas pu être confirmée');
  });

  it('rejette une réponse HTTP reçue après changement de session', async () => {
    const { session, login, request } = setup();
    await login();
    const response = new Subject<HttpResponse<unknown>>();
    const promise = request('GET', '/api/v1/auth/me', () => response);
    const check = expect(promise).rejects.toThrow('Session fermée.');
    session.expire();
    await login();
    response.next(new HttpResponse({ body: { private: true } }));
    response.complete();
    await check;
  });

  it('refuse une identité différente et une identité devenue obsolète', async () => {
    const { session, login, initial } = setup();
    await login();
    const epoch = session.sessionVersion();
    expect(session.updateIdentity(epoch, { ...initial.utilisateur, permissions: [] })).toBe(true);
    expect(session.can('inventory.read')).toBe(false);
    expect(session.updateIdentity(epoch, { ...initial.utilisateur, id: 'other' })).toBe(false);
    expect(session.authenticated()).toBe(false);
    await login();
    expect(session.updateIdentity(epoch, initial.utilisateur)).toBe(false);
  });

  it('expire la session si le renouvellement est refusé', async () => {
    const { session, login, pending } = setup();
    await login();
    const promise = firstValueFrom(session.refreshAfter('access', session.sessionVersion()));
    const check = expect(promise).rejects.toMatchObject({ status: 401 });
    pending.error(unauthorized());
    await check;
    expect(session.authenticated()).toBe(false);
    expect(session.accessToken()).toBeNull();
  });
});
