import { ListCriteria, Page } from '../../../shared/pagination';
export const OPERATIONAL_SEARCH = Symbol('OPERATIONAL_SEARCH');
export type OperationalKind = 'stores' | 'users' | 'stocks' | 'transfers' | 'counts' | 'expenses' | 'returns' | 'registers' | 'entries' | 'bank-statements';
export interface OperationalCriteria extends ListCriteria {
  status?: string;
  storeId?: string;
  periodId?: string;
}
export interface OperationalSearchPort {
  search(kind: OperationalKind, actorId: string, query: OperationalCriteria): Promise<Page<unknown>>;
}
