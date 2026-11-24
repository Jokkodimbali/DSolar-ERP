CREATE TABLE "LedgerAccount" (
  "id" UUID PRIMARY KEY, "code" VARCHAR(30) NOT NULL UNIQUE, "name" VARCHAR(160) NOT NULL
);
CREATE TABLE "LedgerJournal" (
  "id" UUID PRIMARY KEY, "code" VARCHAR(30) NOT NULL UNIQUE, "name" VARCHAR(160) NOT NULL
);
CREATE TABLE "LedgerPeriod" (
  "id" UUID PRIMARY KEY, "name" VARCHAR(100) NOT NULL UNIQUE,
  "startsAt" DATE NOT NULL, "endsAt" DATE NOT NULL, "closedAt" TIMESTAMP(3), "closedBy" UUID,
  CHECK ("startsAt" <= "endsAt"), CHECK (("closedAt" IS NULL) = ("closedBy" IS NULL)),
  EXCLUDE USING gist (daterange("startsAt", "endsAt", '[]') WITH &&)
);
CREATE TABLE "LedgerEntry" (
  "id" UUID PRIMARY KEY, "journalId" UUID NOT NULL REFERENCES "LedgerJournal"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "periodId" UUID NOT NULL REFERENCES "LedgerPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "date" DATE NOT NULL, "description" VARCHAR(500) NOT NULL, "operationKey" UUID NOT NULL UNIQUE,
  "actorId" UUID NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "postedAt" TIMESTAMP(3), "reversalOfId" UUID UNIQUE REFERENCES "LedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "LedgerEntry_periodId_date_id_idx" ON "LedgerEntry" ("periodId","date","id");
CREATE INDEX "LedgerEntry_journalId_date_idx" ON "LedgerEntry" ("journalId","date");
CREATE TABLE "LedgerLine" (
  "id" UUID PRIMARY KEY, "entryId" UUID NOT NULL REFERENCES "LedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "accountId" UUID NOT NULL REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "debit" DECIMAL(18,2) NOT NULL, "credit" DECIMAL(18,2) NOT NULL,
  CHECK (("debit" > 0 AND "credit" = 0) OR ("credit" > 0 AND "debit" = 0))
);
CREATE INDEX "LedgerLine_entryId_idx" ON "LedgerLine" ("entryId");
CREATE INDEX "LedgerLine_accountId_idx" ON "LedgerLine" ("accountId");

CREATE FUNCTION ledger_guard_entry() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p "LedgerPeriod"%ROWTYPE; n integer; d numeric; c numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."postedAt" IS NOT NULL THEN RAISE EXCEPTION 'Posted entry is immutable'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."postedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Posted entry is immutable';
  END IF;
  IF NEW."postedAt" IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN RAISE EXCEPTION 'Post entry after inserting lines'; END IF;
    SELECT * INTO p FROM "LedgerPeriod" WHERE id = NEW."periodId" FOR UPDATE;
    IF p."closedAt" IS NOT NULL OR NEW.date NOT BETWEEN p."startsAt" AND p."endsAt" THEN
      RAISE EXCEPTION 'Invalid accounting period';
    END IF;
    SELECT count(*), coalesce(sum(debit),0), coalesce(sum(credit),0) INTO n,d,c
      FROM "LedgerLine" WHERE "entryId" = NEW.id;
    IF n < 2 OR d <= 0 OR d <> c THEN RAISE EXCEPTION 'Unbalanced entry'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_entry_guard BEFORE INSERT OR UPDATE OR DELETE ON "LedgerEntry"
FOR EACH ROW EXECUTE FUNCTION ledger_guard_entry();

CREATE FUNCTION ledger_guard_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE posted timestamp;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT "postedAt" INTO posted FROM "LedgerEntry" WHERE id = OLD."entryId" FOR UPDATE;
    IF posted IS NOT NULL THEN RAISE EXCEPTION 'Posted line is immutable'; END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT "postedAt" INTO posted FROM "LedgerEntry" WHERE id = NEW."entryId" FOR UPDATE;
    IF posted IS NOT NULL THEN RAISE EXCEPTION 'Posted line is immutable'; END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER ledger_line_guard BEFORE INSERT OR UPDATE OR DELETE ON "LedgerLine"
FOR EACH ROW EXECUTE FUNCTION ledger_guard_line();

CREATE FUNCTION ledger_guard_period() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."closedAt" IS NOT NULL THEN RAISE EXCEPTION 'Closed period is immutable'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW."startsAt" <> OLD."startsAt" OR NEW."endsAt" <> OLD."endsAt" THEN
    RAISE EXCEPTION 'Period dates are immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_period_guard BEFORE UPDATE OR DELETE ON "LedgerPeriod"
FOR EACH ROW EXECUTE FUNCTION ledger_guard_period();
