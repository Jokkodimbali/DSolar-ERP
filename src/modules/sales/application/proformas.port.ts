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
  list(): Promise<unknown[]>;
  find(id: string): Promise<{ status: string; expiresAt: Date | null } | null>;
  create(input: ProformaInput): Promise<unknown>;
  issue(id: string): Promise<unknown>;
  update(id: string, input: ProformaInput): Promise<unknown>;
  transition(id: string, from: string, to: 'ACCEPTED' | 'CANCELLED' | 'EXPIRED'): Promise<unknown>;
}
