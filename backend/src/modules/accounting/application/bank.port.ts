import { BankStatementInput } from '../domain/bank-policy';
import { ReconciliationSnapshot } from '../domain/bank-suggestions';

export const BANK_RECONCILIATION = Symbol('BANK_RECONCILIATION');

export interface BankPort {
  createAccount(accountId: string, name: string, actor: string): Promise<unknown>;
  accounts(actor: string): Promise<unknown>;
  importStatement(input: BankStatementInput, actor: string): Promise<unknown>;
  statements(bankAccountId: string, actor: string): Promise<unknown>;
  detail(id: string, actor: string): Promise<unknown>;
  suggestionSnapshot(id: string, actor: string): Promise<ReconciliationSnapshot>;
  match(lineId: string, ledgerLineId: string, actor: string): Promise<unknown>;
  unmatch(lineId: string, actor: string): Promise<unknown>;
  close(id: string, actor: string): Promise<unknown>;
}
