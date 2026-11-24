import { ListCriteria, Page } from '../../../shared/pagination';
export const OPERATIONAL_SEARCH = Symbol('OPERATIONAL_SEARCH');
export type OperationalKind =
  | 'stores'
  | 'users'
  | 'stocks'
  | 'transfers'
  | 'counts'
  | 'expenses'
  | 'returns'
  | 'registers'
  | 'entries'
  | 'bank-statements'
  | 'categories'
  | 'brands'
  | 'tax-regimes'
  | 'price-history'
  | 'stock-movements'
  | 'accounts'
  | 'journals'
  | 'periods'
  | 'bank-accounts'
  | 'cash-sessions'
  | 'cash-movements'
  | 'bank-lines';
export interface OperationalCriteria extends ListCriteria {
  status?: string;
  storeId?: string;
  periodId?: string;
  productId?: string;
  registerId?: string;
  sessionId?: string;
  statementId?: string;
}
export interface OperationalSearchPort {
  search(kind: OperationalKind, actorId: string, query: OperationalCriteria): Promise<Page<unknown>>;
}
