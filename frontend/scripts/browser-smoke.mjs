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
  await page.locator('app-kpi-card').last().waitFor();
  await page.locator('.revenue-chart').waitFor();
  assert.equal(await page.locator('app-dashboard-report select').first().inputValue(), String(new Date().getFullYear()));
  await page.locator('.stock-alert-item').first().waitFor();
  await page.locator('.recent-activity-list article').first().waitFor();
  assert.equal(await page.locator('app-kpi-card').count(), 4);
  assert.equal(await page.locator('.revenue-column').count(), 12);
  assert.equal(await page.locator('.dashboard-primary > section').count(), 2);
  assert.equal(await page.locator('.dashboard-primary > app-dashboard-report').count(), 2);
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
  await page.getByRole('region', { name: 'Centre de notifications' }).getByRole('button', { name: 'Fermer' }).click();
  await page.keyboard.press('Control+k');
  assert.equal(await page.locator('#global-query').evaluate((input) => input === document.activeElement), true);
  await page.locator('#global-query').fill('Panneau');
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click();
  await page.getByRole('region', { name: 'Résultats de recherche' }).getByText('Panneau proforma CI', { exact: true }).waitFor();
  await page.getByRole('region', { name: 'Résultats de recherche' }).getByRole('button', { name: 'Fermer' }).click();
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
  console.log('Validation navigateur : desktop, tablette, mobile et proforma réussis.');
} finally {
  await browser.close();
}
