export const DASHBOARD_REPOSITORY = Symbol('DASHBOARD_REPOSITORY');

export interface DashboardSnapshot {
  stores: number;
  activeProducts: number;
  customers: number;
  suppliers: number;
  confirmedOrders: number;
  pendingPurchaseOrders: number;
  issuedInvoices: number;
  invoiced: string;
  creditNotes: string;
  collected: string;
  stock: Array<{
    storeId: string;
    storeName: string;
    products: number;
    outOfStock: number;
    quantity: string;
    reserved: string;
  }>;
}

export interface DashboardProductRank {
  productId: string;
  sku: string;
  name: string;
  quantity: string;
}

export interface DashboardActivity {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: Date;
}

export interface DashboardStoreSales {
  storeId: string;
  storeName: string;
  quantity: string;
  amount: string;
}

export interface DashboardReceivable {
  status: string;
  total: string;
  paid: string;
  credited?: string;
  outstanding?: string;
  overpaid?: string;
  count: number;
}

export interface DashboardPeriodEvent {
  date: Date;
  kind: 'invoice' | 'credit' | 'payment' | 'reversal' | 'order';
  amount: string;
  count: number;
}

export interface DashboardRepository {
  periodEvents(start: Date, end: Date, actorId: string): Promise<DashboardPeriodEvent[]>;
  isAdmin(actorId: string): Promise<boolean>;
  snapshot(actorId: string): Promise<DashboardSnapshot>;
  monthlyInvoices(year: number, actorId: string): Promise<Array<{ issuedAt: Date; total: string }>>;
  receivables(actorId: string): Promise<DashboardReceivable[]>;
  topProducts(limit: number, actorId: string): Promise<DashboardProductRank[]>;
  recentActivity(limit: number, actorId: string): Promise<DashboardActivity[]>;
  storeSales(actorId: string): Promise<DashboardStoreSales[]>;
  procurement(actorId: string): Promise<Array<{ status: string; count: number }>>;
  stockValuation(
    actorId: string,
  ): Promise<Array<{ storeId: string; storeName: string; valued: string; unvaluedProducts: number }>>;
}
