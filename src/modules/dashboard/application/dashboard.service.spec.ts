import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DashboardRepository } from './dashboard.port';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  const repository = {
    isAdmin: jest.fn(),
    monthlyInvoices: jest.fn(),
    receivables: jest.fn(),
    stockValuation: jest.fn(),
  };
  const service = new DashboardService(repository as unknown as DashboardRepository);

  beforeEach(() => {
    jest.resetAllMocks();
    repository.isAdmin.mockResolvedValue(true);
  });

  it('refuse les statistiques financières à un magasinier', async () => {
    repository.isAdmin.mockResolvedValue(false);
    await expect(service.monthlyRevenue('magasinier', '2026')).rejects.toThrow(ForbiddenException);
    expect(repository.monthlyInvoices).not.toHaveBeenCalled();
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
    expect(csv.startsWith('\\uFEFF')).toBe(true);
    expect(csv).toContain('Valeur stock XOF');
    expect(csv).toContain('"\'=HYPERLINK(""https://example.test"");Test"');
    expect(csv).toContain('"125.50";1');
  });

  it('calcule le suivi des commandes fournisseurs par statut', async () => {
    const procurementRepository = {
      ...repository,
      procurement: jest.fn().mockResolvedValue([
        { status: 'DRAFT', count: 2 },
        { status: 'CONFIRMED', count: 3 },
      ]),
    };
    const procurementService = new DashboardService(
      procurementRepository as unknown as DashboardRepository,
    );
    await expect(procurementService.procurement('admin')).resolves.toEqual({
      total: 5,
      statuses: [
        { status: 'DRAFT', count: 2 },
        { status: 'CONFIRMED', count: 3 },
      ],
    });
  });
});
