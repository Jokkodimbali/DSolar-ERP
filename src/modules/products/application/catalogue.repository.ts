export const CATALOGUE_REPOSITORY = Symbol('CATALOGUE_REPOSITORY');
export type ReferenceKind = 'category' | 'brand' | 'taxRegime';
export interface ReferenceRecord {
  id: string;
  code?: string;
  name: string;
}
export interface TaxRegimeRecord extends ReferenceRecord {
  rate: unknown;
  legalBasis: string | null;
  validFrom: Date | null;
  validTo: Date | null;
}
export interface PriceRecord {
  id: string;
  productId: string;
  purchasePrice: unknown;
  salePrice: unknown;
  validFrom: Date;
  validTo: Date | null;
}
export interface CatalogueRepository {
  listReferences(kind: ReferenceKind): Promise<ReferenceRecord[]>;
  findReference(kind: ReferenceKind, id: string): Promise<ReferenceRecord | null>;
  createCategory(input: { code: string; name: string; parentId?: string }): Promise<ReferenceRecord>;
  createBrand(input: { name: string }): Promise<ReferenceRecord>;
  createTaxRegime(input: {
    code: string;
    name: string;
    rate: string;
    legalBasis?: string;
  }): Promise<TaxRegimeRecord>;
  listPrices(productId: string): Promise<PriceRecord[]>;
  setPrice(input: {
    productId: string;
    purchasePrice?: string;
    salePrice: string;
    validFrom: Date;
  }): Promise<PriceRecord>;
}
