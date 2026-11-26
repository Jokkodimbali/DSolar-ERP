import { Inject, Injectable } from '@nestjs/common';
import { CreditAllocation } from '../domain/credit-tax';
import { CREDIT_NOTES_REPOSITORY, CreditNotesRepository } from './credit-notes.port';

@Injectable()
export class CreditNotesService {
  constructor(@Inject(CREDIT_NOTES_REPOSITORY) private readonly creditNotes: CreditNotesRepository) {}

  list(invoiceId: string, actorId: string) {
    return this.creditNotes.list(invoiceId, actorId);
  }

  preview(invoiceId: string, actorId: string, lines: CreditAllocation[]) {
    return this.creditNotes.preview(invoiceId, actorId, lines);
  }

  issue(
    invoiceId: string,
    actorId: string,
    amount: string,
    reason: string,
    lines?: CreditAllocation[],
    operationKey?: string,
  ) {
    if (operationKey) return this.creditNotes.issue(invoiceId, actorId, amount, reason, lines, operationKey);
    return lines
      ? this.creditNotes.issue(invoiceId, actorId, amount, reason, lines)
      : this.creditNotes.issue(invoiceId, actorId, amount, reason);
  }
}
