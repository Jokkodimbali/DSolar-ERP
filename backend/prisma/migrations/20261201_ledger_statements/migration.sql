CREATE TYPE "LedgerAccountClass" AS ENUM ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE');
CREATE TABLE "LedgerAccountClassification" (
  "accountId" UUID PRIMARY KEY REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "category" "LedgerAccountClass" NOT NULL,
  "classifiedBy" UUID NOT NULL,
  "classifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE FUNCTION ledger_guard_classification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "LedgerLine" l JOIN "LedgerEntry" e ON e.id = l."entryId"
    WHERE l."accountId" = OLD."accountId" AND e."postedAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Used account classification is immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_classification_guard BEFORE UPDATE OR DELETE ON "LedgerAccountClassification"
FOR EACH ROW EXECUTE FUNCTION ledger_guard_classification();
