export interface CustomerInput {
  name: string;
  taxId?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}
export interface CustomerRecord extends CustomerInput {
  id: string;
  createdAt: Date;
}
export interface CustomerCreationKey {
  key: string;
  fingerprint: string;
}
export const CUSTOMERS_REPOSITORY = Symbol('CUSTOMERS_REPOSITORY');
export interface CustomersRepository {
  list(): Promise<CustomerRecord[]>;
  find(id: string): Promise<CustomerRecord | null>;
  create(input: CustomerInput, actorId: string, operation?: CustomerCreationKey): Promise<CustomerRecord>;
  update(id: string, input: Partial<CustomerInput>, actorId: string): Promise<CustomerRecord>;
}
