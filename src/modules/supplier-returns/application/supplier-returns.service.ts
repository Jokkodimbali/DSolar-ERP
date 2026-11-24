import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { validReturnQuantity } from '../domain/return-policy';
import { ReturnInput, SUPPLIER_RETURNS, SupplierReturnsPort } from './supplier-returns.port';

@Injectable()
export class SupplierReturnsService {
  constructor(@Inject(SUPPLIER_RETURNS) private readonly repository: SupplierReturnsPort) {}

  private text(value: string, max: number) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
      throw new BadRequestException('Texte invalide.');
    return value.trim();
  }

  create(input: ReturnInput, actor: string) {
    if (
      !input.lines.length ||
      input.lines.length > 100 ||
      new Set(input.lines.map((line) => line.receiptLineId)).size !== input.lines.length ||
      input.lines.some((line) => !validReturnQuantity(line.quantity))
    )
      throw new BadRequestException('Lignes de retour invalides.');
    return this.repository.create({ ...input, reason: this.text(input.reason, 500) }, actor);
  }

  list(actor: string, storeId?: string) {
    return this.repository.list(actor, storeId);
  }

  get(id: string, actor: string) {
    return this.repository.get(id, actor);
  }

  confirm(id: string, actor: string) {
    return this.repository.confirm(id, actor);
  }

  cancel(id: string, reason: string, actor: string) {
    return this.repository.cancel(id, this.text(reason, 500), actor);
  }

  credit(id: string, reference: string, actor: string) {
    return this.repository.credit(id, this.text(reference, 100), actor);
  }
}
