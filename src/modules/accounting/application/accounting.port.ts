import { PostingLine } from '../domain/ledger-policy';

export const ACCOUNTING = Symbol('ACCOUNTING');

export interface PostingInput {
  journalId: string;
  periodId: string;
  date: string;
  description: string;
  operationKey: string;
  lines: PostingLine[];
}

export interface AccountingPort {
  setup(actor: string): Promise<unknown>;
  account(code: string, name: string, actor: string): Promise<unknown>;
  journal(code: string, name: string, actor: string): Promise<unknown>;
  period(name: string, start: string, end: string, actor: string): Promise<unknown>;
  close(periodId: string, actor: string): Promise<unknown>;
  post(input: PostingInput, actor: string): Promise<unknown>;
  reverse(
    id: string,
    periodId: string,
    date: string,
    reason: string,
    key: string,
    actor: string,
  ): Promise<unknown>;
  entries(periodId: string, actor: string, accountId?: string, cursor?: string): Promise<unknown>;
  trialBalance(periodId: string, actor: string): Promise<unknown>;
}
