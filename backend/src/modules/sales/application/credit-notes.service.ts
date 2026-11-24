import { Inject, Injectable } from '@nestjs/common';
import { CreditAllocation } from '../domain/credit-tax';
import { CREDIT_NOTES_REPOSITORY, CreditNotesRepository } from './credit-notes.port';

@Injectable()
export class CreditNotesService {
  constructor(@Inject(CREDIT_NOTES_REPOSITORY) private readonly creditNotes: CreditNotesRepository) {}

  list(invoiceId: string, actorId: string) {
    return this.creditNotes.list(invoiceId, actorId);
  }

  issue(invoiceId: string, actorId: string, amount: string, reason: string, lines?: CreditAllocation[]) {
    return lines
      ? this.creditNotes.issue(invoiceId, actorId, amount, reason, lines)
      : this.creditNotes.issue(invoiceId, actorId, amount, reason);
  }
}
