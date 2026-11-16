import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { CreateReceiptInput, GOODS_RECEIPTS_REPOSITORY, GoodsReceiptsRepository } from './goods-receipts.port';

@Injectable()
export class GoodsReceiptsService {
  constructor(@Inject(GOODS_RECEIPTS_REPOSITORY) private readonly receipts: GoodsReceiptsRepository) {}
  list(actorId: string) { return this.receipts.list(actorId); }
  get(id: string, actorId: string) { return this.receipts.get(id, actorId); }
  async create(input: CreateReceiptInput, actorId: string) {
    const number = input.number.trim().toUpperCase();
    if (!number || !input.lines.length) throw new BadRequestException('Numéro et lignes obligatoires.');
    const seen = new Set<string>();
    for (const line of input.lines) {
      if (!Number.isFinite(line.quantity) || line.quantity <= 0 ||
          !Number.isFinite(line.unitCost) || line.unitCost < 0)
        throw new BadRequestException('Quantité ou coût unitaire invalide.');
      if (seen.has(line.productId)) throw new BadRequestException('Produit en double.');
      seen.add(line.productId);
    }
    return this.receipts.create({ ...input, number }, actorId);
  }
  confirm(id: string, actorId: string) { return this.receipts.confirm(id, actorId); }
}
