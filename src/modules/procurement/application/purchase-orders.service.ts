import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PurchaseOrdersRepository, PurchaseOrderInput } from './purchase-orders.repository';

@Injectable()
export class PurchaseOrdersService {
  constructor(private readonly orders: PurchaseOrdersRepository) {}
  list() {
    return this.orders.list();
  }
  async get(id: string) {
    const order = await this.orders.find(id);
    if (!order) throw new NotFoundException('Commande fournisseur introuvable.');
    return order;
  }
  async create(input: PurchaseOrderInput) {
    const number = input.number.trim().toUpperCase();
    if (!number) throw new BadRequestException('Numéro de commande obligatoire.');
    if (input.lines.length === 0) throw new BadRequestException('Au moins une ligne est obligatoire.');
    const products = new Set<string>();
    for (const line of input.lines) {
      if (
        !Number.isFinite(line.quantity) ||
        line.quantity <= 0 ||
        !Number.isFinite(line.unitCost) ||
        line.unitCost < 0
      )
        throw new BadRequestException('Quantité ou coût unitaire invalide.');
      if (products.has(line.productId))
        throw new BadRequestException('Un produit ne peut figurer qu’une fois par commande.');
      products.add(line.productId);
    }
    return this.orders.create({ ...input, number });
  }
  async confirm(id: string) {
    const order = await this.get(id);
    if (order.status !== 'DRAFT')
      throw new ConflictException('Seule une commande brouillon peut être confirmée.');
    return this.orders.confirm(id);
  }
}
