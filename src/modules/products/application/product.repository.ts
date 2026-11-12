import { CreateProduct, ProductRecord, UpdateProduct } from '../domain/product';
export const PRODUCT_REPOSITORY = Symbol('PRODUCT_REPOSITORY');
export interface ProductRepository {
  list(active?: boolean): Promise<ProductRecord[]>;
  findById(id: string): Promise<ProductRecord | null>;
  findBySku(sku: string): Promise<ProductRecord | null>;
  create(input: CreateProduct): Promise<ProductRecord>;
  update(id: string, input: UpdateProduct): Promise<ProductRecord>;
  setActive(id: string, active: boolean): Promise<ProductRecord>;
}
