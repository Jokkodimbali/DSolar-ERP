import { describe, expect, it } from 'vitest';
import { apiPath, decodeSuccessMessage, parseErrorMessage } from '../../../core/api/api-contract';
import { hasPermissions, parseAuthResult, parseIdentity } from '../domain/auth.contract';
import { parseAlerts, parseRecentOrders } from '../../dashboard/domain/dashboard-operations.contract';
import { parseSearch, sources } from '../../search/domain/search.contract';
import { notificationEvent, parseMark, parseFeed } from '../../notifications/domain/notification.contract';
import { parseCreatedProforma, parseOptions, proformaInput } from '../../sales/domain/proforma.contract';
import { parsePeriod } from '../../dashboard/domain/dashboard-period.contract';
import { parseId, parsePage, parseTransfer, parseTransferDetail, parseCount, parseCountDetail } from '../../inventory/domain/workflow.contract';
import { parseMovements, parseStock, parseBalance } from '../../inventory/domain/stock.contract';
import { parseOverview } from '../../dashboard/domain/dashboard.contract';
import { parseReport, reports } from '../../dashboard/domain/dashboard-reports.contract';
import {
  parseProduct,
  parseProductPage,
  parsePrices,
  parseReferences,
} from '../../products/domain/product.contract';
import { parseUsers, accessInput } from '../../users/domain/users.contract';
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
      const period = await request('/dashboard/period?month=2028-02', 'GET', undefined, session.jetonAcces);
      expect(period.status).toBe(200);
      expect(parsePeriod(period.data, '2028-02').days).toHaveLength(29);
      expect(
        (await request('/dashboard/period?month=2028-13', 'GET', undefined, session.jetonAcces)).status,
      ).toBe(400);
      expect((await request('/dashboard/period?month=2028-02')).status).toBe(401);

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
    const listed = await request('/users', 'GET', undefined, admin.jetonAcces);
    expect(listed.status).toBe(200);
    expect(parseUsers(listed.data)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ email: account.email, role: 'MAGASINIER', status: 'ACTIVE' }),
      ]),
    );
    expect(JSON.stringify(listed.data)).not.toContain('passwordHash');
    expect(JSON.stringify(listed.data)).not.toContain('tokenVersion');
    const adminPath = '/users/' + admin.utilisateur.id;
    expect(
      (await request(adminPath + '/access', 'PATCH', accessInput('MAGASINIER', []), admin.jetonAcces)).status,
    ).toBe(403);
    const login = await request('/auth/login', 'POST', { email: account.email, password });
    expect(login.status).toBe(201);
    const keeper = parseAuthResult(login.data);
    expect(hasPermissions(keeper.utilisateur, ['users.manage'])).toBe(false);
    expect((await request('/auth/me', 'GET', undefined, keeper.jetonAcces)).status).toBe(200);
    expect((await request('/users', 'GET', undefined, keeper.jetonAcces)).status).toBe(403);
    expect(
      (
        await request(
          '/users/' + keeper.utilisateur.id + '/access',
          'PATCH',
          accessInput('ADMIN', []),
          keeper.jetonAcces,
        )
      ).status,
    ).toBe(403);
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
    const notifications = await request('/notifications', 'GET', undefined, admin.jetonAcces);
    expect(notifications.status).toBe(200);
    const feed = parseFeed(notifications.data);
    const notification = feed.items.find((item) => !item.read);
    if (notification) {
      const mark = await request('/notifications/' + notification.id + '/read', 'POST', {}, admin.jetonAcces);
      expect(mark.status).toBe(201);
      expect(() => parseMark(mark.data)).not.toThrow();
    }
    for (const source of sources) {
      const response = await request(
        source.path + '?search=Magasin&page=1&limit=5',
        'GET',
        undefined,
        admin.jetonAcces,
      );
      expect(response.status, source.path).toBe(200);
      expect(() => parseSearch(response.data, source)).not.toThrow();
      if (source.permission === 'sales.read') {
        expect(
          (await request(source.path + '?page=1&limit=5', 'GET', undefined, keeper.jetonAcces)).status,
        ).toBe(403);
      }
    }
    const scoped = await request(
      '/search/stores?search=Magasin&page=1&limit=5',
      'GET',
      undefined,
      keeper.jetonAcces,
    );
    expect(scoped.status).toBe(200);
    const storeSource = sources.find((source) => source.label === 'Magasins');
    if (!storeSource) throw new Error('Source manquante.');
    expect(parseSearch(scoped.data, storeSource).items).toEqual([]);
    const stream = await fetch(base + apiPath('/notifications/stream'), {
      headers: { Authorization: 'Bearer ' + admin.jetonAcces, Accept: 'text/event-stream' },
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    expect(stream.status).toBe(200);
    expect(stream.headers.get('Content-Type')).toContain('text/event-stream');
    if (!stream.body) throw new Error('Flux SSE absent.');
    const reader = stream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      let received = false;
      while (!received) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        if (buffer.length > 512000) throw new Error('Flux SSE trop volumineux.');
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() ?? '';
        for (const block of blocks) {
          const event = notificationEvent(block);
          if (event) received = true;
        }
      }
      expect(received).toBe(true);
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
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
    const selfAssignment = await request(
      path + '/users/' + admin.utilisateur.id,
      'POST',
      {},
      admin.jetonAcces,
    );
    expect(selfAssignment.status).toBe(201);
    expect((await request('/auth/me', 'GET', undefined, admin.jetonAcces)).status).toBe(401);

    const saleAdmin = parseAuthResult((await request('/auth/login', 'POST', { email, password })).data);
    const token = saleAdmin.jetonAcces;
    try {
      const customerResponse = await request('/customers', 'POST', { name: 'Client proforma CI' }, token);
      expect(customerResponse.status).toBe(201);
      const productResponse = await request(
        '/products',
        'POST',
        { name: 'Panneau proforma CI', sku: 'PV-PROFORMA-CI', isSolarPlant: false },
        token,
      );
      expect(productResponse.status).toBe(201);
      const catalogueProduct = parseProduct(productResponse.data);
      const listedProducts = await request(
        '/products/search?search=PV-PROFORMA-CI&page=1&limit=10&active=true',
        'GET',
        undefined,
        token,
      );
      expect(listedProducts.status).toBe(200);
      expect(parseProductPage(listedProducts.data).items).toContainEqual(catalogueProduct);
      for (const kind of ['categories', 'brands', 'tax-regimes'] as const) {
        const references = await request('/' + kind, 'GET', undefined, token);
        expect(references.status).toBe(200);
        expect(() => parseReferences(references.data, kind)).not.toThrow();
      }
      const productPath = '/products/' + catalogueProduct.id;
      const createdCategory = await request(
        '/categories',
        'POST',
        { code: 'CI-PV', name: 'Catégorie CI' },
        token,
      );
      expect(createdCategory.status).toBe(201);
      const category = parseReferences([createdCategory.data], 'categories')[0];
      if (!category) throw new Error('Catégorie manquante.');
      const childResponse = await request(
        '/categories',
        'POST',
        { code: 'CI-PV-CHILD', name: 'Sous-catégorie CI', parentId: category.id },
        token,
      );
      expect(childResponse.status).toBe(201);
      const child = parseReferences([childResponse.data], 'categories')[0];
      if (!child) throw new Error('Sous-catégorie manquante.');
      const categoryPath = '/categories/' + category.id;
      expect((await request(categoryPath, 'DELETE', undefined, token)).status).toBe(409);
      expect((await request('/categories/' + child.id, 'DELETE', undefined, token)).status).toBe(200);
      const renamed = await request(categoryPath, 'PATCH', { name: 'Catégorie CI renommée' }, token);
      expect(renamed.status).toBe(200);
      expect(parseReferences([renamed.data], 'categories')[0]?.name).toBe('Catégorie CI renommée');
      const brandResponse = await request('/brands', 'POST', { name: 'Marque CI' }, token);
      expect(brandResponse.status).toBe(201);
      const brand = parseReferences([brandResponse.data], 'brands')[0];
      if (!brand) throw new Error('Marque manquante.');
      const brandPath = '/brands/' + brand.id;
      expect((await request(brandPath, 'PATCH', { name: 'Marque CI renommée' }, token)).status).toBe(200);
      const taxResponse = await request(
        '/tax-regimes',
        'POST',
        { code: 'CI-TAX', name: 'Fiscalité CI', rate: '18' },
        token,
      );
      expect(taxResponse.status).toBe(201);
      const tax = parseReferences([taxResponse.data], 'tax-regimes')[0];
      if (!tax) throw new Error('Régime fiscal manquant.');
      const renamedTax = await request(
        '/tax-regimes/' + tax.id,
        'PATCH',
        { name: 'Fiscalité CI renommée' },
        token,
      );
      expect(renamedTax.status).toBe(200);
      expect(parseReferences([renamedTax.data], 'tax-regimes')[0]?.rate).toBe('18');
      expect(
        (await request('/tax-regimes/' + tax.id, 'PATCH', { name: 'Fiscalité CI', rate: '20' }, token))
          .status,
      ).toBe(400);
      const edited = await request(
        productPath,
        'PATCH',
        { categoryId: category.id, brandId: brand.id, taxRegimeId: tax.id },
        token,
      );
      expect(edited.status).toBe(200);
      expect(parseProduct(edited.data).categoryId).toBe(category.id);
      expect((await request(categoryPath, 'DELETE', undefined, token)).status).toBe(409);
      expect((await request(brandPath, 'DELETE', undefined, token)).status).toBe(409);
      const detached = await request(
        productPath,
        'PATCH',
        { categoryId: null, brandId: null, taxRegimeId: null },
        token,
      );
      expect(detached.status).toBe(200);
      expect(parseProduct(detached.data).categoryId).toBeNull();
      expect((await request(categoryPath, 'DELETE', undefined, token)).status).toBe(200);
      expect((await request(brandPath, 'DELETE', undefined, token)).status).toBe(200);
      expect((await request(productPath, 'PATCH', { isSolarPlant: null }, token)).status).toBe(400);
      const inactiveProduct = await request(productPath + '/deactivate', 'PATCH', {}, token);
      expect(inactiveProduct.status).toBe(200);
      expect(parseProduct(inactiveProduct.data).active).toBe(false);
      const activatedProduct = await request(productPath + '/activate', 'PATCH', {}, token);
      expect(activatedProduct.status).toBe(200);
      expect(parseProduct(activatedProduct.data).active).toBe(true);
      const image = Uint8Array.from(
        atob(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DQAAAEgQGALFXOsAAAAABJRU5ErkJggg==',
        ),
        (char) => char.charCodeAt(0),
      );
      const form = new FormData();
      form.append('file', new Blob([image], { type: 'image/png' }), 'test.png');
      const photoPath = '/media/products/' + catalogueProduct.id + '/photo';
      const uploaded = await fetch(base + apiPath(photoPath), {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body: form,
        signal: AbortSignal.timeout(15000),
      });
      expect(uploaded.status).toBe(201);
      const meta = await request(photoPath, 'GET', undefined, token);
      expect(meta.status).toBe(200);
      expect(meta.data).toMatchObject({ mimeType: 'image/png' });
      const pricePath = '/products/' + catalogueProduct.id + '/prices';
      expect(
        (await request(pricePath, 'POST', { salePrice: '1000.25', purchasePrice: '800.10' }, token)).status,
      ).toBe(201);
      expect((await request(pricePath, 'POST', { salePrice: '1100.50' }, token)).status).toBe(201);
      const history = parsePrices((await request(pricePath, 'GET', undefined, token)).data);
      expect(history).toHaveLength(2);
      expect(history.filter((price) => price.validTo === null)).toHaveLength(1);
      expect(history[0]?.salePrice).toBe('1100.5');
      const [customer] = parseOptions([customerResponse.data]);
      const [product] = parseOptions([productResponse.data]);
      if (!customer || !product) throw new Error('Références manquantes.');
      const mine = await request('/stores/mine', 'GET', undefined, token);
      expect(parseStores(mine.data).some((entry) => entry.id === store.id)).toBe(true);
      const input = proformaInput(customer.id, [
        {
          storeId: store.id,
          productId: product.id,
          quantity: '2',
          unitPrice: '1000',
          discount: '0',
          taxRate: '18',
        },
      ]);
      const invalidDiscount = {
        ...input,
        lines: input.lines.map((line) => ({ ...line, discount: 10 })),
      };
      expect((await request('/proformas', 'POST', invalidDiscount, token)).status).toBe(409);
      const uniqueInput = { ...input, number: 'PF-CI-RETRY-001' };
      const result = await request('/proformas', 'POST', uniqueInput, token);
      expect(result.status).toBe(201);
      const created = parseCreatedProforma(result.data);
      expect((await request('/proformas', 'POST', uniqueInput, token)).status).toBe(409);
      expect(created.total).toBe('2\u202f360,00 FCFA');
      const detail = await request('/proformas/' + created.id, 'GET', undefined, token);
      expect(detail.status).toBe(200);
      expect(parseCreatedProforma(detail.data)).toEqual(created);
      const source = sources.find((entry) => entry.label === 'Proformas');
      if (!source) throw new Error('Source proformas manquante.');
      const found = await request(
        source.path + '?search=PF-CI-RETRY-001&page=1&limit=5',
        'GET',
        undefined,
        token,
      );
      expect(found.status).toBe(200);
      expect(parseSearch(found.data, source).items).toContainEqual({
        id: created.id,
        title: created.number,
        subtitle: '',
      });
      expect((await request('/proformas/' + created.id + '/cancel', 'POST', {}, token)).status).toBe(201);

      const adjustmentInput = {
        storeId: store.id,
        productId: product.id,
        direction: 'IN',
        quantity: '2.500',
        reason: 'Stock initial de test CI',
        operationKey: crypto.randomUUID(),
      };
      const adjustment = await request('/inventory/adjustments', 'POST', adjustmentInput, token);
      expect(adjustment.status).toBe(201);
      expect(parseBalance(adjustment.data, store.id, product.id).quantity).toBe('2.500');
      const replay = await request('/inventory/adjustments', 'POST', adjustmentInput, token);
      expect(replay.status).toBe(201);
      expect(parseBalance(replay.data, store.id, product.id).quantity).toBe('2.500');
      expect(
        (await request('/inventory/adjustments', 'POST', { ...adjustmentInput, quantity: '3' }, token))
          .status,
      ).toBe(409);
      const stock = await request('/inventory' + path + '/stock', 'GET', undefined, token);
      expect(stock.status).toBe(200);
      expect(parseStock(stock.data, store.id)).toEqual(
        expect.arrayContaining([expect.objectContaining({ productId: product.id, quantity: '2.500' })]),
      );
      const movementHistory = await request(
        '/inventory' + path + '/movements/search?search=PV-PROFORMA-CI&page=1&limit=10',
        'GET',
        undefined,
        token,
      );
      expect(movementHistory.status).toBe(200);
      expect(parseMovements(movementHistory.data, store.id).items).toEqual([
        expect.objectContaining({ productId: product.id, quantity: '2.500', type: 'Ajustement' }),
      ]);
      const alertsWithStock = await request(
        '/inventory' + path + '/alerts?threshold=5',
        'GET',
        undefined,
        token,
      );
      expect(alertsWithStock.status).toBe(200);
      expect(parseAlerts(alertsWithStock.data, store.id, store.name).items).toContainEqual({
        productId: product.id,
        name: product.name,
        sku: 'PV-PROFORMA-CI',
        unit: 'PIECE',
        available: '2.500',
        severity: 'LOW_STOCK',
      });

      const destinationResponse = await request('/stores', 'POST', { code: 'CI-TRANSFER', name: 'Magasin réception CI' }, token);
      expect(destinationResponse.status).toBe(201);
      const destination = parseStore(destinationResponse.data);
      const transferResponse = await request('/inventory/transfers', 'POST', {
        number: 'TR-INTEGRATION-CI', originId: store.id, destinationId: destination.id,
        lines: [{ productId: product.id, quantity: '1.000' }],
      }, token);
      expect(transferResponse.status).toBe(201);
      const transferId = parseId(transferResponse.data);
      const transferPath = '/inventory/transfers/' + transferId;
      const transferList = await request('/inventory/transfers/stores/' + store.id + '/search?search=TR-INTEGRATION-CI&page=1&limit=10', 'GET', undefined, token);
      expect(transferList.status).toBe(200);
      expect(parsePage(transferList.data, parseTransfer).items[0]?.id).toBe(transferId);
      expect((await request(transferPath + '/ship', 'POST', {}, token)).status).toBe(409);
      expect((await request(transferPath + '/approve', 'POST', {}, token)).status).toBe(201);
      expect((await request(transferPath + '/ship', 'POST', {}, token)).status).toBe(201);
      const shipped = parseTransferDetail((await request(transferPath, 'GET', undefined, token)).data);
      expect(shipped.status).toBe('SHIPPED');
      const line = shipped.lines[0];
      if (!line) throw new Error('Ligne de transfert manquante.');
      const receive = { operationKey: crypto.randomUUID(), finalize: false, lines: [{ lineId: line.id, received: '0.500', damaged: '0', missing: '0' }] };
      expect((await request(transferPath + '/receive', 'POST', receive, token)).status).toBe(201);
      expect((await request(transferPath + '/receive', 'POST', receive, token)).status).toBe(201);
      const partial = parseTransferDetail((await request(transferPath, 'GET', undefined, token)).data);
      expect(partial.lines[0]?.received).toBe('0.5');
      expect((await request(transferPath + '/receive', 'POST', { operationKey: crypto.randomUUID(), finalize: true, lines: [{ lineId: line.id, received: '0', damaged: '0.250', missing: '0.250' }] }, token)).status).toBe(201);
      const closed = parseTransferDetail((await request(transferPath, 'GET', undefined, token)).data);
      expect(closed.status).toBe('CLOSED_WITH_DISCREPANCY');
      const destinationStock = parseStock((await request('/inventory/stores/' + destination.id + '/stock', 'GET', undefined, token)).data, destination.id);
      expect(destinationStock[0]?.quantity).toBe('0.500');
      const openedCount = await request('/inventory/counts/stores/' + store.id, 'POST', {}, token);
      expect(openedCount.status).toBe(201);
      const countId = parseId(openedCount.data);
      const countPath = '/inventory/counts/' + countId;
      const countList = await request('/inventory/counts/stores/' + store.id + '/search?page=1&limit=10', 'GET', undefined, token);
      expect(countList.status).toBe(200);
      expect(parsePage(countList.data, parseCount).items[0]?.id).toBe(countId);
      expect((await request(countPath + '/validate', 'POST', {}, token)).status).toBe(409);
      expect((await request(countPath + '/lines', 'POST', { lines: [{ productId: product.id, counted: '2.500', reason: 'Recomptage CI' }] }, token)).status).toBe(201);
      expect((await request(countPath + '/validate', 'POST', {}, token)).status).toBe(201);
      expect(parseCountDetail((await request(countPath, 'GET', undefined, token)).data).status).toBe('VALIDATED');
      expect(parseBalance((await request('/inventory' + path + '/products/' + product.id, 'GET', undefined, token)).data, store.id, product.id).quantity).toBe('2.500');

      const second = await request('/proformas', 'POST', input, token);
      expect(second.status).toBe(201);
      const draft = parseCreatedProforma(second.data);
      expect((await request('/proformas/' + draft.id + '/issue', 'POST', {}, token)).status).toBe(201);
      expect((await request('/proformas/' + draft.id + '/accept', 'POST', {}, token)).status).toBe(201);
      const converted = await request('/sales-orders/from-proforma/' + draft.id, 'POST', {}, token);
      expect(converted.status).toBe(201);
      const orders = await request('/sales-orders/search?page=1&limit=5', 'GET', undefined, token);
      expect(orders.status).toBe(200);
      expect(parseRecentOrders(orders.data)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ total: '2\u202f360,00 FCFA', paymentStatus: 'Impayée' }),
        ]),
      );
    } finally {
      await request('/auth/logout', 'POST', { refreshToken: saleAdmin.jetonRenouvellement });
    }
  }, 120000);
});
