-- Preserve historical records. Existing open inventories must be cancelled and restarted.
ALTER TABLE "StoreStock" ADD COLUMN "physicalRevision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "InventoryLine" ADD COLUMN "expectedStockRevision" INTEGER;

CREATE FUNCTION dsolar_stock_physical_revision() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.quantity IS DISTINCT FROM OLD.quantity THEN
    NEW."physicalRevision" := OLD."physicalRevision" + 1;
  ELSE
    NEW."physicalRevision" := OLD."physicalRevision";
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER dsolar_stock_physical_revision
BEFORE UPDATE ON "StoreStock"
FOR EACH ROW EXECUTE FUNCTION dsolar_stock_physical_revision();

ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_distinct_stores"
  CHECK ("originId" <> "destinationId");
ALTER TABLE "StockTransferLine" ADD CONSTRAINT "StockTransferLine_quantities_valid"
  CHECK (quantity > 0 AND "receivedQuantity" >= 0 AND "damagedQuantity" >= 0
    AND "missingQuantity" >= 0 AND "receivedQuantity" + "damagedQuantity" + "missingQuantity" <= quantity);
ALTER TABLE "InventoryLine" ADD CONSTRAINT "InventoryLine_quantities_valid"
  CHECK (expected >= 0 AND (counted IS NULL OR counted >= 0));
ALTER TABLE "InventorySession" ADD CONSTRAINT "InventorySession_status_valid"
  CHECK (status IN ('DRAFT', 'VALIDATED', 'CANCELLED'));
CREATE UNIQUE INDEX "InventorySession_one_open_per_store"
  ON "InventorySession" ("storeId") WHERE status = 'DRAFT';
CREATE INDEX "StockMovement_storeId_createdAt_idx" ON "StockMovement" ("storeId", "createdAt");
CREATE INDEX "StockTransfer_originId_createdAt_idx" ON "StockTransfer" ("originId", "createdAt");
CREATE INDEX "StockTransfer_destinationId_createdAt_idx" ON "StockTransfer" ("destinationId", "createdAt");
CREATE INDEX "InventorySession_storeId_startedAt_idx" ON "InventorySession" ("storeId", "startedAt");
