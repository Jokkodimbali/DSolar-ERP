import { describe, expect, it } from 'vitest';
import { parseReport, reports, revenueChart } from './dashboard-reports.contract';

function report(path: string) {
  const definition = reports.find((item) => item.path === path);
  if (!definition) throw new Error('Rapport manquant.');
  return definition;
}

describe('Contrats des rapports du tableau de bord', () => {
  it('préserve les montants et les quantités exacts', () => {
    const definition = report('store-sales');
    const value = {
      basis: 'CONFIRMED_SALES_ORDER_LINES',
      currency: 'XOF',
      stores: [{ storeName: 'Dakar', quantity: '1.250', amount: '9007199254740993.01' }],
    };
    expect(parseReport(value, definition, 2026).rows).toEqual([
      ['Dakar', '1,250', '9\u202f007\u202f199\u202f254\u202f740\u202f993,01 FCFA'],
    ]);
    expect(() => parseReport({ ...value, currency: 'EUR' }, definition, 2026)).toThrow();
    expect(() => parseReport({ ...value, stores: [{ amount: 12 }] }, definition, 2026)).toThrow();
  });

  it('refuse les mois manquants ou une année différente de celle demandée', () => {
    const definition = report('monthly-revenue');
    const value = {
      year: 2026,
      basis: 'ISSUED_INVOICES',
      currency: 'XOF',
      months: Array.from({ length: 12 }, (_, index) => ({ month: index + 1, revenue: '0.00' })),
    };
    expect(parseReport(value, definition, 2026).rows).toHaveLength(12);
    expect(() => parseReport(value, definition, 2025)).toThrow();
    expect(() => parseReport({ ...value, months: [] }, definition, 2026)).toThrow();
  });

  it('distingue une liste vide valide d’une réponse incorrecte', () => {
    const definition = report('top-products');
    expect(parseReport({ items: [] }, definition, 2026).rows).toEqual([]);
    expect(() => parseReport({ items: null }, definition, 2026)).toThrow();
  });

  it('refuse les compteurs négatifs et les dates invalides', () => {
    expect(() => parseReport({ total: -1, statuses: [] }, report('procurement'), 2026)).toThrow();
    expect(() =>
      parseReport(
        { items: [{ action: 'CREATE', entityType: 'Store', entityId: 'id', createdAt: 'invalide' }] },
        report('recent-activity'),
        2026,
      ),
    ).toThrow();
  });
});

describe('Graphique de facturation', () => {
  it('conserve les montants exacts et normalise uniquement la hauteur des barres', () => {
    const chart = revenueChart(['9007199254740993.01', '0.00', '-100.00']);
    expect(chart[0]?.height).toBe(100);
    expect(chart[0]?.amount).toBe('9\u202f007\u202f199\u202f254\u202f740\u202f993,01 FCFA');
    expect(chart[1]?.height).toBe(0);
    expect(chart[2]?.negative).toBe(true);
    expect(revenueChart(['0.00'])[0]?.height).toBe(0);
    expect(() => revenueChart(['invalide'])).toThrow();
  });
});
