import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { EXPENSES, ExpenseCriteria, ExpensePayment, ExpensesPort, NewExpense } from './expenses.port';

@Injectable()
export class ExpensesService {
  constructor(@Inject(EXPENSES) private readonly repository: ExpensesPort) {}

  private required(value: string, max: number) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
      throw new BadRequestException('Texte invalide.');
    return value.trim();
  }

  categories(actor: string) {
    return this.repository.categories(actor);
  }

  createCategory(name: string, actor: string) {
    return this.repository.createCategory(this.required(name, 100), actor);
  }

  list(actor: string, storeId?: string) {
    return this.repository.list(actor, storeId);
  }

  search(actor: string, query: ExpenseCriteria) {
    return this.repository.search(actor, query);
  }

  create(input: NewExpense, actor: string) {
    if (!/^\d{1,16}(\.\d{1,2})?$/.test(input.amount) || Number(input.amount) <= 0)
      throw new BadRequestException('Montant invalide.');
    return this.repository.create({ ...input, description: this.required(input.description, 500) }, actor);
  }

  approve(id: string, actor: string) {
    return this.repository.approve(id, actor);
  }

  pay(id: string, input: ExpensePayment, actor: string) {
    if (input.method === 'CASH' ? !input.sessionId : !!input.sessionId)
      throw new BadRequestException('Session de caisse incompatible avec le mode de règlement.');
    const reference = input.reference?.trim();
    if (input.method !== 'CASH' && !reference)
      throw new BadRequestException('Référence externe obligatoire.');
    return this.repository.pay(id, { ...input, reference }, actor);
  }

  cancel(id: string, reason: string, actor: string) {
    return this.repository.cancel(id, this.required(reason, 500), actor);
  }

  refund(id: string, reason: string, actor: string) {
    return this.repository.refund(id, this.required(reason, 500), actor);
  }

  summary(actor: string, storeId?: string) {
    return this.repository.summary(actor, storeId);
  }
}
