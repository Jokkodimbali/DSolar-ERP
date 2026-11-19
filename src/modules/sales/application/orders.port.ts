export const ORDERS_REPOSITORY = Symbol('ORDERS_REPOSITORY');

export interface OrdersRepository {
  list(actorId: string): Promise<unknown[]>;
  find(id: string, actorId: string): Promise<unknown | null>;
  convert(proformaId: string, actorId: string): Promise<unknown>;
  confirm(id: string, actorId: string): Promise<unknown>;
  cancel(id: string, actorId: string): Promise<unknown>;
}
