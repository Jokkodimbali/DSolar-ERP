-- À intégrer dans une migration Prisma générée et revue, PAS à exécuter seul en production.
-- Une seule période tarifaire ouverte par produit.
CREATE UNIQUE INDEX IF NOT EXISTS "ProductPrice_one_open_period" ON "ProductPrice" ("productId") WHERE "validTo" IS NULL;
-- Stock disponible non négatif.
ALTER TABLE "StoreStock" ADD CONSTRAINT "StoreStock_nonnegative" CHECK ("quantity" >= 0 AND "reserved" >= 0 AND "reserved" <= "quantity");
-- Tarification non négative.
ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_nonnegative" CHECK ("salePrice" >= 0 AND ("purchasePrice" IS NULL OR "purchasePrice" >= 0));
