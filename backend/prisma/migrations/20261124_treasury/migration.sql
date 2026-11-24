CREATE TABLE "CashRegister" (
  "id" UUID PRIMARY KEY, "storeId" UUID NOT NULL REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "name" VARCHAR(100) NOT NULL, UNIQUE ("storeId","name")
);
CREATE TABLE "CashSession" (
  "id" UUID PRIMARY KEY, "registerId" UUID NOT NULL REFERENCES "CashRegister"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "opening" DECIMAL(18,2) NOT NULL CHECK ("opening" >= 0), "openedBy" UUID NOT NULL,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "closedAt" TIMESTAMP(3), "closedBy" UUID,
  "counted" DECIMAL(18,2) CHECK ("counted" >= 0), "expected" DECIMAL(18,2),
  CHECK (("closedAt" IS NULL AND "closedBy" IS NULL AND "counted" IS NULL AND "expected" IS NULL)
    OR ("closedAt" IS NOT NULL AND "closedBy" IS NOT NULL AND "counted" IS NOT NULL AND "expected" IS NOT NULL))
);
CREATE UNIQUE INDEX "CashSession_one_open" ON "CashSession" ("registerId") WHERE "closedAt" IS NULL;
CREATE INDEX "CashSession_registerId_closedAt_idx" ON "CashSession" ("registerId","closedAt");
CREATE TABLE "CashMovement" (
  "id" UUID PRIMARY KEY, "sessionId" UUID NOT NULL REFERENCES "CashSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "amount" DECIMAL(18,2) NOT NULL CHECK ("amount" <> 0), "reason" VARCHAR(200) NOT NULL,
  "operationKey" UUID NOT NULL UNIQUE, "actorId" UUID NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "CashMovement_sessionId_createdAt_idx" ON "CashMovement" ("sessionId","createdAt");
