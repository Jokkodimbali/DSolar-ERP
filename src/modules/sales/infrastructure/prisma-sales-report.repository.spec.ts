import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaSalesReportRepository } from './prisma-sales-report.repository';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

describe('PrismaSalesReportRepository', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    salesOrder: { groupBy: jest.fn() },
  };
  const repository = new PrismaSalesReportRepository(prisma as unknown as PrismaService);

  beforeEach(() => jest.clearAllMocks());

  it('refuse un magasinier et ne lit aucune donnée commerciale', async () => {
    prisma.user.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      roles: [{ role: { code: 'MAGASINIER' } }],
    });
    await expect(repository.summary('user-id')).rejects.toThrow(ForbiddenException);
    expect(prisma.salesOrder.groupBy).not.toHaveBeenCalled();
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
    await expect(repository.summary('admin-id')).resolves.toEqual({
      orders: 3,
      totalOrders: '350.50',
      collected: '150.30',
      outstanding: '200.20',
      unpaidOrders: 0,
      partiallyPaidOrders: 2,
      paidOrders: 1,
    });
  });
});
