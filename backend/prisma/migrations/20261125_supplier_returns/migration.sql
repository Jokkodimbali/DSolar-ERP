CREATE TYPE "SupplierReturnStatus" AS ENUM ('DRAFT','CONFIRMED','CANCELLED');
CREATE TABLE "SupplierReturn" (
  "id" UUID PRIMARY KEY,
  "receiptId" UUID NOT NULL REFERENCES "GoodsReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "operationKey" UUID NOT NULL UNIQUE,
  "reason" VARCHAR(500) NOT NULL,
  "status" "SupplierReturnStatus" NOT NULL DEFAULT 'DRAFT',
  "total" DECIMAL(18,2) NOT NULL CHECK ("total" >= 0),
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedBy" UUID,
  "confirmedAt" TIMESTAMP(3),
  "cancelledBy" UUID,
  "cancelledAt" TIMESTAMP(3),
  "cancellationReason" VARCHAR(500),
  CHECK ("status" <> 'CONFIRMED' OR ("confirmedBy" IS NOT NULL AND "confirmedAt" IS NOT NULL)),
  CHECK ("status" <> 'CANCELLED' OR ("cancelledBy" IS NOT NULL AND "cancelledAt" IS NOT NULL AND "cancellationReason" IS NOT NULL))
);
CREATE INDEX "SupplierReturn_receiptId_status_idx" ON "SupplierReturn" ("receiptId","status");
CREATE INDEX "SupplierReturn_createdAt_idx" ON "SupplierReturn" ("createdAt");
CREATE TABLE "SupplierReturnLine" (
  "id" UUID PRIMARY KEY,
  "returnId" UUID NOT NULL REFERENCES "SupplierReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "receiptLineId" UUID NOT NULL REFERENCES "GoodsReceiptLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "quantity" DECIMAL(18,3) NOT NULL CHECK ("quantity" > 0),
  "unitCost" DECIMAL(18,2) NOT NULL CHECK ("unitCost" >= 0),
  "total" DECIMAL(18,2) NOT NULL CHECK ("total" >= 0),
  UNIQUE ("returnId","receiptLineId")
);
CREATE INDEX "SupplierReturnLine_receiptLineId_idx" ON "SupplierReturnLine" ("receiptLineId");
CREATE TABLE "SupplierReturnCredit" (
  "id" UUID PRIMARY KEY,
  "returnId" UUID NOT NULL UNIQUE REFERENCES "SupplierReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "reference" VARCHAR(100) NOT NULL,
  "supplierId" UUID NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL CHECK ("amount" > 0),
  "recordedBy" UUID NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("supplierId","reference")
);
