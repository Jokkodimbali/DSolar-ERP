import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { SALES_REPORT_REPOSITORY, SalesReportRepository } from './sales-report.port';

const cents = (value: string): bigint => {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
};
const money = (value: bigint): string => {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
};

@Injectable()
export class SalesReportService {
  constructor(@Inject(SALES_REPORT_REPOSITORY) private readonly reports: SalesReportRepository) {}

  async summary(actorId: string) {
    if (!(await this.reports.isActiveAdmin(actorId)))
      throw new ForbiddenException('Rapport financier réservé au super administrateur.');
    const snapshot = await this.reports.snapshot();
    const total = snapshot.orders.reduce((sum, group) => sum + cents(group.total), 0n);
    const collected = snapshot.orders.reduce((sum, group) => sum + cents(group.amountPaid), 0n);
    const count = (status: string) =>
      snapshot.orders.find((group) => group.paymentStatus === status)?.count ?? 0;
    return {
      orders: snapshot.orders.reduce((sum, group) => sum + group.count, 0),
      totalOrders: money(total),
      collected: money(collected),
      outstanding: money(total - collected),
      unpaidOrders: count('UNPAID'),
      partiallyPaidOrders: count('PARTIALLY_PAID'),
      paidOrders: count('PAID'),
      issuedInvoices: snapshot.issuedInvoices,
      grossInvoiced: snapshot.grossInvoiced,
      creditNotesTotal: snapshot.creditNotesTotal,
      netInvoiced: money(cents(snapshot.grossInvoiced) - cents(snapshot.creditNotesTotal)),
    };
  }
}
