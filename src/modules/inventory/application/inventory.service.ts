import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { INVENTORY_REPOSITORY, InventoryRepository, StockAdjustment } from './inventory.port';

@Injectable()
export class InventoryService {
  constructor(@Inject(INVENTORY_REPOSITORY) private readonly repository: InventoryRepository) {}
  listStoreStock(storeId: string, actorId: string) {
    return this.repository.listStoreStock(storeId, actorId);
  }
  async stockSummary(storeId: string, actorId: string) {
    const stocks = await this.repository.listStoreStock(storeId, actorId);
    const toMilliunits = (value: string): bigint => {
      const [integer, fraction = ''] = value.split('.');
      return BigInt(integer) * 1000n + BigInt((fraction + '000').slice(0, 3));
    };
    const format = (value: bigint): string => {
      const sign = value < 0n ? '-' : '';
      const absolute = value < 0n ? -value : value;
      return `${sign}${absolute / 1000n}.${String(absolute % 1000n).padStart(3, '0')}`;
    };
    const totalQuantity = stocks.reduce((sum, item) => sum + toMilliunits(item.quantity), 0n);
    const totalReserved = stocks.reduce((sum, item) => sum + toMilliunits(item.reserved), 0n);
    const totalAvailable = stocks.reduce((sum, item) => sum + toMilliunits(item.available), 0n);
    return {
      storeId,
      products: stocks.length,
      outOfStock: stocks.filter((item) => toMilliunits(item.available) <= 0n).length,
      totalQuantity: format(totalQuantity),
      totalReserved: format(totalReserved),
      totalAvailable: format(totalAvailable),
    };
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
