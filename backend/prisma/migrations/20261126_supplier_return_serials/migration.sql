ALTER TABLE "SerialNumber" ADD COLUMN "receiptLineId" UUID;
ALTER TABLE "SerialNumber" ADD CONSTRAINT "SerialNumber_receiptLineId_fkey" FOREIGN KEY ("receiptLineId") REFERENCES "GoodsReceiptLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "SupplierReturnSerial" (
  "returnLineId" UUID NOT NULL REFERENCES "SupplierReturnLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "serialId" UUID NOT NULL REFERENCES "SerialNumber"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  PRIMARY KEY ("returnLineId", "serialId")
);
CREATE INDEX "SupplierReturnSerial_serialId_idx" ON "SupplierReturnSerial" ("serialId");
