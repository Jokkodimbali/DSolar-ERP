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
  create(input: SupplierInput): Promise<SupplierRecord>;
  update(id: string, input: Partial<SupplierInput>): Promise<SupplierRecord>;
  deactivate(id: string): Promise<SupplierRecord>;
}
