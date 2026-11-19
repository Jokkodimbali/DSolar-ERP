import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { SalesReport, SalesReportRepository } from '../application/sales-report.port';

@Injectable()
export class PrismaSalesReportRepository implements SalesReportRepository {
  constructor(private readonly prisma: PrismaService) {}

  async summary(actorId: string): Promise<SalesReport> {
    const user = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: {
        status: true,
        roles: { select: { role: { select: { code: true } } } },
      },
    });
    if (
      !user ||
      user.status !== 'ACTIVE' ||
      !user.roles.some(({ role }) => role.code === 'ADMIN')
    ) {
      throw new ForbiddenException('Rapport financier réservé au super administrateur.');
    }
    // Une seule photographie cohérente des commandes, factures et avoirs.
    // Le niveau RepeatableRead empêche les lectures de refléter des instants différents.
    const { orders, invoices, credits } = await this.prisma.$transaction(
      async (tx) => {
        const orders = await tx.salesOrder.groupBy({
          by: ['paymentStatus'],
          where: { status: { in: ['CONFIRMED', 'PARTIALLY_DELIVERED', 'DELIVERED'] } },
          _count: { _all: true },
          _sum: { total: true, amountPaid: true },
        });
        const invoices = await tx.invoice.aggregate({
          where: { status: 'ISSUED' },
          _count: { _all: true },
          _sum: { totalTtc: true },
        });
        const credits = await tx.creditNote.aggregate({
          where: { invoice: { status: 'ISSUED' }, issuedAt: { not: null } },
          _sum: { amount: true },
        });
        return { orders, invoices, credits };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const grossInvoiced = invoices._sum.totalTtc ?? new Prisma.Decimal(0);
    const creditNotesTotal = credits._sum.amount ?? new Prisma.Decimal(0);
    const total = orders.reduce(
      (sum, group) => sum.plus(group._sum.total ?? 0),
      new Prisma.Decimal(0),
    );
    const collected = orders.reduce(
      (sum, group) => sum.plus(group._sum.amountPaid ?? 0),
      new Prisma.Decimal(0),
    );
    const count = (status: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID') =>
      orders.find((group) => group.paymentStatus === status)?._count._all ?? 0;
    return {
      orders: orders.reduce((sum, group) => sum + group._count._all, 0),
      totalOrders: total.toFixed(2),
      collected: collected.toFixed(2),
      outstanding: total.minus(collected).toFixed(2),
      unpaidOrders: count('UNPAID'),
      partiallyPaidOrders: count('PARTIALLY_PAID'),
      paidOrders: count('PAID'),
      issuedInvoices: invoices._count._all,
      grossInvoiced: grossInvoiced.toFixed(2),
      creditNotesTotal: creditNotesTotal.toFixed(2),
      netInvoiced: grossInvoiced.minus(creditNotesTotal).toFixed(2),
    };
  }
}
