export const SUPPLIERS_REPOSITORY = Symbol('SUPPLIERS_REPOSITORY');
export type SupplierInput = {
  name: string;
  taxId?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
};
export type SupplierRecord = SupplierInput & { id: string; active: boolean };
export interface SuppliersRepository {
  list(): Promise<SupplierRecord[]>;
  find(id: string): Promise<SupplierRecord | null>;
  create(input: SupplierInput, actorId: string): Promise<SupplierRecord>;
  update(id: string, input: Partial<SupplierInput>, actorId: string): Promise<SupplierRecord>;
  deactivate(id: string, actorId: string): Promise<SupplierRecord>;
  activate(id: string, actorId: string): Promise<SupplierRecord>;
}
