import { describe, expect, it } from 'vitest';
import { apiPath, decodeSuccessMessage, parseErrorMessage } from '../../../core/api/api-contract';
import { hasPermissions, parseAuthResult, parseIdentity } from '../domain/auth.contract';
import { parseAlerts, parseRecentOrders } from '../../dashboard/domain/dashboard-operations.contract';
import { parseSearch, sources } from '../../search/domain/search.contract';
import {
  notificationEvent,
  parseMark,
  parseFeed,
  parseNotificationPage,
} from '../../notifications/domain/notification.contract';
import { blankFilters, parseAuditPage, parseAuditSummary } from '../../audit/domain/audit.contract';
import { parseCompany } from '../../settings/domain/company.contract';
import {
  parseAutomation,
  parseBalance as parseLedgerBalance,
  parseEntries,
  parsePending,
  parseSetup,
  parseStatements,
} from '../../accounting/ledger/domain/ledger.contract';
import { parseCreatedProforma, parseOptions, proformaInput } from '../../sales/domain/proforma.contract';
import { parseCustomer, parseCustomerPage } from '../../sales/domain/customer.contract';
import { parseProforma, parseProformaPage } from '../../sales/domain/proforma-view.contract';
import { parseLinkedOrder } from '../../sales/domain/proforma-conversion.contract';
import { parseInvoice, parseInvoicePage, verifyInvoiceOrder } from '../../sales/domain/invoice.contract';
import { parseOrderDetail } from '../../sales/domain/order-view.contract';
import { parsePaymentSummary, verifyRecordedPayment } from '../../sales/domain/payment.contract';
import { parseAllocations } from '../../sales/domain/payment-allocation.contract';
import { parseCreditPreview, verifyIssuedCredit } from '../../sales/domain/credit-note.contract';
import {
  parseDelivery,
  parseDeliveryPage,
  parseDeliveryProgress,
} from '../../sales/domain/delivery.contract';
import { parsePeriod } from '../../dashboard/domain/dashboard-period.contract';
import {
  parseId,
  parsePage,
  parseTransfer,
  parseTransferDetail,
  parseCount,
  parseCountDetail,
} from '../../inventory/domain/workflow.contract';
import {
  parseMovements,
  parseStock,
  parseBalance,
  parseStockPage,
  parseStockSummary,
} from '../../inventory/domain/stock.contract';
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
import {
  category as parseExpenseCategory,
  parseExpensePage,
  parseExpenseSummary,
  parseOpenCashSessions,
  verifyCreatedExpense,
  verifyExpenseAction,
} from '../../expenses/domain/expense.contract';
import {
  cents as cashCents,
  parseCandidates,
  parseMovementPage,
  parseSessionPage,
  parseSummary,
  verifyCashCommand,
} from '../../treasury/domain/treasury.contract';
import {
  parseAssetAccounts,
  parseBankAccounts,
  parseBankAccount,
  parseBankReport,
  parseStatementPage,
  parseSuggestions,
  verifyImported,
} from '../../accounting/bank/domain/bank.contract';
import { parseSupplierPurchases } from '../../procurement/domain/supplier-purchases.contract';
import { parseSupplier, parseSupplierPage } from '../../procurement/domain/supplier.contract';
import { parseGoodsReceipt, parseReceiptPage } from '../../procurement/domain/goods-receipt.contract';
import { parseReturnOptions } from '../../procurement/domain/return-creation.contract';
import {
  parseSupplierReturn,
  parseSupplierReturnPage,
} from '../../procurement/domain/supplier-return.contract';
import {
  parsePurchaseOrder,
  parsePurchaseOrderPage,
  parsePurchaseProgress,
  purchaseOrderInput,
} from '../../procurement/domain/purchase-order.contract';

// Ce test Vitest s’exécute exclusivement dans Node.js.
declare const process: { readonly env: { readonly DSOLAR_AUTH_INTEGRATION?: string } };

const base = 'http://127.0.0.1:3100';
const email = 'auth-ci@example.test';
const password = 'Dsolar-CI-local-only-2026';

