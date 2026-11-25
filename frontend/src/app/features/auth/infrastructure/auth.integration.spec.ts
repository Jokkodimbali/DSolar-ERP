import { describe, expect, it } from 'vitest';
import { apiPath, decodeSuccessMessage, parseErrorMessage } from '../../../core/api/api-contract';
import { hasPermissions, parseAuthResult, parseIdentity } from '../domain/auth.contract';
import { parseAlerts, parseRecentOrders } from '../../dashboard/domain/dashboard-operations.contract';
import { parseOverview } from '../../dashboard/domain/dashboard.contract';
import { parseReport, reports } from '../../dashboard/domain/dashboard-reports.contract';
import { parseAssignment, parseStore, parseStores } from '../../stores/domain/store.contract';

// Ce test Vitest s’exécute exclusivement dans Node.js.
declare const process: { readonly env: { readonly DSOLAR_AUTH_INTEGRATION?: string } };

const base = 'http://127.0.0.1:3100';
const email = 'auth-ci@example.test';
const password = 'Dsolar-CI-local-only-2026';

async function request(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: object,
  token?: string,
) {
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

function reportPath(path: string): string {
  if (path === 'monthly-revenue') return '/dashboard/monthly-revenue?year=2026';
  if (path === 'top-products' || path === 'recent-activity') return '/dashboard/' + path + '?limit=10';
  return '/dashboard/' + path;
}

async function requestCsv(name: string, token: string) {
  return fetch(base + apiPath('/dashboard/exports/' + name), {
    headers: { Authorization: 'Bearer ' + token },
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });
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

  it('valide tous les contrats de rapports et les exports CSV réels', async () => {
    const login = await request('/auth/login', 'POST', { email, password });
    expect(login.status).toBe(201);
    const session = parseAuthResult(login.data);
    try {
      const overview = await request('/dashboard/overview', 'GET', undefined, session.jetonAcces);
      expect(overview.status).toBe(200);
      expect(() => parseOverview(overview.data)).not.toThrow();

      for (const definition of reports) {
        const response = await request(reportPath(definition.path), 'GET', undefined, session.jetonAcces);
        expect(response.status, definition.path).toBe(200);
        const report = parseReport(response.data, definition, 2026);
        if (definition.path === 'monthly-revenue') expect(report.rows).toHaveLength(12);

        if (definition.exportName) {
          const csv = await requestCsv(definition.exportName, session.jetonAcces);
          expect(csv.status).toBe(200);
          expect(csv.headers.get('Content-Type')).toContain('text/csv');
          expect(csv.headers.get('Content-Disposition')).toContain(definition.exportName);
          expect((await csv.text()).trim()).not.toBe('');
        }
      }
    } finally {
      await request('/auth/logout', 'POST', { refreshToken: session.jetonRenouvellement });
    }
  }, 60000);

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
    for (const definition of reports) {
      const response = await request(reportPath(definition.path), 'GET', undefined, keeper.jetonAcces);
      expect(response.status, definition.path).toBe(403);
      if (definition.exportName) {
        const csv = await requestCsv(definition.exportName, keeper.jetonAcces);
        expect(csv.status).toBe(403);
        await csv.text();
      }
    }
    const storeResponse = await request(
      '/stores',
      'POST',
      { code: 'MAG-CI', name: 'Magasin CI', address: 'Dakar' },
      admin.jetonAcces,
    );
    expect(storeResponse.status).toBe(201);
    const store = parseStore(storeResponse.data);
    expect(store.status).toBe('ACTIVE');
    const path = '/stores/' + store.id;
    const alerts = await request(
      '/inventory' + path + '/alerts?threshold=5',
      'GET',
      undefined,
      admin.jetonAcces,
    );
    expect(alerts.status).toBe(200);
    expect(parseAlerts(alerts.data, store.id, store.name).items).toEqual([]);
    expect(
      (await request('/inventory' + path + '/alerts?threshold=5', 'GET', undefined, keeper.jetonAcces))
        .status,
    ).toBe(403);
    const recent = await request('/sales-orders/search?page=1&limit=5', 'GET', undefined, admin.jetonAcces);
    expect(recent.status).toBe(200);
    expect(() => parseRecentOrders(recent.data)).not.toThrow();
    expect(
      (await request('/sales-orders/search?page=1&limit=5', 'GET', undefined, keeper.jetonAcces)).status,
    ).toBe(403);
    expect(parseStores((await request('/stores', 'GET', undefined, admin.jetonAcces)).data)).toContainEqual(
      store,
    );
    expect(parseStore((await request(path, 'GET', undefined, admin.jetonAcces)).data)).toEqual(store);
    expect(parseStores((await request('/stores', 'GET', undefined, keeper.jetonAcces)).data)).toEqual([]);
    expect((await request(path, 'GET', undefined, keeper.jetonAcces)).status).toBe(403);
    expect((await request(path, 'PATCH', { name: 'Interdit' }, keeper.jetonAcces)).status).toBe(403);

    const updated = await request(
      path,
      'PATCH',
      { name: 'Magasin CI modifié', address: null },
      admin.jetonAcces,
    );
    expect(updated.status).toBe(200);
    expect(parseStore(updated.data).address).toBeNull();
    const assignment = path + '/users/' + keeper.utilisateur.id;
    const grant = await request(assignment, 'POST', {}, admin.jetonAcces);
    expect(grant.status).toBe(201);
    parseAssignment(grant.data, store.id, keeper.utilisateur.id, true);
    expect((await request('/stores', 'GET', undefined, keeper.jetonAcces)).status).toBe(401);

    const fresh = parseAuthResult(
      (await request('/auth/login', 'POST', { email: account.email, password })).data,
    );
    expect(
      parseStores((await request('/stores/mine', 'GET', undefined, fresh.jetonAcces)).data),
    ).toHaveLength(1);
    expect((await request(path, 'GET', undefined, fresh.jetonAcces)).status).toBe(200);
    const revoked = await request(assignment, 'DELETE', undefined, admin.jetonAcces);
    expect(revoked.status).toBe(200);
    parseAssignment(revoked.data, store.id, keeper.utilisateur.id, false);
    expect((await request('/stores', 'GET', undefined, fresh.jetonAcces)).status).toBe(401);

    const inactive = await request(path + '/deactivate', 'PATCH', {}, admin.jetonAcces);
    expect(inactive.status).toBe(200);
    expect(parseStore(inactive.data).status).toBe('INACTIVE');
    expect((await request(path, 'GET', undefined, admin.jetonAcces)).status).toBe(404);
    const active = await request(path + '/activate', 'PATCH', {}, admin.jetonAcces);
    expect(active.status).toBe(200);
    expect(parseStore(active.data).status).toBe('ACTIVE');
    await request('/auth/logout', 'POST', { refreshToken: admin.jetonRenouvellement });
  }, 60000);
});
