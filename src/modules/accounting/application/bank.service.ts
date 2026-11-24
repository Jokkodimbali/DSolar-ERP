import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { BANK_RECONCILIATION, BankPort } from './bank.port';
import { BankStatementInput, validateStatement } from '../domain/bank-policy';

@Injectable()
export class BankService {
  constructor(@Inject(BANK_RECONCILIATION) private readonly repository: BankPort) {}

  private text(value: string, max: number) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
      throw new BadRequestException('Texte bancaire invalide.');
    return value.trim();
  }

  createAccount(id: string, name: string, actor: string) {
    return this.repository.createAccount(id, this.text(name, 160), actor);
  }

  accounts(actor: string) {
    return this.repository.accounts(actor);
  }

  importStatement(input: BankStatementInput, actor: string) {
    const normalized = {
      ...input,
      reference: this.text(input.reference, 100),
      lines: input.lines.map((line) => ({
        ...line,
        reference: this.text(line.reference, 100),
        description: this.text(line.description, 500),
      })),
    };
    try {
      validateStatement(normalized);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Relevé invalide.');
    }
    return this.repository.importStatement(normalized, actor);
  }

  statements(id: string, actor: string) {
    return this.repository.statements(id, actor);
  }

  detail(id: string, actor: string) {
    return this.repository.detail(id, actor);
  }

  match(id: string, ledgerLineId: string, actor: string) {
    return this.repository.match(id, ledgerLineId, actor);
  }

  unmatch(id: string, actor: string) {
    return this.repository.unmatch(id, actor);
  }

  close(id: string, actor: string) {
    return this.repository.close(id, actor);
  }
}
