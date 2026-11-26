import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const directory = process.env.DSOLAR_BROWSER_DIR;
const artifacts = process.env.DSOLAR_SCREENSHOTS;
assert(directory && artifacts && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD);
const require = createRequire(join(directory, 'package.json'));
const { chromium } = require('playwright');
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.setDefaultTimeout(20000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://localhost:4200/connexion');
  await page.locator('#email').fill(process.env.ADMIN_EMAIL);
  await page.locator('#password').fill(process.env.ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL('**/tableau-de-bord');
  const cookie = (await page.context().cookies()).find((item) => item.name === 'dsolar_refresh');
  assert(cookie?.httpOnly && cookie.sameSite === 'Strict');
  await page.reload();
  await page.waitForURL('**/tableau-de-bord');
  await page.locator('app-kpi-card').last().waitFor();
  await page.reload();
  await page.waitForURL('**/tableau-de-bord');
  await page.locator('app-kpi-card').last().waitFor();
  await page.locator('.revenue-chart').waitFor();
  const month = new Date().toISOString().slice(0, 7);
  assert.equal(await page.locator('input[type="month"]').inputValue(), month);
  const [year, selected] = month.split('-').map(Number);
  const dayCount = new Date(Date.UTC(year, selected, 0)).getUTCDate();
  await page.getByRole('button', { name: 'Commandes', exact: true }).click();
  await page.locator('app-period-chart button[aria-pressed="true"]').filter({ hasText: 'Commandes' }).waitFor();
  await page.getByRole('button', { name: 'Facturation', exact: true }).click();
  await page.locator('app-period-chart button[aria-pressed="true"]').filter({ hasText: 'Facturation' }).waitFor();
  await page.locator('.stock-alert-item').first().waitFor();
  await page.locator('.recent-activity-list article').first().waitFor();
  assert.equal(await page.locator('app-kpi-card').count(), 4);
  assert.equal(await page.locator('#dashboard-detail-reports').isVisible(), false);
  await page.getByRole('button', { name: 'Afficher les rapports détaillés' }).click();
  await page.locator('#dashboard-detail-reports').waitFor();
  await page.getByRole('button', { name: 'Masquer les rapports détaillés' }).click();
  await page.locator('#dashboard-detail-reports').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.dashboard-primary .revenue-column').count(), dayCount);
  assert.equal(await page.locator('.dashboard-primary > section').count(), 2);
  assert.equal(await page.locator('.dashboard-primary > app-dashboard-report').count(), 1);
  assert.equal(await page.locator('.dashboard-primary > app-period-chart').count(), 1);
  assert.equal(await page.locator('app-kpi-card').nth(2).innerText().then((s) => s.includes('Alertes de stock')), true);
  assert.equal(await page.locator('.company-logo').evaluate((img) => img.complete && img.naturalWidth > 0), true);
  for (const [name, width, height] of [
    ['desktop', 1440, 900],
    ['tablet', 1024, 768],
    ['mobile', 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.locator('.dashboard-primary').waitFor();
    await page.screenshot({ path: join(artifacts, name + '.png'), fullPage: true });
    await page.screenshot({ path: join(artifacts, name + '-viewport.png') });
    const theme = await page.evaluate(() => ({
      accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
      sidebar: getComputedStyle(document.querySelector('.sidebar')).backgroundColor,
    }));
    assert.equal(theme.accent, '#cf1051');
    assert.equal(theme.sidebar, 'rgb(255, 255, 255)');
    const dimensions = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      width: document.documentElement.clientWidth,
    }));
    assert(dimensions.scroll <= dimensions.width + 1, name + ': débordement horizontal');
    const boxes = await page.locator('app-kpi-card').evaluateAll((nodes) =>
      nodes.map((node) => ({ x: node.getBoundingClientRect().x, y: node.getBoundingClientRect().y })),
    );
    const columns = new Set(boxes.map((box) => Math.round(box.x))).size;
    assert.equal(columns, name === 'desktop' ? 4 : name === 'tablet' ? 2 : 1, name + ': grille KPI');
    if (name === 'mobile') assert(await page.locator('.mobile-nav').isVisible());
    else if (name === 'tablet') assert(await page.locator('.menu-toggle').isVisible());
    else assert(await page.locator('.sidebar').isVisible());
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  await page.getByRole('region', { name: 'Centre de notifications' }).waitFor();
  await page.locator('.sidebar-footer').click();
  await page.getByRole('region', { name: 'Centre de notifications' }).waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  await page.getByRole('region', { name: 'Centre de notifications' }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('region', { name: 'Centre de notifications' }).waitFor({ state: 'hidden' });
  await page.getByLabel('Menu du compte').click();
  await page.locator('.account-menu[open]').waitFor();
  await page.locator('.sidebar-footer').click();
  await page.locator('.account-menu[open]').waitFor({ state: 'hidden' });
  await page.keyboard.press('Control+k');
  assert.equal(await page.locator('#global-query').evaluate((input) => input === document.activeElement), true);
  await page.locator('#global-query').fill('Panneau');
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click();
  await page.getByRole('region', { name: 'Résultats de recherche' }).getByText('Panneau proforma CI', { exact: true }).waitFor();
  await page.locator('.sidebar-footer').click();
  await page.getByRole('region', { name: 'Résultats de recherche' }).waitFor({ state: 'hidden' });
  // Les pages métier partagent les mêmes primitives et doivent rester responsive.
  for (const [slug, route, heading] of [
    ['utilisateurs', '/utilisateurs', 'Utilisateurs'],
    ['produits', '/produits', 'Produits'],
    ['magasins', '/magasins', 'Magasins'],
    ['fournisseurs', '/approvisionnements/fournisseurs', 'Fournisseurs'],
    ['commandes-fournisseurs', '/approvisionnements/commandes', 'Commandes fournisseurs'],
    ['receptions', '/approvisionnements/receptions', 'Réceptions'],
    ['retours-fournisseurs', '/approvisionnements/retours', 'Retours fournisseurs'],
    ['commandes', '/ventes/commandes', 'Commandes'],
    ['stocks', '/stocks', 'Stocks'],
    ['transferts', '/stocks/transferts', 'Transferts de stock'],
    ['inventaires', '/stocks/inventaires', 'Inventaires physiques'],
    ['alertes', '/stocks/alertes', 'Alertes de stock'],
    ['activite', '/activite', 'Activité récente'],
    ['compte', '/mon-compte', 'Mon compte'],
    ['vente', '/ventes/nouvelle', 'Nouvelle vente'],
  ]) {
    await page.goto('http://localhost:4200' + route);
    await page.getByRole('heading', { level: 1, name: heading, exact: true }).waitFor();
    await page.locator('main.page .panel').first().waitFor();
    for (const [name, width, height] of [
      ['desktop', 1440, 900],
      ['tablet', 1024, 768],
      ['mobile', 390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      const layout = await page.evaluate(() => {
        const panel = document.querySelector('main.page .panel');
        return {
          width: document.documentElement.clientWidth,
          scroll: document.documentElement.scrollWidth,
          radius: panel ? getComputedStyle(panel).borderTopLeftRadius : '',
          token: getComputedStyle(document.documentElement).getPropertyValue('--ui-radius').trim(),
        };
      });
      assert(layout.scroll <= layout.width + 1, slug + '/' + name + ': débordement horizontal');
      assert.equal(layout.radius, layout.token, slug + ': rayon de panneau partagé');
      await page.screenshot({ path: join(artifacts, slug + '-' + name + '.png'), fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  await page.goto('http://localhost:4200/approvisionnements/fournisseurs');
  await page.getByRole('button', { name: 'Nouveau fournisseur' }).click();
  await page.locator('input[formControlName="name"]').fill('Fournisseur navigateur CI');
  await page.locator('input[formControlName="email"]').fill('browser@example.test');
  // Simule une réponse perdue après la persistance réelle côté serveur.
  await page.route('**/api/v1/suppliers', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch();
    assert.equal(response.status(), 201);
    await route.abort();
  });
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByRole('button', { name: 'Réessayer', exact: true }).waitFor();
  await page.getByText('Connexion au serveur impossible. Vérifiez votre réseau.', { exact: true }).waitFor();
  await page.unroute('**/api/v1/suppliers');
  await page.reload();
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click();
  const supplierRow = page.getByRole('region', { name: 'Liste des fournisseurs' }).getByRole('row').filter({ hasText: 'Fournisseur navigateur CI' });
  await supplierRow.waitFor();
  await supplierRow.getByRole('button', { name: 'Modifier', exact: true }).click();
  await page.locator('input[formControlName="email"]').fill('');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await supplierRow.getByRole('button', { name: 'Détails', exact: true }).click();
  await page.getByRole('heading', { name: 'Fiche fournisseur — Fournisseur navigateur CI' }).waitFor();
  assert.equal(await page.locator('main.page dl').getByText('Non renseignée', { exact: true }).count(), 2);
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();
  await supplierRow.getByRole('button', { name: 'Désactiver', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await supplierRow.getByRole('button', { name: 'Activer', exact: true }).waitFor();
  await page.reload();
  await supplierRow.getByRole('button', { name: 'Activer', exact: true }).waitFor();
  await page.locator('main.page input[type="search"]').fill('Fournisseur navigateur CI');
  await page.getByRole('button', { name: 'Filtrer', exact: true }).click();
  await page.getByText('1 fournisseur(s)', { exact: true }).waitFor();
  await supplierRow.getByRole('button', { name: 'Activer', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await supplierRow.getByRole('button', { name: 'Désactiver', exact: true }).waitFor();
  await page.screenshot({ path: join(artifacts, 'fournisseurs-crud.png'), fullPage: true });
  await page.goto('http://localhost:4200/approvisionnements/commandes');
  await page.getByRole('button', { name: 'Nouvelle commande' }).click();
  const referenceText = await page.locator('main.page p').filter({ hasText: /^Référence : CF-/ }).innerText();
  const purchaseReference = referenceText.replace(/^Référence :\s*/, '').trim();
  assert.match(purchaseReference, /^CF-/);
  const supplierPicker = page.getByLabel('Sélectionner le fournisseur');
  await supplierPicker.locator('option').filter({ hasText: 'Fournisseur navigateur CI' }).waitFor({ state: 'attached' });
  await supplierPicker.selectOption({ label: 'Fournisseur navigateur CI' });
  await page.getByRole('button', { name: /Panneau proforma CI · PV-PROFORMA-CI/ }).click();
  await page.getByLabel('Quantité', { exact: true }).fill('2,125');
  await page.getByLabel('Coût unitaire', { exact: true }).fill('1000,25');
  await page.route('**/api/v1/purchase-orders', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch();
    assert.equal(response.status(), 201);
    await route.abort();
  });
  await page.getByRole('button', { name: 'Créer le brouillon' }).click();
  await page.getByRole('button', { name: 'Reprendre la création' }).waitFor();
  await page.locator('app-feedback').filter({ hasText: 'Vérifiez la référence' }).waitFor();
  await page.unroute('**/api/v1/purchase-orders');
  await page.reload();
  await page.getByRole('button', { name: 'Reprendre la création' }).click();
  await page.getByRole('button', { name: 'Confirmer la commande' }).click();
  await page.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmer la commande' }).waitFor({ state: 'hidden' });
  await page.getByText('Commande confirmée.', { exact: true }).waitFor();
  await page.screenshot({ path: join(artifacts, 'commandes-fournisseurs-crud.png'), fullPage: true });
  await page.goto('http://localhost:4200/approvisionnements/receptions');
  await page.getByRole('button', { name: 'Nouvelle réception' }).click();
  const receiptOrder = page.getByRole('combobox', { name: 'Commande fournisseur', exact: true });
  await receiptOrder.waitFor();
  const receiptSearch = page.getByRole('searchbox', { name: 'Rechercher une commande', exact: true });
  await receiptSearch.fill(purchaseReference);
  await receiptSearch.press('Enter');
  const receiptOrderOption = receiptOrder.locator('option').filter({ hasText: purchaseReference });
  await receiptOrderOption.waitFor({ state: 'attached' });
  const receiptOrderId = await receiptOrderOption.getAttribute('value');
  assert(receiptOrderId);
  await receiptOrder.selectOption(receiptOrderId);
  await page.getByLabel('Magasin de réception', { exact: true }).selectOption({ label: 'Magasin CI modifié' });
  await page.getByLabel('Quantité reçue', { exact: true }).fill('1');
  await page.route('**/api/v1/goods-receipts', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch();
    assert.equal(response.status(), 201);
    await route.abort();
  });
  await page.getByRole('button', { name: 'Créer le bon de réception' }).click();
  await page.locator('app-feedback').filter({ hasText: 'Vérifiez la référence' }).waitFor();
  await page.unroute('**/api/v1/goods-receipts');
  await page.reload();
  await page.getByRole('button', { name: 'Reprendre la réception' }).click();
  await page.getByRole('button', { name: 'Annuler la réception', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await page.getByText('Réception annulée.', { exact: true }).waitFor();
  await page.screenshot({ path: join(artifacts, 'receptions-crud.png'), fullPage: true });
  await page.goto('http://localhost:4200/stocks');
  const storeSelector = page.locator('.inventory-toolbar select');
  const storeOption = storeSelector.locator('option').filter({ hasText: 'Magasin CI modifié' });
  await storeOption.waitFor({ state: 'attached' });
  const stockStoreId = await storeOption.getAttribute('value');
  assert(stockStoreId);
  await storeSelector.selectOption(stockStoreId);
  const stockRow = page.getByRole('region', { name: 'État du stock' }).getByRole('row').filter({ hasText: 'PV-PROFORMA-CI' });
  await stockRow.waitFor();
  await stockRow.getByRole('button', { name: 'Ajuster', exact: true }).click();
  await page.locator('input[formControlName="quantity"]').fill('1,250');
  await page.locator('textarea[formControlName="reason"]').fill('Ajustement navigateur CI');
  await page.getByRole('button', { name: 'Vérifier l’ajustement' }).click();
  await page.getByRole('button', { name: 'Confirmer l’ajustement' }).click();
  await stockRow.getByText('5.875', { exact: true }).first().waitFor();
  await page.getByRole('button', { name: 'Consulter les mouvements' }).click();
  await page.getByRole('region', { name: 'Journal des mouvements' }).getByText('Ajustement navigateur CI', { exact: true }).waitFor();
  await page.screenshot({ path: join(artifacts, 'stocks-adjustment.png'), fullPage: true });
  await page.goto('http://localhost:4200/stocks/transferts');
  const transferStore = page.locator('main.page .panel select').first();
  await transferStore.locator('option[value="' + stockStoreId + '"]').waitFor({ state: 'attached' });
  await transferStore.selectOption(stockStoreId);
  const transferRow = page.getByRole('region', { name: 'Transferts de stock', exact: true }).getByRole('row').filter({ hasText: 'TR-INTEGRATION-CI' });
  await transferRow.getByRole('button', { name: 'Détails' }).click();
  await page.getByRole('region', { name: 'Détail du transfert' }).getByText('Panneau proforma CI · PV-PROFORMA-CI', { exact: true }).waitFor();
  await page.getByRole('region', { name: 'Historique du transfert' }).getByText('Clôturé avec écarts', { exact: true }).waitFor();
  await page.screenshot({ path: join(artifacts, 'transfert-detail.png'), fullPage: true });
  await page.goto('http://localhost:4200/stocks/inventaires');
  const countStore = page.locator('main.page .panel select').first();
  await countStore.locator('option[value="' + stockStoreId + '"]').waitFor({ state: 'attached' });
  await countStore.selectOption(stockStoreId);
  await page.getByRole('region', { name: 'Inventaires physiques', exact: true }).getByRole('row').filter({ hasText: 'Validé' }).getByRole('button', { name: 'Détails' }).click();
  await page.getByRole('region', { name: 'Comptage physique' }).getByText('Panneau proforma CI · PV-PROFORMA-CI', { exact: true }).waitFor();
  await page.screenshot({ path: join(artifacts, 'inventaire-detail.png'), fullPage: true });
  await page.goto('http://localhost:4200/produits');
  await page.getByRole('region', { name: 'Liste des produits' }).getByText('Panneau proforma CI', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Nouveau produit' }).click();
  await page.locator('input[formControlName="sku"]').fill('CI-BROWSER-PV');
  await page.locator('input[formControlName="name"]').fill('Produit navigateur CI');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  const createdRow = page.getByRole('region', { name: 'Liste des produits' }).getByRole('row').filter({ hasText: 'CI-BROWSER-PV' });
  await createdRow.waitFor();
  await createdRow.getByRole('button', { name: 'Modifier', exact: true }).click();
  await page.locator('input[formControlName="name"]').fill('Produit navigateur CI modifié');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await createdRow.getByText('Produit navigateur CI modifié', { exact: true }).waitFor();
  await createdRow.getByRole('button', { name: 'Détails', exact: true }).click();
  await page.locator('input[formControlName="salePrice"]').fill('1250,25');
  await page.getByRole('button', { name: 'Enregistrer le tarif' }).click();
  await page.getByRole('region', { name: 'Historique des tarifs' }).getByText('1\u202f250,25 FCFA', { exact: true }).waitFor();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'test.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DQAAAEgQGALFXOsAAAAABJRU5ErkJggg==', 'base64'),
  });
  await createdRow.locator('app-product-thumbnail img').waitFor();
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();
  await createdRow.getByRole('button', { name: 'Désactiver', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await createdRow.getByRole('button', { name: 'Activer', exact: true }).waitFor();
  await createdRow.getByRole('button', { name: 'Activer', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await createdRow.getByRole('button', { name: 'Désactiver', exact: true }).waitFor();
  await page.screenshot({ path: join(artifacts, 'catalogue-crud.png'), fullPage: true });
  await page.goto('http://localhost:4200/utilisateurs');
  await page.getByRole('region', { name: 'Liste des utilisateurs' }).getByText('Magasinier CI', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Nouvel utilisateur' }).click();
  await page.getByRole('button', { name: 'Annuler' }).click();
  await page.goto('http://localhost:4200/tableau-de-bord');
  await page.locator('.new-sale-action').click();
  await page.waitForURL('**/ventes/nouvelle');
  await page.locator('select[formControlName="customerId"] option').nth(1).waitFor({ state: 'attached' });
  await page.locator('select[formControlName="customerId"]').selectOption({ label: 'Client proforma CI' });
  await page.locator('select[formControlName="productId"]').selectOption({ label: 'Panneau proforma CI — PV-PROFORMA-CI' });
  await page.locator('select[formControlName="storeId"]').selectOption({ label: 'Magasin CI modifié' });
  await page.locator('input[formControlName="quantity"]').fill('2');
  await page.locator('input[formControlName="unitPrice"]').fill('1000');
  await page.locator('input[formControlName="taxRate"]').fill('18');
  await page.getByRole('button', { name: 'Créer le devis brouillon' }).click();
  await page.getByText('2\u202f360,00 FCFA', { exact: true }).waitFor();
  await page.screenshot({ path: join(artifacts, 'proforma.png'), fullPage: true });
  assert.deepEqual(errors, [], 'Erreurs JavaScript dans le navigateur');
  await page.getByLabel('Menu du compte').click();
  await page.getByRole('button', { name: 'Déconnexion' }).click();
  await page.waitForURL('**/connexion');
  assert(!(await page.context().cookies()).some((item) => item.name === 'dsolar_refresh'));
  await page.goto('http://localhost:4200/tableau-de-bord');
  await page.waitForURL('**/connexion');
  console.log('Validation navigateur : desktop, tablette, mobile et proforma réussis.');
} finally {
  await browser.close();
}
