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
export interface InventoryRepository {
  getBalance(storeId: string, productId: string, actorId: string): Promise<StockBalance>;
  adjust(command: StockAdjustment): Promise<StockBalance>;
}
