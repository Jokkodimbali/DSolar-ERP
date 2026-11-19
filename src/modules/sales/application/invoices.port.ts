export const INVOICES_REPOSITORY = Symbol('INVOICES_REPOSITORY');

export interface InvoicesRepository {
  list(actorId: string): Promise<unknown[]>;
  find(id: string, actorId: string): Promise<unknown | null>;
  createFromOrder(orderId: string, actorId: string): Promise<unknown>;
  issue(id: string, actorId: string): Promise<unknown>;
  cancel(id: string, actorId: string): Promise<unknown>;
}
