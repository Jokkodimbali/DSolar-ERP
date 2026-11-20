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

export interface DashboardRepository {
  isAdmin(actorId: string): Promise<boolean>;
  snapshot(): Promise<DashboardSnapshot>;
}
