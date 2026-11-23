import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { DASHBOARD_REPOSITORY, DashboardRepository } from './dashboard.port';

const cents = (value: string): bigint => {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
};
const money = (value: bigint): string => {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
};

@Injectable()
export class DashboardService {
  constructor(@Inject(DASHBOARD_REPOSITORY) private readonly repository: DashboardRepository) {}

  async topProducts(actorId: string, limit = '10') {
    if (!/^(?:[1-9]|[1-4][0-9]|50)$/.test(limit)) {
      throw new BadRequestException('La limite doit être comprise entre 1 et 50.');
    }
    if (!(await this.repository.isAdmin(actorId))) {
      throw new ForbiddenException('Classement réservé au super administrateur.');
    }
    return { items: await this.repository.topProducts(Number(limit)) };
  }

  async storeSales(actorId: string) {
    if (!(await this.repository.isAdmin(actorId))) {
      throw new ForbiddenException('Comparaison des magasins réservée au super administrateur.');
    }
    return {
      basis: 'CONFIRMED_SALES_ORDER_LINES',
      currency: 'XOF',
      stores: await this.repository.storeSales(),
    };
  }

  async recentActivity(actorId: string, limit = '20') {
    if (!/^(?:[1-9]|[1-4][0-9]|50)$/.test(limit)) {
      throw new BadRequestException('La limite doit être comprise entre 1 et 50.');
    }
    if (!(await this.repository.isAdmin(actorId))) {
      throw new ForbiddenException('Journal réservé au super administrateur.');
    }
    return { items: await this.repository.recentActivity(Number(limit)) };
  }

  async receivables(actorId: string) {
    if (!(await this.repository.isAdmin(actorId))) {
      throw new ForbiddenException('Créances réservées au super administrateur.');
    }
    const groups = await this.repository.receivables();
    const total = groups.reduce((sum, group) => sum + cents(group.total), 0n);
    const paid = groups.reduce((sum, group) => sum + cents(group.paid), 0n);
    return {
      currency: 'XOF',
      basis: 'ACTIVE_SALES_ORDERS',
      orders: groups.reduce((sum, group) => sum + group.count, 0),
      unpaidOrders: groups.find((group) => group.status === 'UNPAID')?.count ?? 0,
      partiallyPaidOrders: groups.find((group) => group.status === 'PARTIALLY_PAID')?.count ?? 0,
      paidOrders: groups.find((group) => group.status === 'PAID')?.count ?? 0,
      total: money(total),
      paid: money(paid),
      outstanding: money(total - paid),
    };
  }

  async monthlyRevenue(actorId: string, year: string) {
    if (!/^(20[0-9]{2}|2100)$/.test(year)) {
      throw new BadRequestException('Année invalide.');
    }
    if (!(await this.repository.isAdmin(actorId))) {
      throw new ForbiddenException('Statistiques financières réservées au super administrateur.');
    }
    const invoices = await this.repository.monthlyInvoices(Number(year));
    const totals = Array.from({ length: 12 }, () => 0n);
    for (const invoice of invoices) {
      totals[invoice.issuedAt.getUTCMonth()] += cents(invoice.total);
    }
    return {
      year: Number(year),
      currency: 'XOF',
      basis: 'ISSUED_INVOICES',
      months: totals.map((total, index) => ({
        month: index + 1,
        revenue: money(total),
      })),
    };
  }

  async overview(actorId: string) {
    if (!(await this.repository.isAdmin(actorId))) {
      throw new ForbiddenException('Tableau de bord global réservé au super administrateur.');
    }
    const data = await this.repository.snapshot();
    return {
      stores: data.stores,
      activeProducts: data.activeProducts,
      customers: data.customers,
      suppliers: data.suppliers,
      confirmedOrders: data.confirmedOrders,
      pendingPurchaseOrders: data.pendingPurchaseOrders,
      issuedInvoices: data.issuedInvoices,
      grossInvoiced: data.invoiced,
      creditNotes: data.creditNotes,
      netInvoiced: money(cents(data.invoiced) - cents(data.creditNotes)),
      collected: data.collected,
      storesStock: data.stock,
    };
  }
}
