CREATE TABLE "ImageAsset" (
  "id" UUID PRIMARY KEY,
  "kind" VARCHAR(20) NOT NULL,
  "productId" UUID REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "mimeType" VARCHAR(20) NOT NULL CHECK ("mimeType" IN ('image/png','image/jpeg')),
  "data" BYTEA NOT NULL CHECK (octet_length("data") BETWEEN 1 AND 2097152),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ImageAsset_scope_check" CHECK (("kind" = 'COMPANY_LOGO' AND "productId" IS NULL) OR
    ("kind" = 'PRODUCT_PHOTO' AND "productId" IS NOT NULL))
);
CREATE INDEX "ImageAsset_productId_createdAt_id_idx" ON "ImageAsset"("productId","createdAt","id");
CREATE TRIGGER image_asset_immutable BEFORE UPDATE OR DELETE ON "ImageAsset"
FOR EACH ROW EXECUTE FUNCTION company_settings_immutable();
CREATE TRIGGER image_asset_no_truncate BEFORE TRUNCATE ON "ImageAsset"
FOR EACH STATEMENT EXECUTE FUNCTION company_settings_immutable();
