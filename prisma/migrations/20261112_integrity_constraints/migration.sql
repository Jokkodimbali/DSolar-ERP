-- Garanties d'intégrité indispensables aux modules existants.
CREATE UNIQUE INDEX IF NOT EXISTS "ProductPrice_one_open_period" ON "ProductPrice" ("productId") WHERE "validTo" IS NULL;
ALTER TABLE "StoreStock" ADD CONSTRAINT "StoreStock_nonnegative" CHECK ("quantity" >= 0 AND "reserved" >= 0 AND "reserved" <= "quantity");
ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_nonnegative" CHECK ("salePrice" >= 0 AND ("purchasePrice" IS NULL OR "purchasePrice" >= 0));
