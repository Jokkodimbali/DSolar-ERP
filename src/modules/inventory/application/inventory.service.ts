import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { INVENTORY_REPOSITORY, InventoryRepository, StockAdjustment } from './inventory.port';

@Injectable()
export class InventoryService {
  constructor(@Inject(INVENTORY_REPOSITORY) private readonly repository: InventoryRepository) {}
  balance(storeId: string, productId: string, actorId: string) {
    return this.repository.getBalance(storeId, productId, actorId);
  }
  adjust(input: StockAdjustment) {
    if (!/^(?:0|[1-9]\d{0,14})(?:\.\d{1,3})?$/.test(input.quantity) || Number(input.quantity) <= 0) {
      throw new BadRequestException(
        'La quantité doit être strictement positive avec trois décimales maximum.',
      );
    }
    if (!input.reason.trim() || input.reason.trim().length < 5) {
      throw new BadRequestException('Une justification de cinq caractères minimum est obligatoire.');
    }
    return this.repository.adjust({ ...input, reason: input.reason.trim() });
  }
}
