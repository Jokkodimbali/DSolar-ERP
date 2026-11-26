import type { ListCriteria } from '../../../shared/pagination';

export interface SupplierReturnCriteria extends ListCriteria {
  storeId?: string;
  status?: 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
}

export const SUPPLIER_RETURNS = Symbol('SUPPLIER_RETURNS');

export interface ReturnInput {
  receiptId: string;
  operationKey: string;
  reason: string;
  lines: { receiptLineId: string; quantity: string; serialIds?: string[] }[];
}

export interface SupplierReturnsPort {
  registerSerials(receiptLineId: string, serials: string[], actor: string): Promise<unknown>;
  create(input: ReturnInput, actor: string): Promise<unknown>;
  list(actor: string, storeId?: string): Promise<unknown>;
  search(actor: string, criteria: SupplierReturnCriteria): Promise<unknown>;
  get(id: string, actor: string): Promise<unknown>;
  receiptOptions(id: string, actor: string): Promise<unknown>;
  availableSerials(id: string, actor: string, criteria: ListCriteria): Promise<unknown>;
  confirm(id: string, actor: string): Promise<unknown>;
  cancel(id: string, reason: string, actor: string): Promise<unknown>;
  credit(id: string, reference: string, actor: string): Promise<unknown>;
}
