import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { CountLineInput, STOCK_COUNT_REPOSITORY, StockCountRepository } from './stock-count.port';

const quantityPattern = /^(?:0|[1-9]\d{0,14})(?:\.\d{1,3})?$/;

@Injectable()
export class StockCountService {
  constructor(@Inject(STOCK_COUNT_REPOSITORY) private readonly repository: StockCountRepository) {}

  start(storeId: string, actorId: string) {
    return this.repository.start(storeId, actorId);
  }

  get(id: string, actorId: string) {
    return this.repository.get(id, actorId);
  }

  record(id: string, actorId: string, lines: CountLineInput[]) {
    if (!lines.length || lines.length > 100) {
      throw new BadRequestException('Entre 1 et 100 lignes de comptage sont requises.');
    }
    const ids = new Set<string>();
    for (const line of lines) {
      if (ids.has(line.productId)) {
        throw new BadRequestException('Produit présent plusieurs fois dans le comptage.');
      }
      ids.add(line.productId);
      if (!quantityPattern.test(line.counted)) {
        throw new BadRequestException('Quantité comptée invalide (trois décimales maximum).');
      }
      if (line.reason && line.reason.length > 500) {
        throw new BadRequestException('Justification trop longue.');
      }
    }
    return this.repository.record(id, actorId, lines);
  }

  cancel(id: string, actorId: string) {
    return this.repository.cancel(id, actorId);
  }

  validate(id: string, actorId: string) {
    return this.repository.validate(id, actorId);
  }
}
