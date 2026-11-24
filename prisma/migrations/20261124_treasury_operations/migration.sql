ALTER TABLE "CashMovement" ADD COLUMN "transferKey" UUID, ADD COLUMN "reversalOfId" UUID, ADD COLUMN "paymentId" UUID;
CREATE UNIQUE INDEX "CashMovement_reversalOfId_key" ON "CashMovement" ("reversalOfId");
CREATE UNIQUE INDEX "CashMovement_paymentId_key" ON "CashMovement" ("paymentId");
CREATE INDEX "CashMovement_transferKey_idx" ON "CashMovement" ("transferKey");
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "CashMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_source_check" CHECK (num_nonnulls("transferKey", "reversalOfId", "paymentId") <= 1);
