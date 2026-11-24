-- A source mutation and a posting must serialize on the same period row.
-- Even a posting that does not mutate a business source must publish a row version.
CREATE FUNCTION ledger_publish_posting() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."postedAt" IS NULL AND NEW."postedAt" IS NOT NULL THEN
    UPDATE "LedgerPeriod" SET name = name WHERE id = NEW."periodId";
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_publish_posting AFTER UPDATE OF "postedAt" ON "LedgerEntry"
FOR EACH ROW EXECUTE FUNCTION ledger_publish_posting();

-- Prevent a financial event without a date from bypassing period protection.
CREATE FUNCTION ledger_require_event_date() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'Invoice' THEN
    IF NEW.status = 'ISSUED' AND NEW."issuedAt" IS NULL THEN
      RAISE EXCEPTION 'Issued invoice requires an accounting date';
    END IF;
  ELSIF TG_TABLE_NAME = 'CreditNote' THEN
    IF NEW."issuedAt" IS NULL THEN RAISE EXCEPTION 'Credit note requires an accounting date'; END IF;
  ELSIF TG_TABLE_NAME = 'GoodsReceipt' THEN
    IF NEW.status = 'CONFIRMED' AND NEW."receivedAt" IS NULL THEN
      RAISE EXCEPTION 'Confirmed receipt requires an accounting date';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_invoice_date BEFORE INSERT OR UPDATE ON "Invoice"
FOR EACH ROW EXECUTE FUNCTION ledger_require_event_date();
CREATE TRIGGER ledger_credit_date BEFORE INSERT OR UPDATE ON "CreditNote"
FOR EACH ROW EXECUTE FUNCTION ledger_require_event_date();
CREATE TRIGGER ledger_receipt_date BEFORE INSERT OR UPDATE ON "GoodsReceipt"
FOR EACH ROW EXECUTE FUNCTION ledger_require_event_date();

-- Child mutations must participate in the receipt's lock and period version.
CREATE OR REPLACE FUNCTION ledger_guard_receipt_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "GoodsReceipt"%ROWTYPE; receipt_id uuid;
BEGIN
  FOR receipt_id IN
    SELECT DISTINCT x FROM unnest(ARRAY[
      CASE WHEN TG_OP <> 'INSERT' THEN OLD."receiptId" ELSE NULL END,
      CASE WHEN TG_OP <> 'DELETE' THEN NEW."receiptId" ELSE NULL END
    ]) AS x WHERE x IS NOT NULL ORDER BY x
  LOOP
    SELECT * INTO r FROM "GoodsReceipt" WHERE id = receipt_id FOR UPDATE;
    IF FOUND AND r.status = 'CONFIRMED' THEN
      IF EXISTS (SELECT 1 FROM "LedgerEntry" e WHERE e."sourceType" = 'GOODS_RECEIPT'
        AND e."sourceId" = receipt_id AND e."postedAt" IS NOT NULL) THEN
        RAISE EXCEPTION 'Posted receipt line is immutable';
      END IF;
      PERFORM ledger_touch_open_period(r."receivedAt");
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
-- Posted account and journal identities cannot be changed underneath historical entries.
CREATE FUNCTION ledger_guard_reference() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'LedgerAccount' THEN
    IF EXISTS (SELECT 1 FROM "LedgerLine" l JOIN "LedgerEntry" e ON e.id = l."entryId"
      WHERE l."accountId" = OLD.id AND e."postedAt" IS NOT NULL) THEN
      RAISE EXCEPTION 'Used accounting account is immutable';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM "LedgerEntry" WHERE "journalId" = OLD.id AND "postedAt" IS NOT NULL) THEN
    RAISE EXCEPTION 'Used accounting journal is immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_account_identity BEFORE UPDATE OR DELETE ON "LedgerAccount"
FOR EACH ROW EXECUTE FUNCTION ledger_guard_reference();
CREATE TRIGGER ledger_journal_identity BEFORE UPDATE OR DELETE ON "LedgerJournal"
FOR EACH ROW EXECUTE FUNCTION ledger_guard_reference();
