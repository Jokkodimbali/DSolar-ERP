import { ListCriteria, Page } from '../../../shared/pagination';
export const PROCUREMENT_SEARCH = Symbol('PROCUREMENT_SEARCH');
export type ProcurementKind = 'suppliers' | 'purchase-orders' | 'receipts';
export interface ProcurementCriteria extends ListCriteria {
  active?: boolean;
  status?: string;
  supplierId?: string;
  storeId?: string;
}
export interface ProcurementSearchPort {
  search(kind: ProcurementKind, actorId: string, query: ProcurementCriteria): Promise<Page<unknown>>;
}
