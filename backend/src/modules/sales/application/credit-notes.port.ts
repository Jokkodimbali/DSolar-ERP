import { CreditAllocation } from '../domain/credit-tax';

export const CREDIT_NOTES_REPOSITORY = Symbol('CREDIT_NOTES_REPOSITORY');

export interface CreditNotesRepository {
  list(invoiceId: string, actorId: string): Promise<unknown[]>;
  issue(
    invoiceId: string,
    actorId: string,
    amount: string,
    reason: string,
    lines?: CreditAllocation[],
  ): Promise<unknown>;
}
