export interface DeliveryInput {
  operationKey?: string;
  lines: { storeId: string; productId: string; quantity: string }[];
}
export const DELIVERIES_REPOSITORY = Symbol('DELIVERIES_REPOSITORY');

export interface DeliveriesRepository {
  create(orderId: string, actorId: string, input: DeliveryInput): Promise<unknown>;
  confirm(orderId: string, deliveryId: string, actorId: string): Promise<unknown>;
  cancel(orderId: string, deliveryId: string, actorId: string): Promise<unknown>;
  progress(orderId: string, actorId: string): Promise<unknown>;
  list(orderId: string, actorId: string): Promise<unknown[]>;
  find(orderId: string, deliveryId: string, actorId: string): Promise<unknown | null>;
}
