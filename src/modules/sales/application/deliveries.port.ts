export const DELIVERIES_REPOSITORY = Symbol('DELIVERIES_REPOSITORY');

export interface DeliveriesRepository {
  list(orderId: string, actorId: string): Promise<unknown[]>;
  find(orderId: string, deliveryId: string, actorId: string): Promise<unknown | null>;
}
