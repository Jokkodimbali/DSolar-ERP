CREATE TABLE "LedgerBankAccount" (
  id UUID PRIMARY KEY, "accountId" UUID NOT NULL UNIQUE REFERENCES "LedgerAccount"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  name VARCHAR(160) NOT NULL, revision INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE "LedgerBankStatement" (
  id UUID PRIMARY KEY, "bankAccountId" UUID NOT NULL REFERENCES "LedgerBankAccount"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  reference VARCHAR(100) NOT NULL, "startsAt" DATE NOT NULL, "endsAt" DATE NOT NULL,
  opening DECIMAL(18,2) NOT NULL, closing DECIMAL(18,2) NOT NULL,
  "createdBy" UUID NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedBy" UUID, "closedAt" TIMESTAMP(3),
  UNIQUE ("bankAccountId",reference), CHECK ("startsAt" <= "endsAt"),
  CHECK (("closedBy" IS NULL) = ("closedAt" IS NULL))
);
CREATE INDEX "LedgerBankStatement_bankAccountId_startsAt_endsAt_idx" ON "LedgerBankStatement" ("bankAccountId","startsAt","endsAt");
CREATE TABLE "LedgerBankLine" (
  id UUID PRIMARY KEY, "statementId" UUID NOT NULL REFERENCES "LedgerBankStatement"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  reference VARCHAR(100) NOT NULL, date DATE NOT NULL, description VARCHAR(500) NOT NULL,
  amount DECIMAL(18,2) NOT NULL CHECK (amount <> 0),
  "ledgerLineId" UUID UNIQUE REFERENCES "LedgerLine"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "matchedBy" UUID, "matchedAt" TIMESTAMP(3),
  UNIQUE ("statementId",reference),
  CHECK (("ledgerLineId" IS NULL) = ("matchedBy" IS NULL) AND ("ledgerLineId" IS NULL) = ("matchedAt" IS NULL))
);
CREATE INDEX "LedgerBankLine_statementId_date_idx" ON "LedgerBankLine" ("statementId",date);

-- A shared row version serializes reconciliations with new postings.
CREATE FUNCTION ledger_bank_touch(bank_id uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "LedgerBankAccount" SET revision = revision + 1 WHERE id = bank_id;
END $$;

CREATE FUNCTION ledger_bank_account_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."accountId" <> OLD."accountId" OR NEW.name <> OLD.name THEN
      RAISE EXCEPTION 'Bank account identity is immutable';
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM "LedgerAccountClassification" WHERE "accountId" = NEW."accountId" AND category = 'ASSET') THEN
      RAISE EXCEPTION 'Bank account requires an asset classification';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_bank_account_guard BEFORE INSERT OR UPDATE ON "LedgerBankAccount"
FOR EACH ROW EXECUTE FUNCTION ledger_bank_account_guard();

CREATE FUNCTION ledger_bank_class_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "LedgerBankAccount" WHERE "accountId" = OLD."accountId") THEN
    RAISE EXCEPTION 'Mapped bank classification is immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_bank_class_guard BEFORE UPDATE OR DELETE ON "LedgerAccountClassification"
FOR EACH ROW EXECUTE FUNCTION ledger_bank_class_guard();

