export const SALES_REPORT_REPOSITORY = Symbol('SALES_REPORT_REPOSITORY');

export interface SalesReport {
  orders: number;
  totalOrders: string;
  collected: string;
  outstanding: string;
  unpaidOrders: number;
  partiallyPaidOrders: number;
  paidOrders: number;
}

export interface SalesReportRepository {
  summary(actorId: string): Promise<SalesReport>;
}
