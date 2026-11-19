import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ORDERS_REPOSITORY, OrdersRepository } from './orders.port';

@Injectable()
export class OrdersService {
  constructor(@Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository) {}

  list(actorId: string) {
    return this.orders.list(actorId);
  }

  async get(id: string, actorId: string) {
    const order = await this.orders.find(id, actorId);
    if (!order) throw new NotFoundException('Commande introuvable ou non autorisée.');
    return order;
  }

  convert(proformaId: string, actorId: string) {
    return this.orders.convert(proformaId, actorId);
  }
}
