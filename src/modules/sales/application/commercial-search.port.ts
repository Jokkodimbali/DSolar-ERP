import { ListCriteria, Page } from '../../../shared/pagination';
export const COMMERCIAL_SEARCH = Symbol('COMMERCIAL_SEARCH');
export type CommercialKind = 'customers' | 'proformas' | 'orders' | 'invoices';
export interface CommercialCriteria extends ListCriteria {
  status?: string;
  customerId?: string;
  storeId?: string;
}
export interface CommercialSearchPort {
  search(kind: CommercialKind, actorId: string, query: CommercialCriteria): Promise<Page<unknown>>;
}
