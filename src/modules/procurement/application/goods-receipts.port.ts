export interface ReceiptLineInput {
  productId: string;
  quantity: number;
  unitCost: number;
}
export interface CreateReceiptInput {
  number: string;
  purchaseOrderId: string;
  storeId: string;
  lines: ReceiptLineInput[];
}
export const GOODS_RECEIPTS_REPOSITORY = Symbol('GOODS_RECEIPTS_REPOSITORY');
export interface GoodsReceiptsRepository {
  list(actorId: string): Promise<unknown[]>;
  get(id: string, actorId: string): Promise<unknown>;
  create(input: CreateReceiptInput, actorId: string): Promise<unknown>;
  confirm(id: string, actorId: string): Promise<unknown>;
}
