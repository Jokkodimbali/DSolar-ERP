-- Validate both the old and the new identity, including insertion of new members
-- into a group (cash transfer) which has already been posted.
CREATE OR REPLACE FUNCTION ledger_guard_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_row jsonb; new_row jsonb; old_date timestamp; new_date timestamp;
  old_id uuid; new_id uuid; field text; changed boolean := false;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_row := to_jsonb(OLD);
    old_date := (old_row ->> TG_ARGV[1])::timestamp;
    old_id := (old_row ->> TG_ARGV[2])::uuid;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    new_row := to_jsonb(NEW);
    new_date := (new_row ->> TG_ARGV[1])::timestamp;
    new_id := (new_row ->> TG_ARGV[2])::uuid;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    FOREACH field IN ARRAY TG_ARGV[3:array_length(TG_ARGV,1)-1] LOOP
      IF (old_row -> field) IS DISTINCT FROM (new_row -> field) THEN changed := true; EXIT; END IF;
    END LOOP;
    IF NOT changed AND old_date IS NOT DISTINCT FROM new_date AND old_id IS NOT DISTINCT FROM new_id THEN
      RETURN NEW;
    END IF;
  END IF;
  -- Touch accounting periods before checking published entries to serialize with
  -- concurrent posting/closure. In particular the NEW key must be checked on INSERT.
  IF old_date IS NOT NULL THEN PERFORM ledger_touch_open_period(old_date); END IF;
  IF new_date IS DISTINCT FROM old_date AND new_date IS NOT NULL THEN
    PERFORM ledger_touch_open_period(new_date);
  END IF;
  IF EXISTS (
    SELECT 1 FROM "LedgerEntry" WHERE "sourceType" = TG_ARGV[0]
      AND ("sourceId" = old_id OR "sourceId" = new_id) AND "postedAt" IS NOT NULL
  ) THEN RAISE EXCEPTION 'Posted business source is immutable'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

-- Source posting must refer to a real pending business event with its original date.
-- This is a provenance check, not a complete SQL reimplementation of posting rules.
CREATE FUNCTION ledger_validate_source_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."postedAt" IS NULL AND NEW."postedAt" IS NOT NULL THEN
    IF NEW."sourceType" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM "LedgerPendingSource" s WHERE s.type = NEW."sourceType"
        AND s.id = NEW."sourceId" AND s.date::date = NEW.date
    ) THEN RAISE EXCEPTION 'Ledger source missing or accounting date inconsistent'; END IF;
    IF NEW."sourceType" IS NULL AND NEW."reversalOfId" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "LedgerEntry" WHERE id = NEW."reversalOfId" AND "sourceType" IS NOT NULL
    ) THEN RAISE EXCEPTION 'Business source must be reversed through its business workflow'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_validate_source_identity BEFORE UPDATE OF "postedAt" ON "LedgerEntry"
FOR EACH ROW EXECUTE FUNCTION ledger_validate_source_identity();

-- Closure is a transition, not an initial value.
CREATE FUNCTION ledger_period_initial_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."closedAt" IS NOT NULL OR NEW."closedBy" IS NOT NULL THEN
    RAISE EXCEPTION 'Accounting period must be opened before closure';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_period_initial_state BEFORE INSERT ON "LedgerPeriod"
FOR EACH ROW EXECUTE FUNCTION ledger_period_initial_state();

-- Confirmed or cancelled return details and selected serials are historical snapshots.
CREATE FUNCTION ledger_return_detail_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_parent uuid; new_parent uuid; parent_id uuid; parent_status text;
BEGIN
  IF TG_TABLE_NAME = 'SupplierReturnLine' THEN
    IF TG_OP <> 'INSERT' THEN old_parent := OLD."returnId"; END IF;
    IF TG_OP <> 'DELETE' THEN new_parent := NEW."returnId"; END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN
      SELECT "returnId" INTO old_parent FROM "SupplierReturnLine" WHERE id = OLD."returnLineId" FOR UPDATE;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      SELECT "returnId" INTO new_parent FROM "SupplierReturnLine" WHERE id = NEW."returnLineId" FOR UPDATE;
    END IF;
  END IF;
  FOR parent_id IN SELECT DISTINCT x FROM unnest(ARRAY[old_parent,new_parent]) AS x WHERE x IS NOT NULL ORDER BY x
  LOOP
    SELECT status::text INTO parent_status FROM "SupplierReturn" WHERE id = parent_id FOR UPDATE;
    IF parent_status <> 'DRAFT' THEN RAISE EXCEPTION 'Finalized supplier return details are immutable'; END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_return_line_guard BEFORE INSERT OR UPDATE OR DELETE ON "SupplierReturnLine"
FOR EACH ROW EXECUTE FUNCTION ledger_return_detail_guard();
CREATE TRIGGER ledger_return_serial_guard BEFORE INSERT OR UPDATE OR DELETE ON "SupplierReturnSerial"
FOR EACH ROW EXECUTE FUNCTION ledger_return_detail_guard();

-- Enforce the value snapshot at confirmation, and prevent later financial edits.
CREATE FUNCTION ledger_return_final_state() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE amount_sum numeric; item_count integer;
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.status <> 'DRAFT' THEN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Finalized supplier return is immutable'; END IF;
    IF to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN
      RAISE EXCEPTION 'Finalized supplier return is immutable';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'INSERT' AND NEW.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Supplier return must start as a draft';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'DRAFT' AND NEW.status = 'CONFIRMED' THEN
    SELECT count(*), coalesce(sum(total),0) INTO item_count,amount_sum
    FROM "SupplierReturnLine" WHERE "returnId" = NEW.id;
    IF item_count = 0 OR amount_sum <> NEW.total OR NEW."confirmedAt" IS NULL OR NEW."confirmedBy" IS NULL THEN
      RAISE EXCEPTION 'Supplier return totals or confirmation metadata inconsistent';
    END IF;
    IF EXISTS (
      SELECT 1 FROM "SupplierReturnLine" l JOIN "GoodsReceiptLine" r ON r.id = l."receiptLineId"
      WHERE l."returnId" = NEW.id AND (r."receiptId" <> NEW."receiptId"
        OR l."unitCost" <> r."unitCost" OR l.quantity <= 0 OR l.quantity > r.quantity
        OR l.total <> round(l.quantity * l."unitCost",2))
    ) THEN RAISE EXCEPTION 'Supplier return line snapshot inconsistent'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_return_final_state BEFORE INSERT OR UPDATE OR DELETE ON "SupplierReturn"
FOR EACH ROW EXECUTE FUNCTION ledger_return_final_state();