CREATE FUNCTION ledger_bank_statement_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE account_id uuid; opening_book numeric; closing_book numeric; bank_sum numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Bank statement is immutable'; END IF;
  PERFORM ledger_bank_touch(NEW."bankAccountId");
  IF TG_OP = 'INSERT' THEN
    IF NEW."closedAt" IS NOT NULL OR EXISTS (
      SELECT 1 FROM "LedgerBankStatement" s WHERE s."bankAccountId" = NEW."bankAccountId"
      AND s."startsAt" <= NEW."endsAt" AND s."endsAt" >= NEW."startsAt"
    ) THEN RAISE EXCEPTION 'Overlapping or already closed bank statement'; END IF;
    RETURN NEW;
  END IF;
  IF OLD."closedAt" IS NOT NULL OR
    (to_jsonb(NEW) - 'closedAt' - 'closedBy') IS DISTINCT FROM (to_jsonb(OLD) - 'closedAt' - 'closedBy') THEN
    RAISE EXCEPTION 'Bank statement is immutable';
  END IF;
  IF NEW."closedAt" IS NULL THEN RETURN NEW; END IF;
  SELECT "accountId" INTO account_id FROM "LedgerBankAccount" WHERE id = NEW."bankAccountId";
  SELECT coalesce(sum(amount),0) INTO bank_sum FROM "LedgerBankLine" WHERE "statementId" = NEW.id;
  IF NEW.opening + bank_sum <> NEW.closing OR EXISTS (
    SELECT 1 FROM "LedgerBankLine" WHERE "statementId" = NEW.id AND "ledgerLineId" IS NULL
  ) THEN RAISE EXCEPTION 'Unreconciled bank transactions'; END IF;
  SELECT coalesce(sum(l.debit-l.credit) FILTER (WHERE e.date < NEW."startsAt"),0),
    coalesce(sum(l.debit-l.credit),0) INTO opening_book, closing_book
  FROM "LedgerLine" l JOIN "LedgerEntry" e ON e.id = l."entryId"
  WHERE l."accountId" = account_id AND e."postedAt" IS NOT NULL AND e.date <= NEW."endsAt";
  IF opening_book <> NEW.opening OR closing_book <> NEW.closing OR EXISTS (
    SELECT 1 FROM "LedgerLine" l JOIN "LedgerEntry" e ON e.id = l."entryId"
    WHERE l."accountId" = account_id AND e."postedAt" IS NOT NULL AND e.date BETWEEN NEW."startsAt" AND NEW."endsAt"
    AND NOT EXISTS (SELECT 1 FROM "LedgerBankLine" b WHERE b."ledgerLineId" = l.id AND b."statementId" = NEW.id)
  ) THEN RAISE EXCEPTION 'Unreconciled ledger balance or transactions'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_bank_statement_guard BEFORE INSERT OR UPDATE OR DELETE ON "LedgerBankStatement"
FOR EACH ROW EXECUTE FUNCTION ledger_bank_statement_guard();

CREATE FUNCTION ledger_bank_line_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s "LedgerBankStatement"%ROWTYPE; account_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Bank line is immutable'; END IF;
  SELECT * INTO s FROM "LedgerBankStatement" WHERE id = NEW."statementId" FOR UPDATE;
  IF NOT FOUND OR s."closedAt" IS NOT NULL OR NEW.date NOT BETWEEN s."startsAt" AND s."endsAt" THEN
    RAISE EXCEPTION 'Invalid or closed bank statement';
  END IF;
  PERFORM ledger_bank_touch(s."bankAccountId");
  IF TG_OP = 'UPDATE' AND
    (to_jsonb(NEW) - 'ledgerLineId' - 'matchedBy' - 'matchedAt') IS DISTINCT FROM
    (to_jsonb(OLD) - 'ledgerLineId' - 'matchedBy' - 'matchedAt') THEN
    RAISE EXCEPTION 'Imported bank line is immutable';
  END IF;
  IF NEW."ledgerLineId" IS NOT NULL THEN
    SELECT "accountId" INTO account_id FROM "LedgerBankAccount" WHERE id = s."bankAccountId";
    IF NOT EXISTS (
      SELECT 1 FROM "LedgerLine" l JOIN "LedgerEntry" e ON e.id = l."entryId"
      WHERE l.id = NEW."ledgerLineId" AND l."accountId" = account_id
      AND e."postedAt" IS NOT NULL AND e.date BETWEEN s."startsAt" AND s."endsAt"
      AND l.debit - l.credit = NEW.amount
    ) THEN RAISE EXCEPTION 'Invalid ledger match'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_bank_line_guard BEFORE INSERT OR UPDATE OR DELETE ON "LedgerBankLine"
FOR EACH ROW EXECUTE FUNCTION ledger_bank_line_guard();

-- A validated reconciliation cannot be invalidated by backdated postings.
CREATE FUNCTION ledger_bank_post_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE bank_id uuid;
BEGIN
  IF OLD."postedAt" IS NULL AND NEW."postedAt" IS NOT NULL THEN
    FOR bank_id IN SELECT DISTINCT b.id FROM "LedgerBankAccount" b
      JOIN "LedgerLine" l ON l."accountId" = b."accountId" WHERE l."entryId" = NEW.id ORDER BY b.id
    LOOP
      PERFORM ledger_bank_touch(bank_id);
      IF EXISTS (SELECT 1 FROM "LedgerBankStatement" s WHERE s."bankAccountId" = bank_id
        AND s."closedAt" IS NOT NULL AND NEW.date <= s."endsAt") THEN
        RAISE EXCEPTION 'Posting would invalidate a closed bank reconciliation';
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_bank_post_guard BEFORE UPDATE OF "postedAt" ON "LedgerEntry"
FOR EACH ROW EXECUTE FUNCTION ledger_bank_post_guard();
