ALTER TABLE "LedgerEntry" ADD COLUMN "sourceType" VARCHAR(40), ADD COLUMN "sourceId" UUID;
CREATE UNIQUE INDEX "LedgerEntry_sourceType_sourceId_key" ON "LedgerEntry" ("sourceType","sourceId");
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_source_pair_check" CHECK (("sourceType" IS NULL) = ("sourceId" IS NULL));
CREATE TABLE "LedgerPostingRule" (
  "key" VARCHAR(120) PRIMARY KEY,
  "journalId" UUID NOT NULL REFERENCES "LedgerJournal"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "debitAccountId" UUID NOT NULL REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "creditAccountId" UUID NOT NULL REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "taxAccountId" UUID REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CHECK ("debitAccountId" <> "creditAccountId"),
  CHECK ("taxAccountId" IS NULL OR ("taxAccountId" <> "debitAccountId" AND "taxAccountId" <> "creditAccountId"))
);
