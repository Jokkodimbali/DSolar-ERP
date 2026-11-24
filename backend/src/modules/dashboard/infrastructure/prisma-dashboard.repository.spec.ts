import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PrismaDashboardRepository } from './prisma-dashboard.repository';

describe('Autorisation transactionnelle du dashboard', () => {
  const tx = {
    user: { findUnique: jest.fn() },
    auditLog: { findMany: jest.fn() },
    purchaseOrder: { groupBy: jest.fn() },
    salesOrder: { groupBy: jest.fn() },
    salesOrderLine: { groupBy: jest.fn() },
    invoice: { findMany: jest.fn() },
    store: { findMany: jest.fn(), count: jest.fn() },
  };
  const transaction = jest.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx));
  const repository = new PrismaDashboardRepository({
    $transaction: transaction,
  } as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.user.findUnique.mockResolvedValue({ status: 'INACTIVE', roles: [{ roleId: 'admin' }] });
  });

  const reports: [string, () => Promise<unknown>][] = [
    ['synthèse', () => repository.snapshot('actor')],
    ['factures', () => repository.monthlyInvoices(2026, 'actor')],
    ['créances', () => repository.receivables('actor')],
    ['produits', () => repository.topProducts(10, 'actor')],
    ['activité', () => repository.recentActivity(10, 'actor')],
    ['ventes', () => repository.storeSales('actor')],
    ['achats', () => repository.procurement('actor')],
    ['valorisation', () => repository.stockValuation('actor')],
  ];

  it.each(reports)('refuse un administrateur désactivé avant lecture : %s', async (_, read) => {
    await expect(read()).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.auditLog.findMany).not.toHaveBeenCalled();
    expect(tx.purchaseOrder.groupBy).not.toHaveBeenCalled();
    expect(tx.salesOrder.groupBy).not.toHaveBeenCalled();
    expect(tx.salesOrderLine.groupBy).not.toHaveBeenCalled();
    expect(tx.invoice.findMany).not.toHaveBeenCalled();
    expect(tx.store.findMany).not.toHaveBeenCalled();
    expect(tx.store.count).not.toHaveBeenCalled();
  });

  it('lit les droits et les rapports dans une même transaction', async () => {
    tx.user.findUnique.mockResolvedValue({ status: 'ACTIVE', roles: [{ roleId: 'admin' }] });
    tx.auditLog.findMany.mockResolvedValue([]);
    await expect(repository.recentActivity(10, 'actor')).resolves.toEqual([]);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
    expect(tx.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
    );
  });
});
