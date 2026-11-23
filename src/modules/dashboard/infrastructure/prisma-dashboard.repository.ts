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

  async topProducts(limit: number) {
    const rows = await this.prisma.salesOrderLine.groupBy({
      by: ['productId'],
      where: {
        order: { status: { in: ['CONFIRMED', 'PARTIALLY_DELIVERED', 'DELIVERED'] } },
      },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: limit,
    });
    const products = await this.prisma.product.findMany({
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
  }

  async storeSales() {
    const rows = await this.prisma.salesOrderLine.groupBy({
      by: ['storeId'],
      where: {
        order: { status: { in: ['CONFIRMED', 'PARTIALLY_DELIVERED', 'DELIVERED'] } },
      },
      _sum: { quantity: true, lineTotal: true },
    });
    const stores = await this.prisma.store.findMany({
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
  }

  async recentActivity(limit: number) {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, action: true, entityType: true, entityId: true, createdAt: true },
    });
  }

  async receivables() {
    const groups = await this.prisma.salesOrder.groupBy({
      by: ['paymentStatus'],
      where: { status: { in: ['CONFIRMED', 'PARTIALLY_DELIVERED', 'DELIVERED'] } },
      _count: { _all: true },
      _sum: { total: true, amountPaid: true },
    });
    return groups.map((group) => ({
      status: group.paymentStatus,
      count: group._count._all,
      total: (group._sum.total ?? new Prisma.Decimal(0)).toFixed(2),
      paid: (group._sum.amountPaid ?? new Prisma.Decimal(0)).toFixed(2),
    }));
  }

  async monthlyInvoices(year: number) {
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));
    const invoices = await this.prisma.invoice.findMany({
      where: { status: 'ISSUED', issuedAt: { gte: start, lt: end } },
      select: { issuedAt: true, totalTtc: true },
    });
    return invoices
      .filter(
        (invoice): invoice is typeof invoice & { issuedAt: Date } => invoice.issuedAt !== null,
      )
      .map((invoice) => ({
        issuedAt: invoice.issuedAt,
        total: invoice.totalTtc.toFixed(2),
      }));
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
