import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { readReceivableGroups } from '../../../shared/receivables-query';
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

  async snapshot(actorId: string): Promise<SalesReportSnapshot> {
    const { orders, invoices, credits } = await this.prisma.$transaction(
      async (tx) => {
        const admin = await tx.user.findFirst({
          where: { id: actorId, status: 'ACTIVE', roles: { some: { role: { code: 'ADMIN' } } } },
          select: { id: true },
        });
        if (!admin) throw new ForbiddenException('Rapport financier réservé au super administrateur actif.');
        const orders = await readReceivableGroups(tx);
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
        paymentStatus: group.status,
        count: group.count,
        total: group.total,
        amountPaid: group.paid,
        credited: group.credited,
        outstanding: group.outstanding,
        overpaid: group.overpaid,
      })),
      issuedInvoices: invoices._count._all,
      grossInvoiced: (invoices._sum.totalTtc ?? new Prisma.Decimal(0)).toFixed(2),
      creditNotesTotal: (credits._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
    };
  }
}
