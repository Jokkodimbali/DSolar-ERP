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
  progress(id: string) {
    return this.orders.progress(id);
  }
  async create(input: PurchaseOrderInput) {
    const number = input.number.trim().toUpperCase();
    if (!number || number.length > 100)
      throw new BadRequestException('Le numéro de commande doit contenir entre 1 et 100 caractères.');
    if (input.lines.length === 0 || input.lines.length > 100)
      throw new BadRequestException('La commande doit contenir entre 1 et 100 lignes.');
    const products = new Set<string>();
    for (const line of input.lines) {
      if (
        !Number.isFinite(line.quantity) ||
        line.quantity <= 0 ||
        !Number.isFinite(line.unitCost) ||
        line.unitCost < 0 ||
        !/^\d+(?:\.\d{1,3})?$/.test(String(line.quantity)) ||
        !/^\d+(?:\.\d{1,2})?$/.test(String(line.unitCost))
      )
        throw new BadRequestException('Quantité ou coût unitaire invalide.');
      if (products.has(line.productId))
        throw new BadRequestException('Un produit ne peut figurer qu’une fois par commande.');
      products.add(line.productId);
    }
    return this.orders.create({ ...input, number });
  }
  async cancel(id: string) {
    const order = await this.get(id);
    if (order.status !== 'DRAFT')
      throw new ConflictException('Seule une commande brouillon peut être annulée.');
    return this.orders.cancel(id);
  }

  async confirm(id: string) {
    const order = await this.get(id);
    if (order.status !== 'DRAFT')
      throw new ConflictException('Seule une commande brouillon peut être confirmée.');
    return this.orders.confirm(id);
  }
}
