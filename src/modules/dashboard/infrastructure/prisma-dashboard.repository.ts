import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { DashboardRepository, DashboardSnapshot } from '../application/dashboard.port';

@Injectable()
export class PrismaDashboardRepository implements DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  async isAdmin(actorId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: {
        status: true,
        roles: { where: { role: { code: 'ADMIN' } }, select: { roleId: true } },
      },
    });
    return Boolean(user && user.status === 'ACTIVE' && user.roles.length > 0);
  }

  async snapshot(): Promise<DashboardSnapshot> {
    return this.prisma.$transaction(
      async (tx) => {
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
          stock,
        ] = await Promise.all([
            tx.store.count({ where: { status: 'ACTIVE' } }),
            tx.product.count({ where: { active: true } }),
            tx.customer.count(),
            tx.supplier.count({ where: { active: true } }),
            tx.salesOrder.count({
              where: { status: { in: ['CONFIRMED', 'PARTIALLY_DELIVERED', 'DELIVERED'] } },
            }),
            tx.purchaseOrder.count({ where: { status: { in: ['DRAFT', 'CONFIRMED'] } } }),
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
          collected: (payments._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
          stock: stock.map((store) => ({
            storeId: store.id,
            storeName: store.name,
            products: store.stocks.length,
            outOfStock: store.stocks.filter((item) => item.quantity.minus(item.reserved).lte(0))
              .length,
            quantity: store.stocks
              .reduce((sum, item) => sum.plus(item.quantity), new Prisma.Decimal(0))
              .toFixed(3),
            reserved: store.stocks
              .reduce((sum, item) => sum.plus(item.reserved), new Prisma.Decimal(0))
              .toFixed(3),
          })),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
