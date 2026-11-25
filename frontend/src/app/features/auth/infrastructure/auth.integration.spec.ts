import { describe, expect, it } from 'vitest';
import { apiPath, decodeSuccessMessage, parseErrorMessage } from '../../../core/api/api-contract';
import { hasPermissions, parseAuthResult, parseIdentity } from '../domain/auth.contract';

// Ce test Vitest s’exécute exclusivement dans Node.js.
declare const process: { readonly env: { readonly DSOLAR_AUTH_INTEGRATION?: string } };

const base = 'http://127.0.0.1:3100';
const email = 'auth-ci@example.test';
const password = 'Dsolar-CI-local-only-2026';

async function request(path: string, method: 'GET' | 'POST' = 'GET', body?: object, token?: string) {
  const headers = new Headers();
  if (body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', 'Bearer ' + token);
  const response = await fetch(base + apiPath(path), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });
  const data: unknown = await response.json();
  return {
    status: response.status,
    data,
    message: decodeSuccessMessage(response.headers.get('X-Success-Message')),
  };
}

describe.skipIf(process.env.DSOLAR_AUTH_INTEGRATION !== '1')('Contrat HTTP NestJS réel', () => {
  it('connecte, vérifie l’identité, renouvelle puis révoque une session en base', async () => {
    const unauthorized = await request('/auth/me');
    expect(unauthorized.status).toBe(401);

    const invalid = await request('/auth/login', 'POST', { email, password: 'incorrect' });
    expect(invalid.status).toBe(401);
    expect(parseErrorMessage(invalid.data, invalid.status)).toBe('Identifiants ou session invalides.');

    const login = await request('/auth/login', 'POST', { email, password });
    expect(login.status).toBe(201);
    expect(login.message).toBe('Connexion réussie.');
    const session = parseAuthResult(login.data);
    expect(hasPermissions(session.utilisateur, ['users.manage', 'sales.read'])).toBe(true);

    const me = await request('/auth/me', 'GET', undefined, session.jetonAcces);
    expect(me.status).toBe(200);
    expect(parseIdentity(me.data)).toEqual(session.utilisateur);

    const refresh = await request('/auth/refresh', 'POST', { refreshToken: session.jetonRenouvellement });
    expect(refresh.status).toBe(201);
    const next = parseAuthResult(refresh.data);
    expect(next.utilisateur.id).toBe(session.utilisateur.id);
    expect(next.jetonRenouvellement).not.toBe(session.jetonRenouvellement);

    const logout = await request('/auth/logout', 'POST', { refreshToken: next.jetonRenouvellement });
    expect(logout.status).toBe(201);
    expect(logout.message).toBe('Déconnexion effectuée.');
    expect((await request('/auth/me', 'GET', undefined, next.jetonAcces)).status).toBe(401);
  }, 30000);

  it('refuse les routes administratives au magasinier authentifié', async () => {
    const admin = parseAuthResult((await request('/auth/login', 'POST', { email, password })).data);
    const account = {
      email: 'magasinier-ci@example.test',
      fullName: 'Magasinier CI',
      password,
      roleCodes: ['MAGASINIER'],
      storeIds: [],
    };
    const created = await request('/users', 'POST', account, admin.jetonAcces);
    expect(created.status).toBe(201);
    expect(hasPermissions(parseIdentity(created.data), ['inventory.read', 'inventory.manage'])).toBe(true);
    const login = await request('/auth/login', 'POST', { email: account.email, password });
    expect(login.status).toBe(201);
    const keeper = parseAuthResult(login.data);
    expect(hasPermissions(keeper.utilisateur, ['users.manage'])).toBe(false);
    expect((await request('/auth/me', 'GET', undefined, keeper.jetonAcces)).status).toBe(200);
    expect((await request('/users', 'GET', undefined, keeper.jetonAcces)).status).toBe(403);
    expect((await request('/dashboard/overview', 'GET', undefined, keeper.jetonAcces)).status).toBe(403);
    await request('/auth/logout', 'POST', { refreshToken: keeper.jetonRenouvellement });
    await request('/auth/logout', 'POST', { refreshToken: admin.jetonRenouvellement });
  }, 30000);
});
