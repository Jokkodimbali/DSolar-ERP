import { CreateProduct, ProductRecord, UpdateProduct } from '../domain/product';
export interface ProductSearch {
  page?: number; limit?: number; search?: string; active?: boolean;
  categoryId?: string; brandId?: string; taxRegimeId?: string; isSolarPlant?: boolean;
}
import { PageResult } from '../../../infrastructure/http/page-query.dto';

export const PRODUCT_REPOSITORY = Symbol('PRODUCT_REPOSITORY');
export interface ProductRepository {
  list(active?: boolean): Promise<ProductRecord[]>;
  search(query: ProductSearch): Promise<PageResult<ProductRecord>>;
  findById(id: string): Promise<ProductRecord | null>;
  findBySku(sku: string): Promise<ProductRecord | null>;
  create(input: CreateProduct): Promise<ProductRecord>;
  update(id: string, input: UpdateProduct): Promise<ProductRecord>;
  setActive(id: string, active: boolean): Promise<ProductRecord>;
}
