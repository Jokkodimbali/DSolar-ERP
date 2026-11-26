import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DELIVERIES_REPOSITORY, DeliveryInput, DeliveriesRepository } from './deliveries.port';

@Injectable()
export class DeliveriesService {
  constructor(@Inject(DELIVERIES_REPOSITORY) private readonly deliveries: DeliveriesRepository) {}

  create(orderId: string, actorId: string, input: DeliveryInput) {
    return this.deliveries.create(orderId, actorId, input);
  }

  confirm(orderId: string, deliveryId: string, actorId: string) {
    return this.deliveries.confirm(orderId, deliveryId, actorId);
  }

  cancel(orderId: string, deliveryId: string, actorId: string) {
    return this.deliveries.cancel(orderId, deliveryId, actorId);
  }

  progress(orderId: string, actorId: string) {
    return this.deliveries.progress(orderId, actorId);
  }

  list(orderId: string, actorId: string) {
    return this.deliveries.list(orderId, actorId);
  }

  async get(orderId: string, deliveryId: string, actorId: string) {
    const delivery = await this.deliveries.find(orderId, deliveryId, actorId);
    if (!delivery) throw new NotFoundException('Bon de livraison introuvable ou non autorisé.');
    return delivery;
  }
}
