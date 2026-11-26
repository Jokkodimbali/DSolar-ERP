import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DashboardRepository } from './dashboard.port';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  const repository = {
    isAdmin: jest.fn(),
    monthlyInvoices: jest.fn(),
    periodEvents: jest.fn(),
    receivables: jest.fn(),
    stockValuation: jest.fn(),
    snapshot: jest.fn(),
    topProducts: jest.fn(),
    recentActivity: jest.fn(),
    storeSales: jest.fn(),
  };
  const service = new DashboardService(repository as unknown as DashboardRepository);

  beforeEach(() => {
    jest.resetAllMocks();
    repository.isAdmin.mockResolvedValue(true);
  });

  it('exporte les créances en CSV avec un BOM UTF-8', async () => {
    repository.receivables.mockResolvedValue([{ status: 'UNPAID', count: 2, total: '100.10', paid: '0.00' }]);
    const csv = await service.exportReceivablesCsv('admin');
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"Reste a encaisser";"100.10"');
  });

  it('protège les noms de magasins dans l’export des ventes CSV', async () => {
    repository.storeSales.mockResolvedValue([
      { storeId: 's1', storeName: '=SUM(1+1)', quantity: '2.000', amount: '500.00' },
    ]);
    const csv = await service.exportStoreSalesCsv('admin');
    expect(csv).toContain(String.fromCharCode(34, 39) + '=SUM(1+1)"');
    expect(csv).toContain('"2.000";"500.00"');
  });

  it('refuse l’export des ventes aux magasiniers', async () => {
    repository.isAdmin.mockResolvedValue(false);
    await expect(service.exportStoreSalesCsv('magasinier')).rejects.toThrow(ForbiddenException);
    expect(repository.storeSales).not.toHaveBeenCalled();
  });

  it('refuse les statistiques financières à un magasinier', async () => {
    repository.isAdmin.mockResolvedValue(false);
    await expect(service.monthlyRevenue('magasinier', '2026')).rejects.toThrow(ForbiddenException);
    expect(repository.monthlyInvoices).not.toHaveBeenCalled();
  });

  it('calcule les jours et variations mensuelles avec les avoirs et annulations de paiement', async () => {
    repository.periodEvents.mockResolvedValue([
      { date: new Date('2026-01-10'), kind: 'invoice', amount: '100.00', count: 0 },
      { date: new Date('2026-02-02'), kind: 'invoice', amount: '160.00', count: 0 },
      { date: new Date('2026-02-02'), kind: 'credit', amount: '10.00', count: 0 },
      { date: new Date('2026-02-03'), kind: 'payment', amount: '30.00', count: 0 },
      { date: new Date('2026-02-03'), kind: 'reversal', amount: '5.00', count: 0 },
      { date: new Date('2026-02-03'), kind: 'order', amount: '0.00', count: 2 },
    ]);
    const result = await service.period('admin', '2026-02');
    expect(result).toMatchObject({
      revenue: '150.00',
      collected: '25.00',
      orders: 2,
      variations: { revenue: '50.0', collected: null, orders: null },
    });
    expect(result.days).toHaveLength(28);
    expect(result.days[1]).toEqual({ day: 2, revenue: '150.00', orders: 0 });
    expect(result.days[2]).toEqual({ day: 3, revenue: '0.00', orders: 2 });
  });

  it('refuse les périodes invalides et les utilisateurs non administrateurs', async () => {
    await expect(service.period('admin', '2026-13')).rejects.toThrow(BadRequestException);
    repository.isAdmin.mockResolvedValue(false);
    await expect(service.period('magasinier', '2026-02')).rejects.toThrow(ForbiddenException);
    expect(repository.periodEvents).not.toHaveBeenCalled();
  });

  it('rejette une année invalide', async () => {
    await expect(service.monthlyRevenue('admin', '2026-01')).rejects.toThrow(BadRequestException);
  });

  it('consolide les factures émises par mois sans arrondi flottant', async () => {
    repository.monthlyInvoices.mockResolvedValue([
      { issuedAt: new Date('2026-01-02T00:00:00.000Z'), total: '100.10' },
      { issuedAt: new Date('2026-01-31T00:00:00.000Z'), total: '200.20' },
      { issuedAt: new Date('2026-12-10T00:00:00.000Z'), total: '3.05' },
    ]);
    const result = await service.monthlyRevenue('admin', '2026');
    expect(result.months).toHaveLength(12);
    expect(result.months[0]).toEqual({ month: 1, revenue: '300.30' });
    expect(result.months[11]).toEqual({ month: 12, revenue: '3.05' });
    expect(result.months[1]).toEqual({ month: 2, revenue: '0.00' });
  });

  it('calcule les créances sans erreurs de centimes', async () => {
    repository.receivables.mockResolvedValue([
      { status: 'UNPAID', count: 1, total: '100.10', paid: '0.00' },
      { status: 'PARTIALLY_PAID', count: 1, total: '200.20', paid: '50.05' },
      { status: 'PAID', count: 1, total: '30.30', paid: '30.30' },
    ]);
    const result = await service.receivables('admin');
    expect(result).toMatchObject({
      orders: 3,
      unpaidOrders: 1,
      partiallyPaidOrders: 1,
      paidOrders: 1,
      total: '330.60',
      paid: '80.35',
      outstanding: '250.25',
    });
  });

  it('signale les références non valorisées', async () => {
    repository.stockValuation.mockResolvedValue([
      { storeId: 'a', storeName: 'A', valued: '120.25', unvaluedProducts: 2 },
      { storeId: 'b', storeName: 'B', valued: '10.10', unvaluedProducts: 1 },
    ]);
    const result = await service.stockValuation('admin');
    expect(result.totalValued).toBe('130.35');
    expect(result.unvaluedProducts).toBe(3);
  });

  it('interdit l’export des stocks aux utilisateurs non administrateurs', async () => {
    repository.isAdmin.mockResolvedValue(false);
    await expect(service.exportStockValuationCsv('magasinier')).rejects.toThrow(ForbiddenException);
    expect(repository.stockValuation).not.toHaveBeenCalled();
  });

  it('protège les cellules CSV et conserve les séparateurs dans les noms', async () => {
    repository.stockValuation.mockResolvedValue([
      {
        storeId: 'store-1',
        storeName: '=HYPERLINK("https://example.test");Test',
        valued: '125.50',
        unvaluedProducts: 1,
      },
    ]);
    const csv = await service.exportStockValuationCsv('admin');
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('Valeur stock XOF');
    expect(csv).toContain('"\'=HYPERLINK(""https://example.test"");Test"');
    expect(csv).toContain('"125.50";"1"');
  });

  it('préserve le signe des centimes négatifs lors des agrégations', async () => {
    repository.stockValuation.mockResolvedValue([
      { storeId: 'a', storeName: 'A', valued: '-0.25', unvaluedProducts: 0 },
      { storeId: 'b', storeName: 'B', valued: '-1.10', unvaluedProducts: 0 },
    ]);
    expect((await service.stockValuation('admin')).totalValued).toBe('-1.35');
  });

  it('neutralise les formules CSV précédées d’espaces', async () => {
    repository.storeSales.mockResolvedValue([
      { storeId: 's1', storeName: '  =1+1', quantity: '1.000', amount: '10.00' },
    ]);
    expect(await service.exportStoreSalesCsv('admin')).toContain('"\'  =1+1"');
  });

  it('calcule le suivi des commandes fournisseurs par statut', async () => {
    const procurementRepository = {
      ...repository,
      procurement: jest.fn().mockResolvedValue([
        { status: 'DRAFT', count: 2 },
        { status: 'CONFIRMED', count: 3 },
      ]),
    };
    const procurementService = new DashboardService(procurementRepository as unknown as DashboardRepository);
    await expect(procurementService.procurement('admin')).resolves.toEqual({
      total: 5,
      statuses: [
        { status: 'DRAFT', count: 2 },
        { status: 'CONFIRMED', count: 3 },
      ],
    });
  });

  it('déduit les avoirs du montant brut facturé', async () => {
    repository.snapshot.mockResolvedValue({
      stores: 2,
      activeProducts: 5,
      customers: 4,
      suppliers: 3,
      confirmedOrders: 2,
      pendingPurchaseOrders: 1,
      issuedInvoices: 2,
      invoiced: '1000.25',
      creditNotes: '200.10',
      collected: '500.15',
      stock: [],
    });
    const result = await service.overview('admin');
    expect(result).toMatchObject({
      grossInvoiced: '1000.25',
      creditNotes: '200.10',
      netInvoiced: '800.15',
      collected: '500.15',
    });
  });

  it('interdit le tableau de bord global aux non-administrateurs', async () => {
    repository.isAdmin.mockResolvedValue(false);
    await expect(service.overview('magasinier')).rejects.toThrow(ForbiddenException);
    expect(repository.snapshot).not.toHaveBeenCalled();
  });

  it('valide les limites du classement avant de consulter la base', async () => {
    await expect(service.topProducts('admin', '51')).rejects.toThrow(BadRequestException);
    await expect(service.recentActivity('admin', '0')).rejects.toThrow(BadRequestException);
    expect(repository.topProducts).not.toHaveBeenCalled();
    expect(repository.recentActivity).not.toHaveBeenCalled();
  });

  it('accepte la limite maximale autorisée pour les produits', async () => {
    repository.topProducts.mockResolvedValue([]);
    await expect(service.topProducts('admin', '50')).resolves.toEqual({ items: [] });
    expect(repository.topProducts).toHaveBeenCalledWith(50, 'admin');
  });
});
