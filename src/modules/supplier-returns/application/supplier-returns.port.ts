export const SUPPLIER_RETURNS = Symbol('SUPPLIER_RETURNS');

export interface ReturnInput {
  receiptId: string;
  operationKey: string;
  reason: string;
  lines: { receiptLineId: string; quantity: string }[];
}

export interface SupplierReturnsPort {
  create(input: ReturnInput, actor: string): Promise<unknown>;
  list(actor: string, storeId?: string): Promise<unknown>;
  get(id: string, actor: string): Promise<unknown>;
  confirm(id: string, actor: string): Promise<unknown>;
  cancel(id: string, reason: string, actor: string): Promise<unknown>;
  credit(id: string, reference: string, actor: string): Promise<unknown>;
}