async function request(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT' = 'GET',
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
    for (const path of ['/audit', '/audit/summary', '/settings/company', '/accounting/setup']) {
      expect((await request(path)).status, path).toBe(401);
      expect((await request(path, 'GET', undefined, keeper.jetonAcces)).status, path).toBe(403);
    }
    expect((await request('/settings/company', 'PUT', {}, keeper.jetonAcces)).status).toBe(403);
    expect((await request('/accounting/rules', 'POST', {}, keeper.jetonAcces)).status).toBe(403);
    expect((await request('/suppliers/search')).status).toBe(401);
    const supplierResponse = await request(
      '/suppliers',
      'POST',
      { name: 'Fournisseur contrat CI', email: 'supplier@example.test', address: 'Dakar CI' },
      keeper.jetonAcces,
    );
    expect(supplierResponse.status).toBe(201);
    const supplier = parseSupplier(supplierResponse.data);
    const supplierPath = '/suppliers/' + supplier.id;
    const purchases = await request(supplierPath + '/purchases-summary', 'GET', undefined, admin.jetonAcces);
    expect(purchases.status).toBe(200);
    expect(parseSupplierPurchases(purchases.data, supplier.id).netReceivedValue).toBe('0.00');
    expect(
      (await request(supplierPath + '/purchases-summary', 'GET', undefined, keeper.jetonAcces)).status,
    ).toBe(403);
    expect((await request(supplierPath + '/purchases-summary')).status).toBe(401);
    const command = { name: 'Fournisseur idempotent CI', operationKey: crypto.randomUUID() };
    const duplicates = await Promise.all([
      request('/suppliers', 'POST', command, keeper.jetonAcces),
      request('/suppliers', 'POST', command, keeper.jetonAcces),
    ]);
    for (const response of duplicates) expect(response.status).toBe(201);
    expect(parseSupplier(duplicates[0]?.data).id).toBe(parseSupplier(duplicates[1]?.data).id);
    expect(
      (await request('/suppliers', 'POST', { ...command, name: 'Autre fournisseur' }, keeper.jetonAcces))
        .status,
    ).toBe(409);
    expect(parseSupplier((await request(supplierPath, 'GET', undefined, admin.jetonAcces)).data)).toEqual(
      supplier,
    );
    const searched = await request(
      '/suppliers/search?search=Dakar%20CI&active=true&page=1&limit=1',
      'GET',
      undefined,
      keeper.jetonAcces,
    );
    expect(searched.status).toBe(200);
    expect(parseSupplierPage(searched.data).items).toContainEqual(supplier);
    expect((await request('/suppliers/search?limit=101', 'GET', undefined, keeper.jetonAcces)).status).toBe(
      400,
    );
    expect((await request(supplierPath, 'PATCH', { name: null }, keeper.jetonAcces)).status).toBe(400);
    const cleared = await request(supplierPath, 'PATCH', { email: null }, keeper.jetonAcces);
    expect(cleared.status).toBe(200);
    expect(parseSupplier(cleared.data).email).toBeNull();
    expect(
      parseSupplier((await request(supplierPath, 'GET', undefined, admin.jetonAcces)).data).email,
    ).toBeNull();
    for (const action of ['deactivate', 'activate'] as const) {
      const changed = await request(supplierPath + '/' + action, 'POST', {}, keeper.jetonAcces);
      expect(changed.status).toBe(201);
      expect(parseSupplier(changed.data).active).toBe(action === 'activate');
      const repeated = await request(supplierPath + '/' + action, 'POST', {}, keeper.jetonAcces);
      expect(repeated.status).toBe(201);
      expect(parseSupplier(repeated.data)).toEqual(parseSupplier(changed.data));
    }
    expect((await request(supplierPath + '/deactivate', 'POST', {})).status).toBe(401);
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
      const customerCommand = { name: 'Client proforma CI', operationKey: crypto.randomUUID() };
      const customerResponse = await request('/customers', 'POST', customerCommand, token);
      expect(customerResponse.status).toBe(201);
      const customerRecord = parseCustomer(customerResponse.data);
      const customerReplay = await request('/customers', 'POST', customerCommand, token);
      expect(customerReplay.status).toBe(201);
      expect(parseCustomer(customerReplay.data).id).toBe(customerRecord.id);
      const conflictingCustomer = await request(
        '/customers',
        'POST',
        { ...customerCommand, name: 'Autre client CI' },
        token,
      );
      expect(conflictingCustomer.status).toBe(409);
      const updatedCustomer = await request(
        '/customers/' + customerRecord.id,
        'PATCH',
        { phone: '770000000', email: 'test@example.test' },
        token,
      );
      expect(updatedCustomer.status).toBe(200);
      expect(parseCustomer(updatedCustomer.data).phone).toBe('770000000');
      const clearedCustomer = await request(
        '/customers/' + customerRecord.id,
        'PATCH',
        { email: null },
        token,
      );
      expect(clearedCustomer.status).toBe(200);
      expect(parseCustomer(clearedCustomer.data).email).toBeNull();
      const customerList = await request(
        '/customers/search?search=Client%20proforma%20CI&page=1&limit=10',
        'GET',
        undefined,
        token,
      );
      expect(customerList.status).toBe(200);
      expect(parseCustomerPage(customerList.data).items.map((item) => item.id)).toContain(customerRecord.id);
      const productResponse = await request(
        '/products',
        'POST',
        { name: 'Panneau proforma CI', sku: 'PV-PROFORMA-CI', isSolarPlant: false },
        token,
      );
      expect(productResponse.status).toBe(201);
      const catalogueProduct = parseProduct(productResponse.data);
      const purchaseInput = purchaseOrderInput('CF-CONTRAT-CI', supplier.id, [
        { productId: catalogueProduct.id, quantity: '2.125', unitCost: '1250.25' },
      ]);
      const purchaseResponse = await request('/purchase-orders', 'POST', purchaseInput, token);
      expect(purchaseResponse.status).toBe(201);
      const purchase = parsePurchaseOrder(purchaseResponse.data);
      expect(purchase.status).toBe('DRAFT');
      const purchasePath = '/purchase-orders/' + purchase.id;
      const purchaseList = await request(
        '/purchase-orders/search?search=CF-CONTRAT-CI&status=DRAFT&page=1&limit=10',
        'GET',
        undefined,
        token,
      );
      expect(purchaseList.status).toBe(200);
      expect(parsePurchaseOrderPage(purchaseList.data).items).toContainEqual(purchase);
      expect(parsePurchaseOrder((await request(purchasePath, 'GET', undefined, token)).data)).toEqual(
        purchase,
      );
      const progress = await request(purchasePath + '/progress', 'GET', undefined, token);
      expect(progress.status).toBe(200);
      expect(parsePurchaseProgress(progress.data).lines[0]?.remaining).toBe('2.125');
      expect((await request('/purchase-orders', 'POST', purchaseInput, token)).status).toBe(409);
      const confirmed = await request(purchasePath + '/confirm', 'POST', {}, token);
      expect(confirmed.status).toBe(201);
      expect(parsePurchaseOrder(confirmed.data).status).toBe('CONFIRMED');
      expect((await request(purchasePath + '/cancel', 'POST', {}, token)).status).toBe(409);
      const cancelResponse = await request(
        '/purchase-orders',
        'POST',
        { ...purchaseInput, number: 'CF-ANNULATION-CI' },
        token,
      );
      expect(cancelResponse.status).toBe(201);
      const cancelOrder = parsePurchaseOrder(cancelResponse.data);
      const cancelled = await request('/purchase-orders/' + cancelOrder.id + '/cancel', 'POST', {}, token);
      expect(cancelled.status).toBe(201);
      expect(parsePurchaseOrder(cancelled.data).status).toBe('CANCELLED');
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
      expect(parseProforma(detail.data).total).toBe('2360');
      const source = sources.find((entry) => entry.label === 'Proformas');
      if (!source) throw new Error('Source proformas manquante.');
      const found = await request(
        source.path + '?search=PF-CI-RETRY-001&page=1&limit=5',
        'GET',
        undefined,
        token,
      );
      expect(found.status).toBe(200);
      expect(parseProformaPage(found.data).items[0]?.id).toBe(created.id);
      expect(parseSearch(found.data, source).items).toContainEqual({
        id: created.id,
        title: created.number,
        subtitle: '',
      });
      const changed = await request(
        '/proformas/' + created.id,
        'PUT',
        { ...uniqueInput, lines: uniqueInput.lines.map((line) => ({ ...line, quantity: 3 })) },
        token,
      );
      expect(changed.status).toBe(200);
      expect(parseProforma(changed.data).total).toBe('3540');
      expect((await request('/proformas/' + created.id + '/cancel', 'POST', {}, token)).status).toBe(201);
      expect((await request('/proformas/' + created.id, 'PUT', uniqueInput, token)).status).toBe(409);

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

      const destinationResponse = await request(
        '/stores',
        'POST',
        { code: 'CI-TRANSFER', name: 'Magasin réception CI' },
        token,
      );
      expect(destinationResponse.status).toBe(201);
      const destination = parseStore(destinationResponse.data);
      const stockPage = await request(
        '/inventory' + path + '/stock/search?page=1&limit=1&availability=AVAILABLE&search=PV-PROFORMA-CI',
        'GET',
        undefined,
        token,
      );
      expect(stockPage.status).toBe(200);
      expect(parseStockPage(stockPage.data, store.id).items[0]?.quantity).toBe('2.500');
      const summary = await request('/inventory' + path + '/summary', 'GET', undefined, token);
      expect(summary.status).toBe(200);
      expect(parseStockSummary(summary.data, store.id)).toEqual({
        products: 1,
        empty: 0,
        available: 1,
        reserved: 0,
      });
      expect(
        (await request('/inventory' + path + '/stock/search?availability=INVALID', 'GET', undefined, token))
          .status,
      ).toBe(400);
      const emptySearch = await request(
        '/inventory' + path + '/stock/search?availability=EMPTY',
        'GET',
        undefined,
        token,
      );
      expect(parseStockPage(emptySearch.data, store.id).total).toBe(0);
      const countStart = '/inventory/counts/stores/' + store.id;
      const simultaneous = await Promise.all([
        request(countStart, 'POST', {}, token),
        request(countStart, 'POST', {}, token),
      ]);
      expect(simultaneous.map((result) => result.status).sort()).toEqual([201, 409]);
      const firstCountId = parseId(simultaneous.find((result) => result.status === 201)?.data);
      const firstCountPath = '/inventory/counts/' + firstCountId;
      expect(
        (
          await request(
            firstCountPath + '/lines',
            'POST',
            { lines: [{ productId: product.id, counted: '2.500' }] },
            token,
          )
        ).status,
      ).toBe(201);
      for (const direction of ['IN', 'OUT'] as const) {
        expect(
          (
            await request(
              '/inventory/adjustments',
              'POST',
              { ...adjustmentInput, direction, quantity: '0.125', operationKey: crypto.randomUUID() },
              token,
            )
          ).status,
        ).toBe(201);
      }
      expect((await request(firstCountPath + '/validate', 'POST', {}, token)).status).toBe(409);
      expect((await request(firstCountPath + '/cancel', 'POST', {}, token)).status).toBe(201);

      const transferResponse = await request(
        '/inventory/transfers',
        'POST',
        {
          number: 'TR-INTEGRATION-CI',
          originId: store.id,
          destinationId: destination.id,
          lines: [{ productId: product.id, quantity: '1.000' }],
        },
        token,
      );
      expect(transferResponse.status).toBe(201);
      const transferId = parseId(transferResponse.data);
      const transferPath = '/inventory/transfers/' + transferId;
      const transferList = await request(
        '/inventory/transfers/stores/' + store.id + '/search?search=TR-INTEGRATION-CI&page=1&limit=10',
        'GET',
        undefined,
        token,
      );
      expect(transferList.status).toBe(200);
      expect(parsePage(transferList.data, parseTransfer).items[0]?.id).toBe(transferId);
      expect((await request(transferPath + '/ship', 'POST', {}, token)).status).toBe(409);
      expect((await request(transferPath + '/approve', 'POST', {}, token)).status).toBe(201);
      expect((await request(transferPath + '/ship', 'POST', {}, token)).status).toBe(201);
      const shipped = parseTransferDetail((await request(transferPath, 'GET', undefined, token)).data);
      expect(shipped.status).toBe('SHIPPED');
      const line = shipped.lines[0];
      if (!line) throw new Error('Ligne de transfert manquante.');
      const receive = {
        operationKey: crypto.randomUUID(),
        finalize: false,
        lines: [{ lineId: line.id, received: '0.500', damaged: '0', missing: '0' }],
      };
      expect((await request(transferPath + '/receive', 'POST', receive, token)).status).toBe(201);
      expect((await request(transferPath + '/receive', 'POST', receive, token)).status).toBe(201);
      const partial = parseTransferDetail((await request(transferPath, 'GET', undefined, token)).data);
      expect(partial.lines[0]?.received).toBe('0.5');
      expect(
        (
          await request(
            transferPath + '/receive',
            'POST',
            {
              operationKey: crypto.randomUUID(),
              finalize: true,
              lines: [{ lineId: line.id, received: '0', damaged: '0.250', missing: '0.250' }],
            },
            token,
          )
        ).status,
      ).toBe(201);
      const closed = parseTransferDetail((await request(transferPath, 'GET', undefined, token)).data);
      expect(closed.status).toBe('CLOSED_WITH_DISCREPANCY');
      const destinationStock = parseStock(
        (await request('/inventory/stores/' + destination.id + '/stock', 'GET', undefined, token)).data,
        destination.id,
      );
      expect(destinationStock[0]?.quantity).toBe('0.500');
      const openedCount = await request('/inventory/counts/stores/' + store.id, 'POST', {}, token);
      expect(openedCount.status).toBe(201);
      const countId = parseId(openedCount.data);
      const countPath = '/inventory/counts/' + countId;
      const countList = await request(
        '/inventory/counts/stores/' + store.id + '/search?page=1&limit=10',
        'GET',
        undefined,
        token,
      );
      expect(countList.status).toBe(200);
      expect(parsePage(countList.data, parseCount).items[0]?.id).toBe(countId);
      expect((await request(countPath + '/validate', 'POST', {}, token)).status).toBe(409);
      expect(
        (
          await request(
            countPath + '/lines',
            'POST',
            { lines: [{ productId: product.id, counted: '2.500', reason: 'Recomptage CI' }] },
            token,
          )
        ).status,
      ).toBe(201);
      expect((await request(countPath + '/validate', 'POST', {}, token)).status).toBe(201);
      expect(parseCountDetail((await request(countPath, 'GET', undefined, token)).data).status).toBe(
        'VALIDATED',
      );
      expect(
        parseBalance(
          (await request('/inventory' + path + '/products/' + product.id, 'GET', undefined, token)).data,
          store.id,
          product.id,
        ).quantity,
      ).toBe('2.500');

      const keeperAccount = await request(
        '/users',
        'POST',
        {
          email: 'stock-scope-ci@example.test',
          fullName: 'Magasinier stocks CI',
          password,
          roleCodes: ['MAGASINIER'],
          storeIds: [store.id],
        },
        token,
      );
      expect(keeperAccount.status).toBe(201);
      const scopedKeeper = parseAuthResult(
        (await request('/auth/login', 'POST', { email: 'stock-scope-ci@example.test', password })).data,
      );
      try {
        const sourcePage = '/inventory/stores/' + store.id;
        const otherPage = '/inventory/stores/' + destination.id;
        for (const endpoint of [
          '/stock/search',
          '/summary',
          '/movements/search',
          '/products/' + product.id,
        ]) {
          expect(
            (await request(sourcePage + endpoint, 'GET', undefined, scopedKeeper.jetonAcces)).status,
          ).toBe(200);
          expect(
            (await request(otherPage + endpoint, 'GET', undefined, scopedKeeper.jetonAcces)).status,
          ).toBe(403);
        }
        expect((await request(transferPath, 'GET', undefined, scopedKeeper.jetonAcces)).status).toBe(200);
        expect(
          (
            await request(
              '/inventory/transfers/stores/' + destination.id + '/search',
              'GET',
              undefined,
              scopedKeeper.jetonAcces,
            )
          ).status,
        ).toBe(403);
        expect(
          (
            await request(
              '/inventory/counts/stores/' + destination.id + '/search',
              'GET',
              undefined,
              scopedKeeper.jetonAcces,
            )
          ).status,
        ).toBe(403);
        expect(
          (await request('/inventory/counts/stores/' + destination.id, 'POST', {}, scopedKeeper.jetonAcces))
            .status,
        ).toBe(403);
        expect(
          (
            await request(
              transferPath + '/receive',
              'POST',
              { ...receive, operationKey: crypto.randomUUID() },
              scopedKeeper.jetonAcces,
            )
          ).status,
        ).toBe(403);
        expect(
          (
            await request(
              '/inventory/adjustments',
              'POST',
              { ...adjustmentInput, storeId: destination.id, operationKey: crypto.randomUUID() },
              scopedKeeper.jetonAcces,
            )
          ).status,
        ).toBe(403);
      } finally {
        await request('/auth/logout', 'POST', { refreshToken: scopedKeeper.jetonRenouvellement });
      }

      const outstanding = await request(
        '/purchase-orders/search?search=CF-CONTRAT-CI&outstanding=true&page=1&limit=10',
        'GET',
        undefined,
        token,
      );
      expect(outstanding.status).toBe(200);
      expect(parsePurchaseOrderPage(outstanding.data).items.map((order) => order.id)).toContain(purchase.id);
      const receiptInput = {
        number: 'BR-CONTRAT-CI',
        purchaseOrderId: purchase.id,
        storeId: store.id,
        lines: [{ productId: catalogueProduct.id, quantity: 1, unitCost: 1250.25 }],
      };
      const firstReceipt = await request('/goods-receipts', 'POST', receiptInput, token);
      expect(firstReceipt.status).toBe(201);
      const receipt = parseGoodsReceipt(firstReceipt.data);
      expect(receipt.status).toBe('DRAFT');
      const receiptPath = '/goods-receipts/' + receipt.id;
      const receiptList = await request(
        '/goods-receipts/search?search=BR-CONTRAT-CI&page=1&limit=10',
        'GET',
        undefined,
        token,
      );
      expect(receiptList.status).toBe(200);
      expect(parseReceiptPage(receiptList.data).items).toContainEqual(receipt);
      expect(parseGoodsReceipt((await request(receiptPath, 'GET', undefined, token)).data)).toEqual(receipt);
      const receiptConfirmation = await request(receiptPath + '/confirm', 'POST', {}, token);
      expect(receiptConfirmation.status).toBe(201);
      expect(parseGoodsReceipt(receiptConfirmation.data).status).toBe('CONFIRMED');
      expect((await request(receiptPath + '/confirm', 'POST', {}, token)).status).toBe(409);
      const partialPurchase = parsePurchaseProgress(
        (await request(purchasePath + '/progress', 'GET', undefined, token)).data,
      );
      expect(partialPurchase.status).toBe('PARTIALLY_DELIVERED');
      expect(partialPurchase.lines[0]?.remaining).toBe('1.125');
      const excess = await request(
        '/goods-receipts',
        'POST',
        { ...receiptInput, number: 'BR-EXCES-CI', lines: [{ ...receiptInput.lines[0], quantity: 2 }] },
        token,
      );
      expect(excess.status).toBe(201);
      const excessPath = '/goods-receipts/' + parseGoodsReceipt(excess.data).id;
      expect((await request(excessPath + '/confirm', 'POST', {}, token)).status).toBe(409);
      expect(parseGoodsReceipt((await request(excessPath + '/cancel', 'POST', {}, token)).data).status).toBe(
        'CANCELLED',
      );
      const lastReceipt = await request(
        '/goods-receipts',
        'POST',
        { ...receiptInput, number: 'BR-SOLDE-CI', lines: [{ ...receiptInput.lines[0], quantity: 1.125 }] },
        token,
      );
      expect(lastReceipt.status).toBe(201);
      expect(
        (
          await request(
            '/goods-receipts/' + parseGoodsReceipt(lastReceipt.data).id + '/confirm',
            'POST',
            {},
            token,
          )
        ).status,
      ).toBe(201);
      const delivered = parsePurchaseProgress(
        (await request(purchasePath + '/progress', 'GET', undefined, token)).data,
      );
      expect(delivered.status).toBe('DELIVERED');
      expect(delivered.lines[0]?.remaining).toBe('0');
      const receivedBalance = await request(
        '/inventory' + path + '/products/' + catalogueProduct.id,
        'GET',
        undefined,
        token,
      );
      expect(receivedBalance.status).toBe(200);
      expect(parseBalance(receivedBalance.data, store.id, catalogueProduct.id).quantity).toBe('4.625');
      const closedOutstanding = await request(
        '/purchase-orders/search?search=CF-CONTRAT-CI&outstanding=true&page=1&limit=10',
        'GET',
        undefined,
        token,
      );
      expect(closedOutstanding.status).toBe(200);
      expect(parsePurchaseOrderPage(closedOutstanding.data).items).toEqual([]);

      const returnOptions = await request(
        '/supplier-returns/receipts/' + receipt.id + '/options',
        'GET',
        undefined,
        token,
      );
      expect(returnOptions.status).toBe(200);
      expect(parseReturnOptions(returnOptions.data).lines[0]?.maximum).toBe('1');
      const returnCommand = {
        receiptId: receipt.id,
        operationKey: crypto.randomUUID(),
        reason: 'Retour brouillon CI',
        lines: [{ receiptLineId: receipt.lines[0]?.id, quantity: '0.125' }],
      };
      const returnDraft = await request('/supplier-returns', 'POST', returnCommand, token);
      const replayReturn = await request('/supplier-returns', 'POST', returnCommand, token);
      expect(replayReturn.status).toBe(201);
      expect(parseId(replayReturn.data)).toBe(parseId(returnDraft.data));
      expect(
        (await request('/supplier-returns', 'POST', { ...returnCommand, reason: 'Autre motif' }, token))
          .status,
      ).toBe(409);
      expect(returnDraft.status).toBe(201);
      const returnId = parseId(returnDraft.data);
      const returnPage = await request(
        '/supplier-returns/search?search=BR-CONTRAT-CI&status=DRAFT&page=1&limit=10',
        'GET',
        undefined,
        token,
      );
      expect(returnPage.status).toBe(200);
      expect(parseSupplierReturnPage(returnPage.data).items[0]?.id).toBe(returnId);
      const returnDetail = await request('/supplier-returns/' + returnId, 'GET', undefined, token);
      expect(returnDetail.status).toBe(200);
      expect(parseSupplierReturn(returnDetail.data).total).toBe('156.28');
      expect(
        (
          await request(
            '/supplier-returns/' + returnId + '/cancel',
            'POST',
            { reason: 'Annulation CI' },
            token,
          )
        ).status,
      ).toBe(201);

      const confirmedReturn = await request(
        '/supplier-returns',
        'POST',
        {
          receiptId: receipt.id,
          operationKey: crypto.randomUUID(),
          reason: 'Retour confirmé CI',
          lines: [{ receiptLineId: receipt.lines[0]?.id, quantity: '0.125' }],
        },
        token,
      );
      expect(confirmedReturn.status).toBe(201);
      const confirmedReturnPath = '/supplier-returns/' + parseId(confirmedReturn.data);
      for (let attempt = 0; attempt < 2; attempt++) {
        const confirmation = await request(confirmedReturnPath + '/confirm', 'POST', {}, token);
        expect(confirmation.status).toBe(201);
        expect(parseSupplierReturn(confirmation.data).status).toBe('CONFIRMED');
        const credit = await request(confirmedReturnPath + '/credit', 'POST', { reference: 'AV-CI' }, token);
        expect(credit.status).toBe(201);
      }
      const credited = await request(confirmedReturnPath, 'GET', undefined, token);
      expect(credited.status).toBe(200);
      expect(parseSupplierReturn(credited.data).credit).toEqual({ reference: 'AV-CI', amount: '156.28' });
      const afterReturn = await request(
        '/inventory' + path + '/products/' + catalogueProduct.id,
        'GET',
        undefined,
        token,
      );
      expect(afterReturn.status).toBe(200);
      expect(parseBalance(afterReturn.data, store.id, catalogueProduct.id).quantity).toBe('4.500');

      const second = await request('/proformas', 'POST', input, token);
      expect(second.status).toBe(201);
      const draft = parseCreatedProforma(second.data);
      const issued = await request('/proformas/' + draft.id + '/issue', 'POST', {}, token);
      expect(issued.status).toBe(201);
      expect(parseProforma(issued.data).status).toBe('ISSUED');
      expect((await request('/proformas/' + draft.id + '/issue', 'POST', {}, token)).status).toBe(409);
      const accepted = await request('/proformas/' + draft.id + '/accept', 'POST', {}, token);
      expect(accepted.status).toBe(201);
      expect(parseProforma(accepted.data).status).toBe('ACCEPTED');
      expect((await request('/proformas/' + draft.id + '/cancel', 'POST', {}, token)).status).toBe(409);
      const converted = await request('/sales-orders/from-proforma/' + draft.id, 'POST', {}, token);
      expect(converted.status).toBe(201);
      const linked = await request(
        '/sales-orders/search?proformaId=' + draft.id + '&page=1&limit=2',
        'GET',
        undefined,
        token,
      );
      expect(linked.status).toBe(200);
      expect(parseLinkedOrder(linked.data, parseProforma(accepted.data))?.id).toBe(parseId(converted.data));
      expect((await request('/sales-orders/from-proforma/' + draft.id, 'POST', {}, token)).status).toBe(409);
      const salesOrderPath = '/sales-orders/' + parseId(converted.data);
      const stockPath = '/inventory' + path + '/products/' + product.id;
      const stockBefore = parseBalance(
        (await request(stockPath, 'GET', undefined, token)).data,
        store.id,
        product.id,
      );
      const milli = (amount: string) => {
        const [whole = '0', fraction = ''] = amount.split('.');
        return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
      };
      expect((await request(salesOrderPath + '/confirm', 'POST', {})).status).toBe(401);
      expect((await request(salesOrderPath + '/confirm', 'POST', {}, token)).status).toBe(201);
      const stockReserved = parseBalance(
        (await request(stockPath, 'GET', undefined, token)).data,
        store.id,
        product.id,
      );
      expect(stockReserved.quantity).toBe(stockBefore.quantity);
      expect(milli(stockReserved.reserved)).toBe(milli(stockBefore.reserved) + 2000n);
      expect(milli(stockReserved.available)).toBe(milli(stockBefore.available) - 2000n);
      expect((await request(salesOrderPath + '/confirm', 'POST', {}, token)).status).toBe(409);
      expect(
        parseBalance((await request(stockPath, 'GET', undefined, token)).data, store.id, product.id),
      ).toEqual(stockReserved);
      expect((await request(salesOrderPath + '/cancel', 'POST', {}, token)).status).toBe(201);
      expect((await request(salesOrderPath + '/cancel', 'POST', {}, token)).status).toBe(409);
      expect(
        parseBalance((await request(stockPath, 'GET', undefined, token)).data, store.id, product.id),
      ).toEqual(stockBefore);
      const excessive = await request(
        '/proformas',
        'POST',
        { ...input, lines: input.lines.map((line) => ({ ...line, quantity: 1000000 })) },
        token,
      );
      expect(excessive.status).toBe(201);
      const excessivePath = '/proformas/' + parseId(excessive.data);
      expect((await request(excessivePath + '/issue', 'POST', {}, token)).status).toBe(201);
      expect((await request(excessivePath + '/accept', 'POST', {}, token)).status).toBe(201);
      const excessiveOrder = await request(
        '/sales-orders/from-proforma/' + parseId(excessive.data),
        'POST',
        {},
        token,
      );
      expect(excessiveOrder.status).toBe(201);
      const excessiveOrderPath = '/sales-orders/' + parseId(excessiveOrder.data);
      expect((await request(excessiveOrderPath + '/confirm', 'POST', {}, token)).status).toBe(409);
      expect(
        parseBalance((await request(stockPath, 'GET', undefined, token)).data, store.id, product.id),
      ).toEqual(stockBefore);
      expect((await request(excessiveOrderPath + '/cancel', 'POST', {}, token)).status).toBe(201);

      const deliveryQuote = await request('/proformas', 'POST', input, token);
      expect(deliveryQuote.status).toBe(201);
      const quoteId = parseId(deliveryQuote.data);
      expect((await request('/proformas/' + quoteId + '/issue', 'POST', {}, token)).status).toBe(201);
      expect((await request('/proformas/' + quoteId + '/accept', 'POST', {}, token)).status).toBe(201);
      const deliveryOrder = await request('/sales-orders/from-proforma/' + quoteId, 'POST', {}, token);
      expect(deliveryOrder.status).toBe(201);
      const deliveryOrderId = parseId(deliveryOrder.data);
      const deliveryPath = '/sales-orders/' + deliveryOrderId;
      const notesPath = deliveryPath + '/deliveries';
      expect((await request(deliveryPath + '/confirm', 'POST', {}, token)).status).toBe(201);
      expect((await request(notesPath + '/progress', 'GET')).status).toBe(401);
      const initialProgress = await request(notesPath + '/progress', 'GET', undefined, token);
      expect(initialProgress.status).toBe(200);
      expect(parseDeliveryProgress(initialProgress.data, deliveryOrderId).lines[0]?.remaining).toBe('2.000');
      const command = {
        operationKey: crypto.randomUUID(),
        lines: [{ storeId: store.id, productId: product.id, quantity: '0.125' }],
      };
      const firstNote = await request(notesPath, 'POST', command, token);
      expect(firstNote.status).toBe(201);
      const note = parseDelivery(firstNote.data, deliveryOrderId);
      const deliveryReplay = await request(notesPath, 'POST', command, token);
      expect(deliveryReplay.status).toBe(201);
      expect(parseDelivery(deliveryReplay.data, deliveryOrderId).id).toBe(note.id);
      expect(
        (
          await request(
            notesPath,
            'POST',
            { ...command, lines: [{ storeId: store.id, productId: product.id, quantity: '0.126' }] },
            token,
          )
        ).status,
      ).toBe(409);
      const beforeDelivery = parseBalance(
        (await request(stockPath, 'GET', undefined, token)).data,
        store.id,
        product.id,
      );
      expect(milli(beforeDelivery.quantity)).toBe(milli(stockBefore.quantity));
      expect(milli(beforeDelivery.reserved)).toBe(milli(stockBefore.reserved) + 2000n);
      expect((await request(notesPath + '/' + note.id + '/confirm', 'POST', {}, token)).status).toBe(201);
      expect((await request(notesPath + '/' + note.id + '/confirm', 'POST', {}, token)).status).toBe(409);
      const partialProgress = parseDeliveryProgress(
        (await request(notesPath + '/progress', 'GET', undefined, token)).data,
        deliveryOrderId,
      );
      expect(partialProgress.status).toBe('PARTIALLY_DELIVERED');
      expect(partialProgress.lines[0]?.remaining).toBe('1.875');
      const partialStock = parseBalance(
        (await request(stockPath, 'GET', undefined, token)).data,
        store.id,
        product.id,
      );
      expect(milli(partialStock.quantity)).toBe(milli(beforeDelivery.quantity) - 125n);
      expect(milli(partialStock.reserved)).toBe(milli(beforeDelivery.reserved) - 125n);
      expect(
        (
          await request(
            notesPath,
            'POST',
            { lines: [{ storeId: store.id, productId: product.id, quantity: '1.876' }] },
            token,
          )
        ).status,
      ).toBe(409);
      const finalNote = await request(
        notesPath,
        'POST',
        {
          operationKey: crypto.randomUUID(),
          lines: [{ storeId: store.id, productId: product.id, quantity: '1.875' }],
        },
        token,
      );
      expect(finalNote.status).toBe(201);
      expect(
        (await request(notesPath + '/' + parseId(finalNote.data) + '/confirm', 'POST', {}, token)).status,
      ).toBe(201);
      const completed = parseDeliveryProgress(
        (await request(notesPath + '/progress', 'GET', undefined, token)).data,
        deliveryOrderId,
      );
      expect(completed.status).toBe('DELIVERED');
      expect(completed.lines[0]?.remaining).toBe('0.000');
      const afterDelivery = parseBalance(
        (await request(stockPath, 'GET', undefined, token)).data,
        store.id,
        product.id,
      );
      expect(milli(afterDelivery.quantity)).toBe(milli(stockBefore.quantity) - 2000n);
      expect(afterDelivery.reserved).toBe(stockBefore.reserved);
      const notes = await request(
        '/deliveries/search?orderId=' + deliveryOrderId + '&page=1&limit=10',
        'GET',
        undefined,
        token,
      );
      expect(notes.status).toBe(200);
      expect(parseDeliveryPage(notes.data, deliveryOrderId).total).toBe(2);
      const pdfPath = apiPath(notesPath + '/' + note.id + '/pdf');
      const pdf = await fetch(base + pdfPath, {
        headers: { Authorization: 'Bearer ' + token },
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      });
      expect(pdf.status).toBe(200);
      expect(pdf.headers.get('content-type')).toContain('application/pdf');
      expect(pdf.headers.get('cache-control')).toContain('no-store');
      expect(new TextDecoder().decode((await pdf.arrayBuffer()).slice(0, 8))).toBe('%PDF-1.4');
      expect((await fetch(base + pdfPath)).status).toBe(401);
      const wrongOrder = await fetch(base + apiPath(salesOrderPath + '/deliveries/' + note.id + '/pdf'), {
        headers: { Authorization: 'Bearer ' + token },
      });
      expect(wrongOrder.status).toBe(404);
      const invoiceResponse = await request('/invoices/from-order/' + deliveryOrderId, 'POST', {}, token);
      expect(invoiceResponse.status).toBe(201);
      const orderDetail = await request(deliveryPath, 'GET', undefined, token);
      expect(orderDetail.status).toBe(200);
      const invoice = verifyInvoiceOrder(
        parseInvoice(invoiceResponse.data),
        parseOrderDetail(orderDetail.data, deliveryOrderId),
      );
      expect(invoice.totalTtc).toBe('2360');
      expect((await request('/invoices/from-order/' + deliveryOrderId, 'POST', {}, token)).status).toBe(409);
      const issuedInvoice = await request('/invoices/' + invoice.id + '/issue', 'POST', {}, token);
      expect(issuedInvoice.status).toBe(201);
      expect(parseInvoice(issuedInvoice.data).status).toBe('ISSUED');
      expect((await request('/invoices/' + invoice.id + '/cancel', 'POST', {}, token)).status).toBe(409);
      const invoiceList = await request(
        '/invoices/search?orderId=' + deliveryOrderId + '&page=1&limit=10',
        'GET',
        undefined,
        token,
      );
      expect(invoiceList.status).toBe(200);
      expect(parseInvoicePage(invoiceList.data).items.map((item) => item.id)).toEqual([invoice.id]);
      const paymentPath = deliveryPath + '/payments';
      const initialPaymentSummary = parsePaymentSummary(
        (await request(paymentPath + '/summary', 'GET', undefined, token)).data,
        deliveryOrderId,
      );
      expect(initialPaymentSummary.remaining).toBe('2360.00');
      const firstPaymentInput = {
        amount: '1000.25',
        method: 'CASH' as const,
        idempotencyKey: crypto.randomUUID(),
      };
      const firstPayment = await request(paymentPath, 'POST', firstPaymentInput, token);
      expect(firstPayment.status).toBe(201);
      const firstPaymentId = verifyRecordedPayment(firstPayment.data, deliveryOrderId, firstPaymentInput);
      const firstReplay = await request(paymentPath, 'POST', firstPaymentInput, token);
      expect(firstReplay.status).toBe(201);
      expect(verifyRecordedPayment(firstReplay.data, deliveryOrderId, firstPaymentInput)).toBe(
        firstPaymentId,
      );
      const partialPaymentSummary = parsePaymentSummary(
        (await request(paymentPath + '/summary', 'GET', undefined, token)).data,
        deliveryOrderId,
      );
      expect(partialPaymentSummary.remaining).toBe('1359.75');
      expect(partialPaymentSummary.nextPaymentMustSettle).toBe(true);
      const secondPaymentInput = {
        amount: '1359.75',
        method: 'MOBILE_MONEY' as const,
        idempotencyKey: crypto.randomUUID(),
        externalReference: 'CI-REGLEMENT-2',
      };
      expect(
        (await request(paymentPath, 'POST', { ...secondPaymentInput, amount: '1359.74' }, token)).status,
      ).toBe(409);
      const secondPayment = await request(paymentPath, 'POST', secondPaymentInput, token);
      expect(secondPayment.status).toBe(201);
      const secondPaymentId = verifyRecordedPayment(secondPayment.data, deliveryOrderId, secondPaymentInput);
      const paid = parsePaymentSummary(
        (await request(paymentPath + '/summary', 'GET', undefined, token)).data,
        deliveryOrderId,
      );
      expect(paid.remaining).toBe('0.00');
      expect(paid.activeInstallments).toBe(2);
      expect(paid.canRecord).toBe(false);
      expect(
        (
          await request(
            paymentPath,
            'POST',
            { ...firstPaymentInput, idempotencyKey: crypto.randomUUID() },
            token,
          )
        ).status,
      ).toBe(409);
      const allocationPath = paymentPath + '/' + secondPaymentId + '/allocations';
      const beforeAllocation = await request(paymentPath + '/allocations', 'GET', undefined, token);
      expect(beforeAllocation.status).toBe(200);
      expect(parseAllocations(beforeAllocation.data, deliveryOrderId).invoices[0]?.remaining).toBe('2360.00');
      expect(
        (await request(allocationPath, 'POST', { invoiceId: invoice.id, amount: '1359.76' }, token)).status,
      ).toBe(409);
      const allocated = await request(
        allocationPath,
        'POST',
        { invoiceId: invoice.id, amount: '1359.75' },
        token,
      );
      expect(allocated.status).toBe(201);
      const allocatedSnapshot = parseAllocations(
        (await request(paymentPath + '/allocations', 'GET', undefined, token)).data,
        deliveryOrderId,
      );
      expect(allocatedSnapshot.invoices[0]?.remaining).toBe('1000.25');
      expect(allocatedSnapshot.payments.find((item) => item.id === secondPaymentId)?.available).toBe('0.00');
      const reason = { reason: 'Contrepassation de contrôle CI' };
      expect(
        (await request(paymentPath + '/' + secondPaymentId + '/reverse', 'POST', reason, token)).status,
      ).toBe(409);
      expect(
        (await request(allocationPath + '/' + parseId(allocated.data) + '/cancel', 'POST', reason, token))
          .status,
      ).toBe(201);
      expect(
        parseAllocations(
          (await request(paymentPath + '/allocations', 'GET', undefined, token)).data,
          deliveryOrderId,
        ).invoices[0]?.remaining,
      ).toBe('2360.00');
      expect(
        (await request(paymentPath + '/' + firstPaymentId + '/reverse', 'POST', reason, token)).status,
      ).toBe(409);
      expect(
        (await request(paymentPath + '/' + secondPaymentId + '/reverse', 'POST', reason, token)).status,
      ).toBe(201);
      expect(
        (await request(paymentPath + '/' + secondPaymentId + '/reverse', 'POST', reason, token)).status,
      ).toBe(409);
      const reversed = parsePaymentSummary(
        (await request(paymentPath + '/summary', 'GET', undefined, token)).data,
        deliveryOrderId,
      );
      expect(reversed.remaining).toBe('1359.75');
      expect(reversed.activeInstallments).toBe(1);
      expect(reversed.payments.find((item) => item.id === secondPaymentId)?.status).toBe('REVERSED');
      expect(
        (await request(paymentPath + '/' + firstPaymentId + '/reverse', 'POST', reason, token)).status,
      ).toBe(201);
      expect(
        parsePaymentSummary(
          (await request(paymentPath + '/summary', 'GET', undefined, token)).data,
          deliveryOrderId,
        ).remaining,
      ).toBe('2360.00');
      const creditLine = invoice.lines[0];
      if (!creditLine) throw new Error('Ligne de facture absente.');
      const creditLines = [{ invoiceLineId: creditLine.id, netAmount: '50.00' }];
      const creditPath = '/invoices/' + invoice.id + '/credit-notes';
      const creditPreview = await request(creditPath + '/preview', 'POST', { lines: creditLines }, token);
      expect(creditPreview.status).toBe(201);
      const calculatedCredit = parseCreditPreview(creditPreview.data, invoice.id, creditLines);
      expect(calculatedCredit.amount).toBe('59.00');
      const creditCommand = {
        operationKey: crypto.randomUUID(),
        amount: calculatedCredit.amount,
        reason: 'Correction de prix CI',
        lines: creditLines,
      };
      const creditIssued = await request(creditPath, 'POST', creditCommand, token);
      expect(creditIssued.status).toBe(201);
      const creditNote = verifyIssuedCredit(creditIssued.data, invoice.id, creditCommand);
      const creditReplay = await request(creditPath, 'POST', creditCommand, token);
      expect(creditReplay.status).toBe(201);
      expect(verifyIssuedCredit(creditReplay.data, invoice.id, creditCommand).id).toBe(creditNote.id);
      expect(
        (await request(creditPath, 'POST', { ...creditCommand, reason: 'Autre correction de prix' }, token))
          .status,
      ).toBe(409);
      expect(
        parsePaymentSummary(
          (await request(paymentPath + '/summary', 'GET', undefined, token)).data,
          deliveryOrderId,
        ).remaining,
      ).toBe('2301.00');
      expect(
        (await request('/customers/search?proformaId=' + draft.id, 'GET', undefined, token)).status,
      ).toBe(400);
      const expenseCategoryResponse = await request(
        '/expenses/categories',
        'POST',
        { name: 'Transport contrat CI' },
        token,
      );
      expect(expenseCategoryResponse.status).toBe(201);
      const expenseCategory = parseExpenseCategory(expenseCategoryResponse.data);
      const expenseRegisterResponse = await request(
        '/treasury/registers',
        'POST',
        { storeId: store.id, name: 'Caisse contrat dépenses CI' },
        token,
      );
      expect(expenseRegisterResponse.status).toBe(201);
      const expenseOpenResponse = await request(
        '/treasury/registers/' + parseId(expenseRegisterResponse.data) + '/open',
        'POST',
        { amount: '100.00' },
        token,
      );
      expect(expenseOpenResponse.status).toBe(201);
      const expenseSessionId = parseId(expenseOpenResponse.data);
      const expenseSessions = await request('/treasury/registers', 'GET', undefined, token);
      expect(expenseSessions.status).toBe(200);
      expect(parseOpenCashSessions(expenseSessions.data)).toContainEqual({
        id: expenseSessionId,
        storeId: store.id,
        name: 'Caisse contrat dépenses CI',
      });
      const expenseInput = {
        storeId: store.id,
        categoryId: expenseCategory.id,
        description: 'Transport contrat CI',
        amount: '70.25',
        operationKey: crypto.randomUUID(),
      };
      const expenseCreated = await request('/expenses', 'POST', expenseInput, token);
      expect(expenseCreated.status).toBe(201);
      const expense = verifyCreatedExpense(expenseCreated.data, expenseInput);
      expect(
        verifyCreatedExpense((await request('/expenses', 'POST', expenseInput, token)).data, expenseInput).id,
      ).toBe(expense.id);
      const expensePath = '/expenses/' + expense.id;
      expect(
        (await request(expensePath + '/pay', 'POST', { method: 'CASH', sessionId: expenseSessionId }, token))
          .status,
      ).toBe(409);
      const expenseApproved = await request(expensePath + '/approve', 'POST', {}, token);
      expect(expenseApproved.status).toBe(201);
      const approvedExpense = verifyExpenseAction(expenseApproved.data, expense, 'approve');
      const expensePaid = await request(
        expensePath + '/pay',
        'POST',
        { method: 'CASH', sessionId: expenseSessionId },
        token,
      );
      expect(expensePaid.status).toBe(201);
      const paidExpense = verifyExpenseAction(expensePaid.data, approvedExpense, 'pay');
      expect(
        (await request(expensePath + '/pay', 'POST', { method: 'CASH', sessionId: expenseSessionId }, token))
          .status,
      ).toBe(409);
      const expenseRefunded = await request(
        expensePath + '/refund',
        'POST',
        { reason: 'Remboursement contrat CI' },
        token,
      );
      expect(expenseRefunded.status).toBe(201);
      expect(verifyExpenseAction(expenseRefunded.data, paidExpense, 'refund').status).toBe('REFUNDED');
      const expenseSearch = await request(
        '/expenses/search?status=REFUNDED&search=Transport%20contrat%20CI&page=1&limit=1',
        'GET',
        undefined,
        token,
      );
      expect(expenseSearch.status).toBe(200);
      expect(parseExpensePage(expenseSearch.data).items.map((item) => item.id)).toContain(expense.id);
      const expenseSummary = await request('/expenses/summary?storeId=' + store.id, 'GET', undefined, token);
      expect(expenseSummary.status).toBe(200);
      expect(parseExpenseSummary(expenseSummary.data)).toContainEqual({
        status: 'REFUNDED',
        categoryId: expenseCategory.id,
        count: 1,
        amount: '70.25',
      });
      expect((await request('/expenses/search')).status).toBe(401);
      expect((await request('/expenses/search?limit=101', 'GET', undefined, token)).status).toBe(400);
      const sourcePath = '/treasury/sessions/' + expenseSessionId;
      const initialCash = await request(sourcePath + '/summary', 'GET', undefined, token);
      expect(initialCash.status).toBe(200);
      expect(cashCents(parseSummary(initialCash.data, expenseSessionId).expected)).toBe(10000n);
      const expenseMovements = await request(
        sourcePath + '/movements?page=1&limit=1',
        'GET',
        undefined,
        token,
      );
      expect(expenseMovements.status).toBe(200);
      const cashPage = parseMovementPage(expenseMovements.data, expenseSessionId);
      expect(cashPage.total).toBe(2);
      expect(cashPage.items[0]?.reversible).toBe(false);
      const registerSessions = await request(
        '/treasury/registers/' + parseId(expenseRegisterResponse.data) + '/sessions?page=1&limit=1',
        'GET',
        undefined,
        token,
      );
      expect(registerSessions.status).toBe(200);
      expect(
        parseSessionPage(registerSessions.data, parseId(expenseRegisterResponse.data)).items[0]?.id,
      ).toBe(expenseSessionId);
      const targetRegister = await request(
        '/treasury/registers',
        'POST',
        { storeId: store.id, name: 'Caisse transfert CI' },
        token,
      );
      expect(targetRegister.status).toBe(201);
      const targetOpen = await request(
        '/treasury/registers/' + parseId(targetRegister.data) + '/open',
        'POST',
        { amount: '0' },
        token,
      );
      expect(targetOpen.status).toBe(201);
      const targetId = parseId(targetOpen.data);
      const transferInput = { destinationId: targetId, amount: '40.25', operationKey: crypto.randomUUID() };
      const transferCommand = { ...transferInput, kind: 'transfer' as const, sessionId: expenseSessionId };
      const transferred = await request(sourcePath + '/transfer', 'POST', transferInput, token);
      expect(transferred.status).toBe(201);
      const debit = verifyCashCommand(transferred.data, transferCommand);
      const transferReplay = await request(sourcePath + '/transfer', 'POST', transferInput, token);
      expect(transferReplay.status).toBe(201);
      expect(verifyCashCommand(transferReplay.data, transferCommand).id).toBe(debit.id);
      expect(
        cashCents(
          parseSummary(
            (await request(sourcePath + '/summary', 'GET', undefined, token)).data,
            expenseSessionId,
          ).expected,
        ),
      ).toBe(5975n);
      const targetPath = '/treasury/sessions/' + targetId;
      expect(
        cashCents(
          parseSummary((await request(targetPath + '/summary', 'GET', undefined, token)).data, targetId)
            .expected,
        ),
      ).toBe(4025n);
      const manualInput = {
        amount: '10.50',
        reason: 'Entrée manuelle CI',
        operationKey: crypto.randomUUID(),
      };
      const manual = await request(targetPath + '/movements', 'POST', manualInput, token);
      expect(manual.status).toBe(201);
      const movement = verifyCashCommand(manual.data, { ...manualInput, kind: 'move', sessionId: targetId });
      const reversalInput = { reason: 'Correction manuelle CI', operationKey: crypto.randomUUID() };
      const reversal = await request(
        '/treasury/movements/' + movement.id + '/reverse',
        'POST',
        reversalInput,
        token,
      );
      expect(reversal.status).toBe(201);
      verifyCashCommand(reversal.data, {
        ...reversalInput,
        kind: 'reverse',
        sessionId: targetId,
        movementId: movement.id,
        amount: '-10.50',
      });
      const candidates = await request(
        sourcePath + '/reconciliation-candidates?page=1&limit=10',
        'GET',
        undefined,
        token,
      );
      expect(candidates.status).toBe(200);
      expect(parseCandidates(candidates.data).items.some((item) => item.id === firstPaymentId)).toBe(false);
      const closedCashSession = await request(targetPath + '/close', 'POST', { amount: '40.00' }, token);
      expect(closedCashSession.status).toBe(201);
      const closedSummary = parseSummary(
        (await request(targetPath + '/summary', 'GET', undefined, token)).data,
        targetId,
      );
      expect(closedSummary.closedAt).not.toBeNull();
      expect(cashCents(closedSummary.difference ?? '0')).toBe(-25n);
      expect(
        (
          await request(
            targetPath + '/movements',
            'POST',
            { ...manualInput, operationKey: crypto.randomUUID() },
            token,
          )
        ).status,
      ).toBe(409);
      expect((await request(sourcePath + '/movements')).status).toBe(401);
      const orders = await request('/sales-orders/search?page=1&limit=5', 'GET', undefined, token);
      expect(orders.status).toBe(200);
      expect(parseRecentOrders(orders.data)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ total: '2\u202f360,00 FCFA', paymentStatus: 'Impayée' }),
        ]),
      );
      // Le rapprochement repose sur un règlement métier réel, jamais sur une écriture saisie à la main.
      const bankPaymentInput = {
        amount: '100.25',
        method: 'BANK_TRANSFER' as const,
        idempotencyKey: crypto.randomUUID(),
        externalReference: 'CI-1',
      };
      const bankPayment = await request(paymentPath, 'POST', bankPaymentInput, token);
      expect(bankPayment.status).toBe(201);
      const bankPaymentId = verifyRecordedPayment(bankPayment.data, deliveryOrderId, bankPaymentInput);
      const bankPaymentSummary = parsePaymentSummary(
        (await request(paymentPath + '/summary', 'GET', undefined, token)).data,
        deliveryOrderId,
      );
      const bankPaymentRow = bankPaymentSummary.payments.find((item) => item.id === bankPaymentId);
      if (!bankPaymentRow) throw new Error('Règlement bancaire manquant.');
      const bankDay = new Date(bankPaymentRow.receivedAt).toISOString().slice(0, 10);
      const bankAsset = await request(
        '/accounting/accounts',
        'POST',
        { code: '52-CI-BANK', name: 'Banque contrat CI' },
        token,
      );
      expect(bankAsset.status).toBe(201);
      const bankAssetId = parseId(bankAsset.data);
      expect(
        (
          await request(
            '/accounting/accounts/' + bankAssetId + '/classify',
            'POST',
            { category: 'ASSET' },
            token,
          )
        ).status,
      ).toBe(201);
      const bankRevenue = await request(
        '/accounting/accounts',
        'POST',
        { code: '41-CI-BANK', name: 'Créances contrat CI' },
        token,
      );
      expect(bankRevenue.status).toBe(201);
      const bankRevenueId = parseId(bankRevenue.data);
      expect(
        (
          await request(
            '/accounting/accounts/' + bankRevenueId + '/classify',
            'POST',
            { category: 'ASSET' },
            token,
          )
        ).status,
      ).toBe(201);
      const bankJournal = await request(
        '/accounting/journals',
        'POST',
        { code: 'BQ-CI', name: 'Journal contrat CI' },
        token,
      );
      expect(bankJournal.status).toBe(201);
      const bankPeriod = await request(
        '/accounting/periods',
        'POST',
        { name: 'Période banque CI', start: bankDay, end: bankDay },
        token,
      );
      expect(bankPeriod.status).toBe(201);
      const accountingSetup = await request('/accounting/setup', 'GET', undefined, token);
      expect(accountingSetup.status).toBe(200);
      expect(parseAssetAccounts(accountingSetup.data).some((item) => item.id === bankAssetId)).toBe(true);
      const bankCreated = await request(
        '/accounting/bank/accounts',
        'POST',
        { accountId: bankAssetId, name: 'Banque contrat CI' },
        token,
      );
      expect(bankCreated.status).toBe(201);
      const bank = parseBankAccount(bankCreated.data);
      const bankAccounts = await request('/accounting/bank/accounts', 'GET', undefined, token);
      expect(parseBankAccounts(bankAccounts.data).some((item) => item.id === bank.id)).toBe(true);
      expect((await request('/accounting/entries', 'POST', {}, token)).status).toBe(404);
      const periodId = parseId(bankPeriod.data);
      const ledgerPath = '/accounting/periods/' + periodId;
      const rule = await request(
        '/accounting/rules',
        'POST',
        {
          key: 'PAYMENT:BANK_TRANSFER',
          journalId: parseId(bankJournal.data),
          debitAccountId: bankAssetId,
          creditAccountId: bankRevenueId,
        },
        token,
      );
      expect(rule.status).toBe(201);
      const automation = await request(ledgerPath + '/automation', 'GET', undefined, token);
      expect(automation.status).toBe(200);
      expect(parseAutomation(automation.data, periodId).enabled).toBe(true);
      const pending = await request(ledgerPath + '/pending', 'GET', undefined, token);
      expect(pending.status).toBe(200);
      expect(parsePending(pending.data, periodId).items).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'PAYMENT', id: bankPaymentId })]),
      );
      // Le worker est volontairement désactivé en CI : relancer la pièce métier via son identifiant.
      const source = { type: 'PAYMENT', id: bankPaymentId };
      const bankEntry = await request('/accounting/sources', 'POST', source, token);
      expect(bankEntry.status).toBe(201);
      const replayedEntry = await request('/accounting/sources', 'POST', source, token);
      expect(replayedEntry.status).toBe(201);
      expect(parseId(replayedEntry.data)).toBe(parseId(bankEntry.data));
      const ledgerSetup = parseSetup((await request('/accounting/setup', 'GET', undefined, token)).data);
      expect(ledgerSetup.postingRules.some((item) => item.key === 'PAYMENT:BANK_TRANSFER')).toBe(true);
      const ledgerEntries = parseEntries(
        (await request(ledgerPath + '/entries', 'GET', undefined, token)).data,
        periodId,
      );
      expect(ledgerEntries.entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ sourceId: bankPaymentId, sourceType: 'PAYMENT' }),
        ]),
      );
      const balance = parseLedgerBalance(
        (await request(ledgerPath + '/trial-balance', 'GET', undefined, token)).data,
      );
      expect(balance.balanced).toBe(true);
      expect(balance.debit).toBe('100.25');
      expect(balance.credit).toBe('100.25');
      const statements = parseStatements(
        (await request(ledgerPath + '/statements', 'GET', undefined, token)).data,
        periodId,
      );
      expect(statements.provisional).toBe(true);
      const bankInput = {
        bankAccountId: bank.id,
        reference: 'REL-CONTRAT-CI',
        start: bankDay,
        end: bankDay,
        opening: '0',
        closing: '100.25',
        lines: [{ reference: 'CI-1', date: bankDay, description: 'Encaissement', amount: '100.25' }],
      };
      const bankImported = await request('/accounting/bank/statements', 'POST', bankInput, token);
      expect(bankImported.status).toBe(201);
      const bankStatement = verifyImported(bankImported.data, bankInput);
      const bankReplayed = await request('/accounting/bank/statements', 'POST', bankInput, token);
      expect(bankReplayed.status).toBe(201);
      expect(verifyImported(bankReplayed.data, bankInput).id).toBe(bankStatement.id);
      expect(
        (
          await request(
            '/accounting/bank/statements',
            'POST',
            { ...bankInput, lines: [{ ...bankInput.lines[0], description: 'Autre' }] },
            token,
          )
        ).status,
      ).toBe(409);
      const bankPage = await request(
        '/accounting/bank/accounts/' + bank.id + '/statements/search?page=1&limit=1&search=REL-CONTRAT',
        'GET',
        undefined,
        token,
      );
      expect(bankPage.status).toBe(200);
      expect(parseStatementPage(bankPage.data, bank.id).total).toBe(1);
      const bankPath = '/accounting/bank/statements/' + bankStatement.id;
      const report = parseBankReport(
        (await request(bankPath, 'GET', undefined, token)).data,
        bankStatement,
        bankAssetId,
      );
      expect(report.balanced).toBe(false);
      expect((await request(bankPath + '/close', 'POST', {}, token)).status).toBe(409);
      const bankSuggestions = parseSuggestions(
        (await request(bankPath + '/suggestions', 'GET', undefined, token)).data,
        report,
      );
      const suggestion = bankSuggestions[0];
      const candidate = suggestion?.candidates[0];
      if (!suggestion || !candidate) throw new Error('Suggestion bancaire manquante.');
      expect(suggestion.status).toBe('Unique');
      const bankLinePath = '/accounting/bank/lines/' + suggestion.id;
      expect(
        (await request(bankLinePath + '/match', 'POST', { ledgerLineId: candidate.id }, token)).status,
      ).toBe(201);
      expect(
        parseBankReport((await request(bankPath, 'GET', undefined, token)).data, bankStatement, bankAssetId)
          .balanced,
      ).toBe(true);
      expect((await request(bankLinePath + '/unmatch', 'POST', {}, token)).status).toBe(201);
      expect(
        parseBankReport((await request(bankPath, 'GET', undefined, token)).data, bankStatement, bankAssetId)
          .balanced,
      ).toBe(false);
      // Laisser un relevé équilibrable mais non clôturé pour le parcours navigateur.
      expect((await request(bankPath)).status).toBe(401);
      const currentCompany = await request('/settings/company', 'GET', undefined, token);
      expect(currentCompany.status).toBe(200);
      const previousCompany = parseCompany(currentCompany.data);
      const companyInput = {
        ...previousCompany.input,
        legalName: 'DSolar contrat CI',
        expectedRevision: previousCompany.revision,
      };
      const updatedCompany = await request('/settings/company', 'PUT', companyInput, token);
      expect(updatedCompany.status).toBe(200);
      expect(parseCompany(updatedCompany.data).revision).toBe(previousCompany.revision + 1);
      expect((await request('/settings/company', 'PUT', companyInput, token)).status).toBe(409);
      const reloadedCompany = await request('/settings/company', 'GET', undefined, token);
      expect(parseCompany(reloadedCompany.data)).toEqual(parseCompany(updatedCompany.data));

      const auditFilters = { ...blankFilters(), action: 'COMPANY_SETTINGS_UPDATED' };
      const audit = await request('/audit?action=COMPANY_SETTINGS_UPDATED&limit=30', 'GET', undefined, token);
      expect(audit.status).toBe(200);
      expect(parseAuditPage(audit.data, auditFilters, 30).items.length).toBeGreaterThan(0);
      expect(JSON.stringify(audit.data)).not.toContain('"payload"');
      const auditSummary = await request(
        '/audit/summary?action=COMPANY_SETTINGS_UPDATED',
        'GET',
        undefined,
        token,
      );
      expect(auditSummary.status).toBe(200);
      expect(parseAuditSummary(auditSummary.data).total).toBeGreaterThan(0);
      const notificationPage = await request(
        '/notifications?page=1&limit=30&read=false',
        'GET',
        undefined,
        token,
      );
      expect(notificationPage.status).toBe(200);
      expect(() => parseNotificationPage(notificationPage.data, 1, 30, 'false')).not.toThrow();
    } finally {
      await request('/auth/logout', 'POST', { refreshToken: saleAdmin.jetonRenouvellement });
    }
  }, 120000);
});
