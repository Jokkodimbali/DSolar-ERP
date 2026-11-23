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
  count: number;
}

export interface DashboardRepository {
  isAdmin(actorId: string): Promise<boolean>;
  snapshot(): Promise<DashboardSnapshot>;
  monthlyInvoices(year: number): Promise<Array<{ issuedAt: Date; total: string }>>;
  receivables(): Promise<DashboardReceivable[]>;
  topProducts(limit: number): Promise<DashboardProductRank[]>;
  recentActivity(limit: number): Promise<DashboardActivity[]>;
  storeSales(): Promise<DashboardStoreSales[]>;
  procurement(): Promise<Array<{ status: string; count: number }>>;
  stockValuation(): Promise<Array<{ storeId: string; storeName: string; valued: string; unvaluedProducts: number }>>;
}
