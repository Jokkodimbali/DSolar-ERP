export const IMAGE_REPOSITORY = Symbol('IMAGE_REPOSITORY');

export type ImageKind = 'COMPANY_LOGO' | 'PRODUCT_PHOTO';
export type ImageMime = 'image/png' | 'image/jpeg';

export interface ImageInput {
  kind: ImageKind;
  productId?: string;
  mimeType: ImageMime;
  data: Buffer;
}

export interface ImageMetadata {
  id: string;
  mimeType: string;
  createdAt: Date;
}

export interface ImageRepository {
  save(actorId: string, input: ImageInput): Promise<ImageMetadata>;
  get(actorId: string, id: string): Promise<{ mimeType: string; data: Uint8Array } | null>;
  latestProduct(actorId: string, productId: string): Promise<ImageMetadata | null>;
}
