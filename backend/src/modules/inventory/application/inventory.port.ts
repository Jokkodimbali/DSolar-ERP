import type { ListCriteria, Page } from '../../../shared/pagination';
export const INVENTORY_REPOSITORY = Symbol('INVENTORY_REPOSITORY');
export interface StockBalance {
  storeId: string;
  productId: string;
  quantity: string;
  reserved: string;
  available: string;
}
export interface StockAdjustment {
  storeId: string;
  productId: string;
  quantity: string;
  direction: 'IN' | 'OUT';
  reason: string;
  operationKey: string;
  actorId: string;
}
export interface StoreStockItem extends StockBalance {
  sku: string;
  name: string;
  unit: string;
}
export interface StockMovementItem {
  id: string;
  storeId: string;
  productId: string;
  name: string;
  sku: string;
  unit: string;
  type: string;
  quantity: string;
  referenceType: string;
  reason: string | null;
  createdAt: Date;
}

export type StockSearch = ListCriteria & { availability?: 'ALL' | 'AVAILABLE' | 'RESERVED' | 'EMPTY' };

export interface InventoryRepository {
  searchStock(storeId: string, actorId: string, query: StockSearch): Promise<Page<StoreStockItem>>;
  movements(storeId: string, actorId: string, query: ListCriteria): Promise<Page<StockMovementItem>>;
  listStoreStock(storeId: string, actorId: string): Promise<StoreStockItem[]>;
  getBalance(storeId: string, productId: string, actorId: string): Promise<StockBalance>;
  adjust(command: StockAdjustment): Promise<StockBalance>;
}
