export const TREASURY = Symbol('TREASURY');

export interface TreasuryPort {
  list(actor: string): Promise<unknown>;
  create(store: string, name: string, actor: string): Promise<unknown>;
  open(register: string, amount: string, actor: string): Promise<unknown>;
  move(session: string, amount: string, reason: string, key: string, actor: string): Promise<unknown>;
  close(session: string, counted: string, actor: string): Promise<unknown>;
}
