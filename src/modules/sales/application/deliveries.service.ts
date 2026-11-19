import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DELIVERIES_REPOSITORY, DeliveriesRepository } from './deliveries.port';

@Injectable()
export class DeliveriesService {
  constructor(
    @Inject(DELIVERIES_REPOSITORY) private readonly deliveries: DeliveriesRepository,
  ) {}

  list(orderId: string, actorId: string) {
    return this.deliveries.list(orderId, actorId);
  }

  async get(orderId: string, deliveryId: string, actorId: string) {
    const delivery = await this.deliveries.find(orderId, deliveryId, actorId);
    if (!delivery) throw new NotFoundException('Bon de livraison introuvable ou non autorisé.');
    return delivery;
  }
}
