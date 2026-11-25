import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { DASHBOARD_REPOSITORY, DashboardRepository } from './dashboard.port';

const cents = (value: string): bigint => {
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  const magnitude = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
  return negative ? -magnitude : magnitude;
};
const money = (value: bigint): string => {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
};

const csvCell = (value: string): string => {
  const needsEscape = /^[\s\uFEFF]*[=+\-@]/u.test(value) || /^[\t\r\n]/.test(value);
  const safe = needsEscape ? "'" + value : value;
  return '"' + safe.replace(/"/g, '""') + '"';
};

const csvDocument = (header: string, rows: string[][]): string =>
  '\uFEFF' + [header, ...rows.map((row) => row.map(csvCell).join(';'))].join('\n');

@Injectable()
export class DashboardService {
  constructor(@Inject(DASHBOARD_REPOSITORY) private readonly repository: DashboardRepository) {}

  async exportReceivablesCsv(actorId: string): Promise<string> {
    const report = await this.receivables(actorId);
    return csvDocument('Indicateur;Valeur', [
      ['Devise', report.currency],
      ['Commandes', String(report.orders)],
      ['Impayees', String(report.unpaidOrders)],
      ['Partiellement payees', String(report.partiallyPaidOrders)],
      ['Payees', String(report.paidOrders)],
      ['Total brut', report.total],
      ['Avoirs', report.credited],
      ['Total net', report.netTotal],
      ['Trop-perçus', report.overpaid],
      ['Encaisse', report.paid],
      ['Reste a encaisser', report.outstanding],
    ]);
  }

  async exportStoreSalesCsv(actorId: string): Promise<string> {
    const report = await this.storeSales(actorId);
    return csvDocument(
      'Magasin ID;Magasin;Quantite vendue;Montant XOF',
      report.stores.map((store) => [store.storeId, store.storeName, store.quantity, store.amount]),
    );
  }

  async topProducts(actorId: string, limit = '10') {
    if (!/^(?:[1-9]|[1-4][0-9]|50)$/.test(limit)) {
      throw new BadRequestException('La limite doit être comprise entre 1 et 50.');
    }
    if (!(await this.repository.isAdmin(actorId))) {
      throw new ForbiddenException('Classement réservé au super administrateur.');
    }
    return { items: await this.repository.topProducts(Number(limit), actorId) };
  }

  async exportStockValuationCsv(actorId: string): Promise<string> {
    const report = await this.stockValuation(actorId);
    return csvDocument(
      'Magasin ID;Magasin;Valeur stock XOF;Produits sans cout',
      report.stores.map((store) => [
        store.storeId,
        store.storeName,
        store.valued,
        String(store.unvaluedProducts),
      ]),
    );
  }

  async stockValuation(actorId: string) {
    if (!(await this.repository.isAdmin(actorId))) {
      throw new ForbiddenException('Valorisation réservée au super administrateur.');
    }
    const stores = await this.repository.stockValuation(actorId);
    const total = stores.reduce((sum, store) => sum + cents(store.valued), 0n);
    return {
      currency: 'XOF',
      basis: 'ON_HAND_QUANTITY_TIMES_CURRENT_PURCHASE_PRICE',
      totalValued: money(total),
      unvaluedProducts: stores.reduce((sum, store) => sum + store.unvaluedProducts, 0),
      stores,
    };
  }

  async procurement(actorId: string) {
    if (!(await this.repository.isAdmin(actorId))) {
      throw new ForbiddenException('Suivi des achats réservé au super administrateur.');
    }
    const statuses = await this.repository.procurement(actorId);
    return {
      total: statuses.reduce((sum, status) => sum + status.count, 0),
      statuses,
    };
  }

  async storeSales(actorId: string) {
    if (!(await this.repository.isAdmin(actorId))) {
      throw new ForbiddenException('Comparaison des magasins réservée au super administrateur.');
    }
    return {
      basis: 'CONFIRMED_SALES_ORDER_LINES',
      currency: 'XOF',
      stores: await this.repository.storeSales(actorId),
    };
  }

  async recentActivity(actorId: string, limit = '20') {
    if (!/^(?:[1-9]|[1-4][0-9]|50)$/.test(limit)) {
      throw new BadRequestException('La limite doit être comprise entre 1 et 50.');
    }
    if (!(await this.repository.isAdmin(actorId))) {
      throw new ForbiddenException('Journal réservé au super administrateur.');
    }
    return { items: await this.repository.recentActivity(Number(limit), actorId) };
  }

  async receivables(actorId: string) {
    if (!(await this.repository.isAdmin(actorId))) {
      throw new ForbiddenException('Créances réservées au super administrateur.');
    }
    const groups = await this.repository.receivables(actorId);
    const total = groups.reduce((sum, group) => sum + cents(group.total), 0n);
    const paid = groups.reduce((sum, group) => sum + cents(group.paid), 0n);
    const credited = groups.reduce((sum, group) => sum + cents(group.credited ?? '0.00'), 0n);
    const outstanding = groups.reduce(
      (sum, group) =>
        sum +
        (group.outstanding === undefined ? cents(group.total) - cents(group.paid) : cents(group.outstanding)),
      0n,
    );
    const overpaid = groups.reduce((sum, group) => sum + cents(group.overpaid ?? '0.00'), 0n);
    return {
      currency: 'XOF',
      basis: 'ACTIVE_SALES_ORDERS_NET_OF_CREDITS',
      orders: groups.reduce((sum, group) => sum + group.count, 0),
      unpaidOrders: groups.find((group) => group.status === 'UNPAID')?.count ?? 0,
      partiallyPaidOrders: groups.find((group) => group.status === 'PARTIALLY_PAID')?.count ?? 0,
      paidOrders: groups.find((group) => group.status === 'PAID')?.count ?? 0,
      total: money(total),
      paid: money(paid),
      credited: money(credited),
      netTotal: money(total - credited),
      outstanding: money(outstanding),
      overpaid: money(overpaid),
      overpaidOrders: groups.find((group) => group.status === 'OVERPAID')?.count ?? 0,
    };
  }

  async period(actorId: string, month: string) {
    if (!/^20[0-9]{2}-(0[1-9]|1[0-2])$/.test(month)) {
      throw new BadRequestException('Mois invalide. Format attendu : AAAA-MM.');
    }
    if (!(await this.repository.isAdmin(actorId))) {
      throw new ForbiddenException('Statistiques financières réservées au super administrateur.');
    }
    const [year, selected] = month.split('-').map(Number);
    const start = new Date(Date.UTC(year, selected - 1, 1));
    const previous = new Date(Date.UTC(year, selected - 2, 1));
    const end = new Date(Date.UTC(year, selected, 1));
    const events = await this.repository.periodEvents(previous, end, actorId);
    const totals = () => ({ revenue: 0n, collected: 0n, orders: 0 });
    const current = totals();
    const prior = totals();
    const days = Array.from({ length: new Date(end.getTime() - 1).getUTCDate() }, () => totals());
    for (const event of events) {
      const target = event.date < start ? prior : current;
      const value = cents(event.amount);
      const day = event.date >= start ? days[event.date.getUTCDate() - 1] : undefined;
      for (const item of day ? [target, day] : [target]) {
        if (event.kind === 'invoice') item.revenue += value;
        if (event.kind === 'credit') item.revenue -= value;
        if (event.kind === 'payment') item.collected += value;
        if (event.kind === 'reversal') item.collected -= value;
        if (event.kind === 'order') item.orders += event.count;
      }
    }
    const variation = (value: bigint, before: bigint): string | null => {
      if (before <= 0n) return null;
      const difference = (value - before) * 1000n;
      const absolute = difference < 0n ? -difference : difference;
      const rounded = (absolute + before / 2n) / before;
      return (difference < 0n && rounded !== 0n ? '-' : '') + String(rounded / 10n) + '.' + String(rounded % 10n);
    };
    return {
      month,
      currency: 'XOF',
      basis: 'NET_ISSUED_INVOICES_AND_RECORDED_PAYMENTS',
      comparison: 'PREVIOUS_CALENDAR_MONTH',
      revenue: money(current.revenue),
      collected: money(current.collected),
      orders: current.orders,
      variations: {
        revenue: variation(current.revenue, prior.revenue),
        collected: variation(current.collected, prior.collected),
        orders: variation(BigInt(current.orders), BigInt(prior.orders)),
      },
      days: days.map((day, index) => ({
        day: index + 1,
        revenue: money(day.revenue),
        orders: day.orders,
      })),
    };
  }

  async monthlyRevenue(actorId: string, year: string) {
    if (!/^(20[0-9]{2}|2100)$/.test(year)) {
      throw new BadRequestException('Année invalide.');
    }
    if (!(await this.repository.isAdmin(actorId))) {
      throw new ForbiddenException('Statistiques financières réservées au super administrateur.');
    }
    const invoices = await this.repository.monthlyInvoices(Number(year), actorId);
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
    const data = await this.repository.snapshot(actorId);
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
