import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { SalesReportRepository, SalesReportSnapshot } from '../application/sales-report.port';

@Injectable()
export class PrismaSalesReportRepository implements SalesReportRepository {
  constructor(private readonly prisma: PrismaService) {}

  async isActiveAdmin(actorId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: {
        status: true,
        roles: { select: { role: { select: { code: true } } } },
      },
    });
    return Boolean(user && user.status === 'ACTIVE' && user.roles.some(({ role }) => role.code === 'ADMIN'));
  }

  async snapshot(): Promise<SalesReportSnapshot> {
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
    return {
      orders: orders.map((group) => ({
        paymentStatus: group.paymentStatus,
        count: group._count._all,
        total: (group._sum.total ?? new Prisma.Decimal(0)).toFixed(2),
        amountPaid: (group._sum.amountPaid ?? new Prisma.Decimal(0)).toFixed(2),
      })),
      issuedInvoices: invoices._count._all,
      grossInvoiced: (invoices._sum.totalTtc ?? new Prisma.Decimal(0)).toFixed(2),
      creditNotesTotal: (credits._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
    };
  }
}
