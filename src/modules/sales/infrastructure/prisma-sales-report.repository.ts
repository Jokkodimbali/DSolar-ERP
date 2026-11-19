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
    if (!user || user.status !== 'ACTIVE' || !user.roles.some(({ role }) => role.code === 'ADMIN')) {
      throw new ForbiddenException('Rapport financier réservé au super administrateur.');
    }
    const orders = await this.prisma.salesOrder.groupBy({
      by: ['paymentStatus'],
      where: { status: { in: ['CONFIRMED', 'PARTIALLY_DELIVERED', 'DELIVERED'] } },
      _count: { _all: true },
      _sum: { total: true, amountPaid: true },
    });
    const total = orders.reduce((sum, group) => sum.plus(group._sum.total ?? 0), new Prisma.Decimal(0));
    const collected = orders.reduce((sum, group) => sum.plus(group._sum.amountPaid ?? 0), new Prisma.Decimal(0));
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
    };
  }
}
