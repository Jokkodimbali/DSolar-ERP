import type { ListCriteria } from '../../../shared/pagination';

export const TREASURY = Symbol('TREASURY');

export interface TreasuryPort {
  list(actor: string): Promise<unknown>;
  sessions(register: string, actor: string, query: ListCriteria): Promise<unknown>;
  movements(session: string, actor: string, query: ListCriteria): Promise<unknown>;
  candidates(session: string, actor: string, query: ListCriteria): Promise<unknown>;
  create(store: string, name: string, actor: string): Promise<unknown>;
  open(register: string, amount: string, actor: string): Promise<unknown>;
  move(session: string, amount: string, reason: string, key: string, actor: string): Promise<unknown>;
  transfer(from: string, to: string, amount: string, key: string, actor: string): Promise<unknown>;
  reverse(id: string, reason: string, key: string, actor: string): Promise<unknown>;
  reconcile(session: string, payment: string, key: string, actor: string): Promise<unknown>;
  summary(session: string, actor: string): Promise<unknown>;
  close(session: string, counted: string, actor: string): Promise<unknown>;
}
