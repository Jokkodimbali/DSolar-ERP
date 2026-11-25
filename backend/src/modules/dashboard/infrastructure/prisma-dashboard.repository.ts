import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { readReceivableGroups } from '../../../shared/receivables-query';
import { DashboardPeriodEvent, DashboardRepository, DashboardSnapshot } from '../application/dashboard.port';

@Injectable()
export class PrismaDashboardRepository implements DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  isAdmin(actorId: string): Promise<boolean> {
    return this.hasAdminRole(this.prisma, actorId);
  }

  private async hasAdminRole(tx: Prisma.TransactionClient, actorId: string): Promise<boolean> {
    const user = await tx.user.findUnique({
      where: { id: actorId },
      select: {
        status: true,
        roles: { where: { role: { code: 'ADMIN' } }, select: { roleId: true } },
      },
    });
    return Boolean(user && user.status === 'ACTIVE' && user.roles.length > 0);
  }

  private read<T>(actorId: string, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        if (!(await this.hasAdminRole(tx, actorId)))
          throw new ForbiddenException('Tableau de bord réservé aux administrateurs actifs.');
        return work(tx);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        maxWait: 10000,
        timeout: 20000,
      },
    );
  }

  async topProducts(limit: number, actorId: string) {
    return this.read(actorId, async (tx) => {
      const rows = await tx.salesOrderLine.groupBy({
        by: ['productId'],
        where: { order: { status: { in: ['CONFIRMED', 'PARTIALLY_DELIVERED', 'DELIVERED'] } } },
        _sum: { quantity: true },
        orderBy: [{ _sum: { quantity: 'desc' } }, { productId: 'asc' }],
        take: limit,
      });
      const products = await tx.product.findMany({
        where: { id: { in: rows.map((row) => row.productId) } },
        select: { id: true, sku: true, name: true },
      });
      const names = new Map(products.map((product) => [product.id, product]));
      return rows.map((row) => ({
        productId: row.productId,
        sku: names.get(row.productId)?.sku ?? '',
        name: names.get(row.productId)?.name ?? '',
        quantity: (row._sum.quantity ?? new Prisma.Decimal(0)).toFixed(3),
      }));
    });
  }

  async stockValuation(actorId: string) {
    return this.read(actorId, async (tx) => {
      const now = new Date();
      const stores = await tx.store.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          name: true,
          stocks: {
            where: { product: { active: true } },
            select: {
              quantity: true,
              product: {
                select: {
                  prices: {
                    where: {
                      validFrom: { lte: now },
                      OR: [{ validTo: null }, { validTo: { gt: now } }],
                    },
                    orderBy: { validFrom: 'desc' },
                    take: 1,
                    select: { purchasePrice: true },
                  },
                },
              },
            },
          },
        },
        orderBy: { name: 'asc' },
      });
      return stores.map((store) => {
        let valued = new Prisma.Decimal(0);
        let unvaluedProducts = 0;
        for (const stock of store.stocks) {
          if (stock.quantity.lte(0)) continue;
          const price = stock.product.prices[0]?.purchasePrice;
          if (price === null || price === undefined) {
            unvaluedProducts++;
          } else {
            valued = valued.plus(stock.quantity.mul(price));
          }
        }
        return {
          storeId: store.id,
          storeName: store.name,
          valued: valued.toFixed(2),
          unvaluedProducts,
        };
      });
    });
  }

  async procurement(actorId: string) {
    return this.read(actorId, async (tx) => {
      const groups = await tx.purchaseOrder.groupBy({
        by: ['status'],
        _count: { _all: true },
        orderBy: { status: 'asc' },
      });
      return groups.map((group) => ({
        status: group.status,
        count: group._count._all,
      }));
    });
  }

  async storeSales(actorId: string) {
    return this.read(actorId, async (tx) => {
      const rows = await tx.salesOrderLine.groupBy({
        by: ['storeId'],
        where: {
          order: { status: { in: ['CONFIRMED', 'PARTIALLY_DELIVERED', 'DELIVERED'] } },
        },
        _sum: { quantity: true, lineTotal: true },
      });
      const stores = await tx.store.findMany({
        where: { id: { in: rows.map((row) => row.storeId) } },
        select: { id: true, name: true },
      });
      const names = new Map(stores.map((store) => [store.id, store.name]));
      return rows.map((row) => ({
        storeId: row.storeId,
        storeName: names.get(row.storeId) ?? '',
        quantity: (row._sum.quantity ?? new Prisma.Decimal(0)).toFixed(3),
        amount: (row._sum.lineTotal ?? new Prisma.Decimal(0)).toFixed(2),
      }));
    });
  }

  async recentActivity(limit: number, actorId: string) {
    return this.read(actorId, async (tx) => {
      return tx.auditLog.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
        select: { id: true, action: true, entityType: true, entityId: true, createdAt: true },
      });
    });
  }

  async receivables(actorId: string) {
    return this.read(actorId, async (tx) => {
      return readReceivableGroups(tx);
    });
  }

  async periodEvents(start: Date, end: Date, actorId: string): Promise<DashboardPeriodEvent[]> {
    return this.read(actorId, async (tx) => {
      const range = { gte: start, lt: end };
      const [invoices, credits, payments, reversals, orders] = await Promise.all([
        tx.invoice.groupBy({
          by: ['issuedAt'],
          where: { status: 'ISSUED', issuedAt: range },
          _sum: { totalTtc: true },
        }),
        tx.creditNote.groupBy({
          by: ['issuedAt'],
          where: { issuedAt: range, invoice: { status: 'ISSUED' } },
          _sum: { amount: true },
        }),
        tx.payment.groupBy({
          by: ['receivedAt'],
          where: { receivedAt: range },
          _sum: { amount: true },
        }),
        tx.paymentReversal.groupBy({
          by: ['createdAt'],
          where: { createdAt: range },
          _sum: { amount: true },
        }),
        tx.salesOrder.groupBy({
          by: ['createdAt'],
          where: { createdAt: range, status: { in: ['CONFIRMED', 'PARTIALLY_DELIVERED', 'DELIVERED'] } },
          _count: { _all: true },
        }),
      ]);
      const amount = (value: Prisma.Decimal | null): string => (value ?? new Prisma.Decimal(0)).toFixed(2);
      const events: DashboardPeriodEvent[] = [];
      for (const row of invoices) {
        if (row.issuedAt) events.push({ date: row.issuedAt, kind: 'invoice', amount: amount(row._sum.totalTtc), count: 0 });
      }
      for (const row of credits) {
        if (row.issuedAt) events.push({ date: row.issuedAt, kind: 'credit', amount: amount(row._sum.amount), count: 0 });
      }
      for (const row of payments) {
        events.push({ date: row.receivedAt, kind: 'payment', amount: amount(row._sum.amount), count: 0 });
      }
      for (const row of reversals) {
        events.push({ date: row.createdAt, kind: 'reversal', amount: amount(row._sum.amount), count: 0 });
      }
      for (const row of orders) {
        events.push({ date: row.createdAt, kind: 'order', amount: '0.00', count: row._count._all });
      }
      return events;
    });
  }

  async monthlyInvoices(year: number, actorId: string) {
    return this.read(actorId, async (tx) => {
      const start = new Date(Date.UTC(year, 0, 1));
      const end = new Date(Date.UTC(year + 1, 0, 1));
      const invoices = await tx.invoice.findMany({
        where: { status: 'ISSUED', issuedAt: { gte: start, lt: end } },
        select: { issuedAt: true, totalTtc: true },
      });
      return invoices.flatMap((invoice) =>
        invoice.issuedAt ? [{ issuedAt: invoice.issuedAt, total: invoice.totalTtc.toFixed(2) }] : [],
      );
    });
  }

  async snapshot(actorId: string): Promise<DashboardSnapshot> {
    return this.read(actorId, async (tx) => {
      const [
        stores,
        activeProducts,
        customers,
        suppliers,
        confirmedOrders,
        pendingPurchaseOrders,
        invoices,
        credits,
        payments,
        reversals,
        stock,
      ] = await Promise.all([
        tx.store.count({ where: { status: 'ACTIVE' } }),
        tx.product.count({ where: { active: true } }),
        tx.customer.count(),
        tx.supplier.count({ where: { active: true } }),
        tx.salesOrder.count({
          where: { status: { in: ['CONFIRMED', 'PARTIALLY_DELIVERED', 'DELIVERED'] } },
        }),
        tx.purchaseOrder.count({ where: { status: { in: ['DRAFT', 'CONFIRMED', 'PARTIALLY_DELIVERED'] } } }),
        tx.invoice.aggregate({
          where: { status: 'ISSUED' },
          _count: { _all: true },
          _sum: { totalTtc: true },
        }),
        tx.creditNote.aggregate({
          where: { issuedAt: { not: null }, invoice: { status: 'ISSUED' } },
          _sum: { amount: true },
        }),
        tx.payment.aggregate({ _sum: { amount: true } }),
        tx.paymentReversal.aggregate({ _sum: { amount: true } }),
        tx.store.findMany({
          where: { status: 'ACTIVE' },
          select: {
            id: true,
            name: true,
            stocks: {
              where: { product: { active: true } },
              select: { quantity: true, reserved: true },
            },
          },
          orderBy: { name: 'asc' },
        }),
      ]);
      return {
        stores,
        activeProducts,
        customers,
        suppliers,
        confirmedOrders,
        pendingPurchaseOrders,
        issuedInvoices: invoices._count._all,
        invoiced: (invoices._sum.totalTtc ?? new Prisma.Decimal(0)).toFixed(2),
        creditNotes: (credits._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
        collected: (payments._sum.amount ?? new Prisma.Decimal(0))
          .minus(reversals._sum.amount ?? new Prisma.Decimal(0))
          .toFixed(2),
        stock: stock.map((store) => ({
          storeId: store.id,
          storeName: store.name,
          products: store.stocks.length,
          outOfStock: store.stocks.reduce(
            (count, item) => count + Number(item.quantity.lte(item.reserved)),
            0,
          ),
          quantity: store.stocks
            .reduce((sum, item) => sum.plus(item.quantity), new Prisma.Decimal(0))
            .toFixed(3),
          reserved: store.stocks
            .reduce((sum, item) => sum.plus(item.reserved), new Prisma.Decimal(0))
            .toFixed(3),
        })),
      };
    });
  }
}
