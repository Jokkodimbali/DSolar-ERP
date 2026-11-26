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
  const purchaseSummary = page.getByRole('region', { name: 'Synthèse des achats fournisseur' });
  await purchaseSummary.getByText('Non disponible', { exact: true }).waitFor();
  await purchaseSummary.getByText('Valeur nette réceptionnée', { exact: true }).waitFor();
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
  await page.goto('http://localhost:4200/approvisionnements/retours');
  await page.getByRole('button', { name: 'Nouveau retour' }).click();
  const returnReceipt = page.getByRole('combobox', { name: 'Réception confirmée', exact: true });
  const returnReceiptOption = returnReceipt.locator('option').filter({ hasText: 'BR-CONTRAT-CI' });
  await returnReceiptOption.waitFor({ state: 'attached' });
  const returnReceiptId = await returnReceiptOption.getAttribute('value');
  assert(returnReceiptId);
  await returnReceipt.selectOption(returnReceiptId);
  await page.getByRole('textbox', { name: 'Quantité à retourner PV-PROFORMA-CI', exact: true }).fill('0,125');
  await page.getByLabel('Motif du retour', { exact: true }).fill('Retour navigateur CI');
  await page.route('**/api/v1/supplier-returns', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch();
    assert.equal(response.status(), 201);
    await route.abort();
  });
  await page.getByRole('button', { name: 'Créer le retour', exact: true }).click();
  await page.locator('app-feedback').filter({ hasText: 'Ne créez pas de nouveau retour' }).waitFor();
  await page.unroute('**/api/v1/supplier-returns');
  await page.reload();
  await page.getByRole('button', { name: 'Reprendre le retour' }).click();
  await page.getByLabel('Motif d’annulation', { exact: true }).fill('Annulation navigateur CI');
  await page.getByRole('button', { name: 'Annuler le retour', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await page.getByText('Retour annulé.', { exact: true }).waitFor();
  await page.screenshot({ path: join(artifacts, 'retours-crud.png'), fullPage: true });
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
  // Les contrats HTTP ont livré 2 unités avant ce scénario (4.500 - 2.000 + 1.250).
  await stockRow.getByText('3.750', { exact: true }).first().waitFor();
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
  await page.goto('http://localhost:4200/ventes/clients');
  await page.getByRole('region', { name: 'Liste des clients' }).getByText('Client proforma CI', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Nouveau client' }).click();
  await page.locator('input[formControlName="name"]').fill('Client navigateur CI');
  await page.route('**/api/v1/customers', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch();
    assert.equal(response.status(), 201);
    await route.abort();
  });
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.locator('app-feedback').filter({ hasText: 'Réessayez avec la même demande' }).waitFor();
  await page.unroute('**/api/v1/customers');
  await page.reload();
  await page.getByRole('button', { name: 'Reprendre la création' }).click();
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await page.getByText('Client créé avec succès.', { exact: true }).waitFor();
  const clientRow = page.getByRole('region', { name: 'Liste des clients' }).getByRole('row').filter({ hasText: 'Client navigateur CI' });
  await clientRow.getByRole('button', { name: 'Modifier', exact: true }).click();
  await page.locator('input[formControlName="phone"]').fill('770000001');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await clientRow.getByText('770000001', { exact: true }).waitFor();
  await page.screenshot({ path: join(artifacts, 'clients-crud.png'), fullPage: true });
  await page.goto('http://localhost:4200/utilisateurs');
  await page.getByRole('region', { name: 'Liste des utilisateurs' }).getByText('Magasinier CI', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Nouvel utilisateur' }).click();
  await page.getByRole('button', { name: 'Annuler' }).click();
  await page.goto('http://localhost:4200/tableau-de-bord');
  await page.locator('.new-sale-action').click();
  await page.waitForURL('**/ventes/nouvelle');
  const saleCustomerSearch = page.getByRole('searchbox', { name: 'Rechercher un client', exact: true });
  await saleCustomerSearch.fill('Client proforma CI');
  await saleCustomerSearch.press('Enter');
  await page.locator('select[formControlName="customerId"] option').filter({ hasText: 'Client proforma CI' }).waitFor({ state: 'attached' });
  await page.locator('select[formControlName="customerId"]').selectOption({ label: 'Client proforma CI' });
  const saleProductSearch = page.getByRole('searchbox', { name: 'Rechercher un produit', exact: true });
  await saleProductSearch.fill('PV-PROFORMA-CI');
  await saleProductSearch.press('Enter');
  await page.locator('select[formControlName="productId"] option').filter({ hasText: 'PV-PROFORMA-CI' }).waitFor({ state: 'attached' });
  await page.locator('select[formControlName="productId"]').selectOption({ label: 'Panneau proforma CI — PV-PROFORMA-CI' });
  const expiry = new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 16);
  await page.locator('input[formControlName="expiry"]').fill(expiry);
  await page.locator('select[formControlName="storeId"]').selectOption({ label: 'Magasin CI modifié' });
  await page.locator('input[formControlName="quantity"]').fill('2');
  await page.locator('input[formControlName="unitPrice"]').fill('1000');
  await page.locator('input[formControlName="taxRate"]').fill('18');
  let browserProforma = '';
  await page.route('**/api/v1/proformas', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    browserProforma = route.request().postDataJSON().number;
    assert.match(browserProforma, /^PF-[0-9A-F-]{36}$/);
    const response = await route.fetch();
    assert.equal(response.status(), 201);
    await route.abort();
  });
  await page.getByRole('button', { name: 'Créer le devis brouillon' }).click();
  await page.locator('app-feedback').filter({ hasText: 'reprenez la même demande' }).waitFor();
  await page.unroute('**/api/v1/proformas');
  await page.reload();
  await page.getByRole('button', { name: 'Reprendre le devis', exact: true }).click();
  await page.getByText('2\u202f360,00 FCFA', { exact: true }).waitFor();
  await page.screenshot({ path: join(artifacts, 'proforma.png'), fullPage: true });
  assert(browserProforma);
  await page.getByTestId('proforma-reference').getByText(browserProforma, { exact: true }).waitFor();
  await page.getByRole('link', { name: 'Consulter les devis' }).click();
  await page.getByRole('searchbox', { name: 'Rechercher', exact: true }).fill(browserProforma);
  await page.getByRole('button', { name: 'Filtrer', exact: true }).click();
  const proformaRow = page.getByRole('region', { name: 'Liste des devis proforma' }).getByRole('row').filter({ hasText: browserProforma });
  await proformaRow.getByRole('button', { name: 'Détails', exact: true }).click();
  await page.getByRole('link', { name: 'Modifier le brouillon', exact: true }).click();
  await page.locator('input[formControlName="quantity"]').fill('3');
  await page.getByRole('button', { name: 'Enregistrer les modifications' }).click();
  await page.getByText('3\u202f540,00 FCFA', { exact: true }).waitFor();
  await page.getByRole('link', { name: 'Consulter les devis' }).click();
  await page.getByRole('searchbox', { name: 'Rechercher', exact: true }).fill(browserProforma);
  await page.getByRole('button', { name: 'Filtrer', exact: true }).click();
  await proformaRow.getByRole('button', { name: 'Détails', exact: true }).click();
  await page.getByRole('button', { name: 'Émettre le devis', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await page.getByText('Statut du devis : Émis.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Accepter le devis', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await page.getByText('Statut du devis : Accepté.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Convertir en commande', exact: true }).click();
  await page.route('**/api/v1/sales-orders/from-proforma/*', async (route) => {
    const response = await route.fetch();
    assert.equal(response.status(), 201);
    await route.abort();
  });
  await page.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await page.getByText(/^Commande associée : CMD-/).first().waitFor();
  await page.unroute('**/api/v1/sales-orders/from-proforma/*');
  await page.getByRole('link', { name: /^CMD-/ }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Convertir en commande', exact: true }).count(), 0);
  await page.screenshot({ path: join(artifacts, 'proformas-lifecycle.png'), fullPage: true });
  await page.getByRole('link', { name: /^CMD-/ }).click();
  await page.getByRole('button', { name: 'Confirmer la commande', exact: true }).click();
  await page.route('**/api/v1/sales-orders/*/confirm', async (route) => {
    const response = await route.fetch();
    assert.equal(response.status(), 201);
    await route.abort();
  });
  await page.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Actualisez la commande avant toute nouvelle opération' }).waitFor();
  await page.unroute('**/api/v1/sales-orders/*/confirm');
  await page.getByRole('button', { name: 'Actualiser', exact: true }).click();
  await page.getByTestId('sales-order-status').getByText('Confirmée', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Confirmer la commande', exact: true }).count(), 0);
  const deliveriesPanel = page.getByRole('region', { name: 'Livraisons de la commande' });
  const deliveryQuantity = deliveriesPanel.getByRole('textbox', { name: /^Quantité à livrer PV-PROFORMA-CI/ });
  await deliveryQuantity.fill('1,125');
  await page.route('**/api/v1/sales-orders/*/deliveries', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch();
    assert.equal(response.status(), 201);
    await route.abort();
  });
  await deliveriesPanel.getByRole('button', { name: 'Créer le bon de livraison', exact: true }).click();
  await deliveriesPanel.getByRole('alert').filter({ hasText: 'reprenez le même bon' }).waitFor();
  await page.unroute('**/api/v1/sales-orders/*/deliveries');
  await page.reload();
  await deliveriesPanel.getByRole('button', { name: 'Reprendre le bon', exact: true }).click();
  await deliveriesPanel.getByRole('status').filter({ hasText: 'Bon enregistré :' }).waitFor();
  await deliveriesPanel.getByRole('button', { name: 'Confirmer le bon', exact: true }).click();
  await page.getByRole('region', { name: 'Confirmer le bon de livraison ?' }).getByRole('button', { name: 'Confirmer', exact: true }).click();
  await page.getByTestId('sales-order-status').getByText('Partiellement livrée', { exact: true }).waitFor();
  await deliveryQuantity.fill('1,875');
  await deliveriesPanel.getByRole('button', { name: 'Créer le bon de livraison', exact: true }).click();
  await deliveriesPanel.getByRole('button', { name: 'Confirmer le bon', exact: true }).click();
  await page.getByRole('region', { name: 'Confirmer le bon de livraison ?' }).getByRole('button', { name: 'Confirmer', exact: true }).click();
  await page.getByTestId('sales-order-status').getByText('Livrée', { exact: true }).waitFor();
  const deliveryDownload = page.waitForEvent('download');
  await deliveriesPanel.getByRole('button', { name: 'Télécharger le bon PDF', exact: true }).first().click();
  const downloadedDelivery = await deliveryDownload;
  assert.match(downloadedDelivery.suggestedFilename(), /^livraison-[0-9a-f-]{36}\.pdf$/);
  assert.equal(await downloadedDelivery.failure(), null);
  await deliveriesPanel.getByRole('region', { name: 'Reliquat de livraison' }).getByText('0.000', { exact: true }).waitFor();
  await page.screenshot({ path: join(artifacts, 'commandes-vente-livraisons.png'), fullPage: true });
  await page.getByRole('link', { name: 'Factures de la commande', exact: true }).click();
  await page.getByRole('button', { name: 'Créer la facture', exact: true }).click();
  await page.route('**/api/v1/invoices/from-order/*', async (route) => {
    const response = await route.fetch();
    assert.equal(response.status(), 201);
    await route.abort();
  });
  await page.getByRole('region', { name: 'Créer la facture ?' }).getByRole('button', { name: 'Confirmer', exact: true }).click();
  await page.getByRole('region', { name: 'Lignes de facture' }).waitFor();
  await page.unroute('**/api/v1/invoices/from-order/*');
  await page.getByRole('button', { name: 'Émettre la facture', exact: true }).click();
  await page.getByRole('region', { name: 'Émettre la facture ?' }).getByRole('button', { name: 'Confirmer', exact: true }).click();
  await page.getByRole('status').filter({ hasText: /Facture FAC-.*Émise/ }).waitFor();
  const invoiceDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Télécharger la facture PDF', exact: true }).click();
  assert.match((await invoiceDownload).suggestedFilename(), /^facture-[0-9a-f-]{36}\.pdf$/);
  await page.screenshot({ path: join(artifacts, 'factures-lifecycle.png'), fullPage: true });
  await page.getByRole('link', { name: 'Règlements de la commande', exact: true }).click();
  await page.getByLabel('Montant reçu (FCFA)', { exact: true }).fill('1000,25');
  await page.getByRole('button', { name: 'Vérifier le règlement', exact: true }).click();
  await page.route('**/api/v1/sales-orders/*/payments', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch();
    assert.equal(response.status(), 201);
    await route.abort();
  });
  await page.getByRole('region', { name: 'Confirmer le règlement reçu ?' }).getByRole('button', { name: 'Confirmer', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'reprenez le même règlement' }).waitFor();
  await page.unroute('**/api/v1/sales-orders/*/payments');
  await page.reload();
  await page.getByRole('button', { name: 'Reprendre le règlement', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Règlement enregistré et vérifié.' }).waitFor();
  await page.getByRole('button', { name: 'Vérifier le règlement', exact: true }).click();
  await page.getByRole('region', { name: 'Confirmer le règlement reçu ?' }).getByRole('button', { name: 'Confirmer', exact: true }).click();
  const paymentHistory = page.getByRole('region', { name: 'Historique des règlements' });
  await paymentHistory.getByRole('row').filter({ hasText: '2\u202f539,75 FCFA' }).waitFor();
  const latestPayment = paymentHistory.getByRole('row').filter({ hasText: '2\u202f539,75 FCFA' });
  await latestPayment.getByLabel('Motif de contrepassation').fill('Correction navigateur CI');
  await latestPayment.getByRole('button', { name: 'Contrepasser', exact: true }).click();
  await page.getByRole('region', { name: 'Contrepasser le règlement ?' }).getByRole('button', { name: 'Confirmer', exact: true }).click();
  await latestPayment.getByText('Contrepassé', { exact: true }).waitFor();
  await page.screenshot({ path: join(artifacts, 'reglements-lifecycle.png'), fullPage: true });
  const allocationResponse = page.waitForResponse((response) =>
    /\/sales-orders\/[^/]+\/payments\/allocations$/.test(response.url()) &&
    response.request().method() === 'GET',
  );
  await page.getByRole('link', { name: 'Affectations comptables', exact: true }).click();
  const allocationHttp = await allocationResponse;
  assert.equal(allocationHttp.status(), 200);
  const allocationBody = await allocationHttp.json();
  const allocationData = allocationBody.data ?? allocationBody;
  const firstPayment = allocationData.payments.find((payment) => payment.installmentNumber === 1);
  assert(firstPayment, 'Premier règlement absent');
  assert.equal(firstPayment.reversals.length, 0);
  assert.equal(firstPayment.allocations.length, 0);
  assert.equal(allocationData.invoices.length, 1);
  const allocationInvoiceId = allocationData.invoices[0].id;
  const firstInstallment = page.getByTestId('allocation-payment-1');
  const invoiceSelect = firstInstallment.getByRole('combobox', { name: 'Facture', exact: true });
  await invoiceSelect.locator('option').filter({ hasText: allocationData.invoices[0].number }).waitFor({ state: 'attached' });
  await invoiceSelect.selectOption(allocationInvoiceId);
  await firstInstallment.getByLabel('Montant à affecter', { exact: true }).fill('1000,25');
  await firstInstallment.getByRole('button', { name: 'Vérifier l’affectation', exact: true }).click();
  await page.getByRole('region', { name: 'Confirmer l’affectation ?' }).getByRole('button', { name: 'Confirmer', exact: true }).click();
  await page.getByText('Règlement affecté.', { exact: true }).waitFor();
  await page.getByRole('region', { name: 'Soldes des factures' }).getByText('2\u202f539,75 FCFA', { exact: true }).waitFor();
  await firstInstallment.getByLabel('Motif de désaffectation', { exact: true }).fill('Correction affectation navigateur CI');
  await firstInstallment.getByRole('button', { name: 'Annuler l’affectation', exact: true }).click();
  await page.getByRole('region', { name: 'Annuler l’affectation ?' }).getByRole('button', { name: 'Confirmer', exact: true }).click();
  await page.getByText('Affectation annulée.', { exact: true }).waitFor();
  await page.screenshot({ path: join(artifacts, 'affectations-lifecycle.png'), fullPage: true });
  await page.getByRole('link', { name: 'Factures', exact: true }).click();
  await page.getByRole('region', { name: 'Liste des factures' }).getByRole('row').filter({ hasText: '3\u202f540,00 FCFA' }).getByRole('button', { name: 'Détails', exact: true }).first().click();
  await page.getByRole('link', { name: 'Avoirs de la facture', exact: true }).click();
  await page.getByRole('textbox', { name: /^Montant HT à créditer/ }).first().fill('50,00');
  await page.getByLabel('Motif de l’avoir').fill('Correction de prix navigateur');
  await page.getByRole('button', { name: 'Calculer l’avoir', exact: true }).click();
  await page.getByRole('region', { name: 'Émettre l’avoir ?' }).getByText(/59,00 FCFA/).waitFor();
  await page.route('**/api/v1/invoices/*/credit-notes', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch();
    assert.equal(response.status(), 201);
    await route.abort();
  });
  await page.getByRole('region', { name: 'Émettre l’avoir ?' }).getByRole('button', { name: 'Confirmer', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'reprendre la même demande' }).waitFor();
  await page.unroute('**/api/v1/invoices/*/credit-notes');
  await page.reload();
  await page.getByRole('button', { name: 'Reprendre l’avoir', exact: true }).click();
  const creditRow = page.getByRole('region', { name: 'Historique des avoirs' }).getByRole('row').filter({ hasText: 'Correction de prix navigateur' });
  await creditRow.getByText('59,00 FCFA', { exact: true }).waitFor();
  const creditDownload = page.waitForEvent('download');
  await creditRow.getByRole('button', { name: 'Télécharger l’avoir PDF', exact: true }).click();
  assert.match((await creditDownload).suggestedFilename(), /^avoir-[0-9a-f-]{36}\.pdf$/);
  await page.getByRole('link', { name: 'Tous les avoirs', exact: true }).click();
  await page.getByRole('region', { name: 'Liste des avoirs' }).getByText('Correction de prix navigateur', { exact: true }).waitFor();
  await page.screenshot({ path: join(artifacts, 'avoirs-lifecycle.png'), fullPage: true });
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
