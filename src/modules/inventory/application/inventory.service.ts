import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { INVENTORY_REPOSITORY, InventoryRepository, StockAdjustment } from './inventory.port';

@Injectable()
export class InventoryService {
  constructor(@Inject(INVENTORY_REPOSITORY) private readonly repository: InventoryRepository) {}
  listStoreStock(storeId: string, actorId: string) {
    return this.repository.listStoreStock(storeId, actorId);
  }
  async stockAlerts(storeId: string, actorId: string, threshold = '5') {
    if (!/^(?:0|[1-9]\d{0,12})(?:\.\d{1,3})?$/.test(threshold)) {
      throw new BadRequestException('Seuil de stock invalide : trois décimales maximum.');
    }
    const toMilliunits = (value: string): bigint => {
      const [integer, fraction = ''] = value.split('.');
      return BigInt(integer) * 1000n + BigInt((fraction + '000').slice(0, 3));
    };
    const limit = toMilliunits(threshold);
    const stocks = await this.repository.listStoreStock(storeId, actorId);
    return {
      storeId,
      threshold,
      items: stocks
        .filter((item) => toMilliunits(item.available) <= limit)
        .map((item) => ({
          ...item,
          severity: toMilliunits(item.available) <= 0n ? 'OUT_OF_STOCK' : 'LOW_STOCK',
        })),
    };
  }
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
