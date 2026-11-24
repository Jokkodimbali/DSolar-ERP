export interface ProformaInput {
  number?: string;
  customerId: string;
  expiresAt?: string;
  lines: Array<{
    productId: string;
    storeId: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    taxRate: number;
  }>;
}
export const PROFORMAS_REPOSITORY = Symbol('PROFORMAS_REPOSITORY');
export interface ProformasRepository {
  list(actorId: string): Promise<unknown[]>;
  find(id: string, actorId: string): Promise<{ status: string; expiresAt: Date | null } | null>;
  create(input: ProformaInput, actorId: string): Promise<unknown>;
  issue(id: string, actorId: string): Promise<unknown>;
  update(id: string, input: ProformaInput, actorId: string): Promise<unknown>;
  transition(
    id: string,
    from: string,
    to: 'ACCEPTED' | 'CANCELLED' | 'EXPIRED',
    actorId: string,
  ): Promise<unknown>;
}
