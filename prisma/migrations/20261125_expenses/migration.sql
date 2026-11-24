CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID', 'CANCELLED', 'REFUNDED');
CREATE TABLE "ExpenseCategory" (
  "id" UUID PRIMARY KEY,
  "name" VARCHAR(100) NOT NULL UNIQUE
);
CREATE TABLE "Expense" (
  "id" UUID PRIMARY KEY,
  "storeId" UUID NOT NULL REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "categoryId" UUID NOT NULL REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "description" VARCHAR(500) NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL CHECK ("amount" > 0),
  "status" "ExpenseStatus" NOT NULL DEFAULT 'DRAFT',
  "operationKey" UUID NOT NULL UNIQUE,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMP(3),
  "approvedBy" UUID,
  "paidAt" TIMESTAMP(3),
  "paidBy" UUID,
  "method" "PaymentMethod",
  "reference" VARCHAR(200),
  "cashMovementId" UUID UNIQUE REFERENCES "CashMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "refundMovementId" UUID UNIQUE REFERENCES "CashMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "endedAt" TIMESTAMP(3),
  "endedBy" UUID,
  "endReason" VARCHAR(500),
  CHECK (("status" NOT IN ('PAID','REFUNDED')) OR ("paidAt" IS NOT NULL AND "paidBy" IS NOT NULL AND "method" IS NOT NULL)),
  CHECK (("method" IS DISTINCT FROM 'CASH') OR "cashMovementId" IS NOT NULL),
  CHECK (("status" <> 'REFUNDED' OR "method" IS DISTINCT FROM 'CASH') OR "refundMovementId" IS NOT NULL),
  CHECK (("status" NOT IN ('CANCELLED','REFUNDED')) OR ("endedAt" IS NOT NULL AND "endedBy" IS NOT NULL AND "endReason" IS NOT NULL))
);
CREATE INDEX "Expense_storeId_status_createdAt_idx" ON "Expense" ("storeId","status","createdAt");
CREATE INDEX "Expense_categoryId_idx" ON "Expense" ("categoryId");
