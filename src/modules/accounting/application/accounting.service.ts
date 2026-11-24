import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { assertBalanced, calendarDate } from '../domain/ledger-policy';
import { PostingRuleInput, SourceType, validRuleKey } from '../domain/source-types';
import { ACCOUNTING, AccountingPort, PostingInput } from './accounting.port';

@Injectable()
export class AccountingService {
  constructor(@Inject(ACCOUNTING) private readonly repository: AccountingPort) {}

  private text(value: string, max: number) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
      throw new BadRequestException('Texte invalide.');
    return value.trim();
  }

  private validate(work: () => void) {
    try {
      work();
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Données invalides.');
    }
  }

  rule(input: PostingRuleInput, actor: string) {
    if (!validRuleKey(input.key)) throw new BadRequestException('Clé de règle invalide.');
    const ids = [input.debitAccountId, input.creditAccountId, ...(input.taxAccountId ? [input.taxAccountId] : [])];
    if (new Set(ids).size !== ids.length || (input.taxAccountId && input.key !== 'INVOICE'))
      throw new BadRequestException('Comptes distincts requis ; taxe réservée aux factures.');
    return this.repository.rule(input, actor);
  }

  postSource(type: SourceType, id: string, actor: string) {
    return this.repository.postSource(type, id, actor);
  }

  setup(actor: string) {
    return this.repository.setup(actor);
  }

  account(code: string, name: string, actor: string) {
    return this.repository.account(this.text(code, 30), this.text(name, 160), actor);
  }

  journal(code: string, name: string, actor: string) {
    return this.repository.journal(this.text(code, 30), this.text(name, 160), actor);
  }

  period(name: string, start: string, end: string, actor: string) {
    this.validate(() => {
      if (calendarDate(start) > calendarDate(end)) throw new Error('Période invalide.');
    });
    return this.repository.period(this.text(name, 100), start, end, actor);
  }

  close(id: string, actor: string) {
    return this.repository.close(id, actor);
  }

  post(input: PostingInput, actor: string) {
    this.validate(() => {
      calendarDate(input.date);
      assertBalanced(input.lines);
    });
    return this.repository.post({ ...input, description: this.text(input.description, 500) }, actor);
  }

  reverse(id: string, periodId: string, date: string, reason: string, key: string, actor: string) {
    this.validate(() => {
      calendarDate(date);
    });
    return this.repository.reverse(id, periodId, date, this.text(reason, 500), key, actor);
  }

  entries(periodId: string, actor: string, accountId?: string, cursor?: string) {
    return this.repository.entries(periodId, actor, accountId, cursor);
  }

  trialBalance(periodId: string, actor: string) {
    return this.repository.trialBalance(periodId, actor);
  }
}
