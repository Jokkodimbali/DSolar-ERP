import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
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
