import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaSalesReportRepository } from './prisma-sales-report.repository';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

describe('PrismaSalesReportRepository', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    salesOrder: { groupBy: jest.fn() },
    invoice: { aggregate: jest.fn() },
    creditNote: { aggregate: jest.fn() },
    $transaction: jest.fn(),
  };
  const repository = new PrismaSalesReportRepository(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma),
    );
  });

  it('refuse un magasinier et ne lit aucune donnée commerciale', async () => {
    prisma.user.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      roles: [{ role: { code: 'MAGASINIER' } }],
    });
    await expect(repository.summary('user-id')).rejects.toThrow(ForbiddenException);
    expect(prisma.salesOrder.groupBy).not.toHaveBeenCalled();
    expect(prisma.invoice.aggregate).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuse un compte désactivé', async () => {
    prisma.user.findUnique.mockResolvedValue({
      status: 'DISABLED',
      roles: [{ role: { code: 'ADMIN' } }],
    });
    await expect(repository.summary('user-id')).rejects.toThrow(ForbiddenException);
  });

  it('calcule les soldes en décimal sans erreurs de flottants', async () => {
    prisma.user.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      roles: [{ role: { code: 'ADMIN' } }],
    });
    prisma.salesOrder.groupBy.mockResolvedValue([
      { paymentStatus: 'PARTIALLY_PAID', _count: { _all: 2 },
        _sum: { total: new Prisma.Decimal('300.30'), amountPaid: new Prisma.Decimal('100.10') } },
      { paymentStatus: 'PAID', _count: { _all: 1 },
        _sum: { total: new Prisma.Decimal('50.20'), amountPaid: new Prisma.Decimal('50.20') } },
    ]);
    prisma.invoice.aggregate.mockResolvedValue({ _count: { _all: 2 }, _sum: { totalTtc: new Prisma.Decimal('350.50') } });
    prisma.creditNote.aggregate.mockResolvedValue({ _sum: { amount: new Prisma.Decimal('20.10') } });
    await expect(repository.summary('admin-id')).resolves.toEqual({
      orders: 3,
      totalOrders: '350.50',
      collected: '150.30',
      outstanding: '200.20',
      unpaidOrders: 0,
      partiallyPaidOrders: 2,
      paidOrders: 1,
      issuedInvoices: 2,
      grossInvoiced: '350.50',
      creditNotesTotal: '20.10',
      netInvoiced: '330.40',
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  });

  it('renvoie des montants nuls en absence de factures et avoirs', async () => {
    prisma.user.findUnique.mockResolvedValue({ status: 'ACTIVE', roles: [{ role: { code: 'ADMIN' } }] });
    prisma.salesOrder.groupBy.mockResolvedValue([]);
    prisma.invoice.aggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { totalTtc: null } });
    prisma.creditNote.aggregate.mockResolvedValue({ _sum: { amount: null } });
    await expect(repository.summary('admin-id')).resolves.toMatchObject({
      orders: 0, totalOrders: '0.00', collected: '0.00', outstanding: '0.00',
      issuedInvoices: 0, grossInvoiced: '0.00', creditNotesTotal: '0.00', netInvoiced: '0.00',
    });
  });
});
