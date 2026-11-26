export const SALES_REPORT_REPOSITORY = Symbol('SALES_REPORT_REPOSITORY');

export interface SalesReport {
  orders: number;
  totalOrders: string;
  collected: string;
  outstanding: string;
  creditedOrders: string;
  netOrders: string;
  overpaid: string;
  overpaidOrders: number;
  unpaidOrders: number;
  partiallyPaidOrders: number;
  paidOrders: number;
  issuedInvoices: number;
  grossInvoiced: string;
  creditNotesTotal: string;
  netInvoiced: string;
}

export interface SalesReportSnapshot {
  orders: Array<{
    paymentStatus: string;
    count: number;
    total: string;
    amountPaid: string;
    credited: string;
    outstanding: string;
    overpaid: string;
  }>;
  issuedInvoices: number;
  grossInvoiced: string;
  creditNotesTotal: string;
}

export interface SalesReportRepository {
  isActiveAdmin(actorId: string): Promise<boolean>;
  snapshot(actorId: string): Promise<SalesReportSnapshot>;
}
