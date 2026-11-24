-- Shared source registry: the API and the database apply the same closing predicate.
CREATE VIEW "LedgerPendingSource" AS
WITH sources AS (
      SELECT 'INVOICE'::text AS type, id, "issuedAt" AS date, 1 AS priority
      FROM "Invoice" WHERE status = 'ISSUED' AND "totalTtc" > 0
      UNION ALL
      SELECT 'PAYMENT', id, "receivedAt", 2 FROM "Payment" WHERE amount > 0
      UNION ALL
      SELECT 'EXPENSE', id, "paidAt", 2 FROM "Expense"
      WHERE status IN ('PAID','REFUNDED') AND amount > 0
      UNION ALL
      SELECT 'GOODS_RECEIPT', r.id, r."receivedAt", 2 FROM "GoodsReceipt" r
      WHERE r.status = 'CONFIRMED' AND EXISTS (
        SELECT 1 FROM "GoodsReceiptLine" l WHERE l."receiptId" = r.id
        AND round(l.quantity * l."unitCost", 2) > 0
      )
      UNION ALL
      SELECT 'CREDIT_NOTE', id, "issuedAt", 3 FROM "CreditNote" WHERE amount > 0
      UNION ALL
      SELECT 'PAYMENT_REVERSAL', id, "createdAt", 3 FROM "PaymentReversal" WHERE amount > 0
      UNION ALL
      SELECT 'EXPENSE_REFUND', id, "endedAt", 3 FROM "Expense" WHERE status = 'REFUNDED' AND amount > 0
      UNION ALL
      SELECT 'SUPPLIER_RETURN', id, "confirmedAt", 3 FROM "SupplierReturn" WHERE status = 'CONFIRMED' AND total > 0
      UNION ALL
      SELECT 'CASH_TRANSFER', "transferKey", coalesce(min("createdAt") FILTER (WHERE amount < 0), min("createdAt")), 2
      FROM "CashMovement" WHERE "transferKey" IS NOT NULL GROUP BY "transferKey"
      UNION ALL
      SELECT 'CASH_MOVEMENT', m.id, m."createdAt", CASE WHEN m."reversalOfId" IS NULL THEN 2 ELSE 3 END
      FROM "CashMovement" m
      LEFT JOIN "CashMovement" original ON original.id = m."reversalOfId"
      WHERE m."transferKey" IS NULL AND m."paymentId" IS NULL AND original."paymentId" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "Expense" e WHERE e."cashMovementId" IN (m.id, original.id)
          OR e."refundMovementId" = m.id
        )
    )
SELECT s.type, s.id, s.date, s.priority FROM sources s
WHERE NOT EXISTS (
  SELECT 1 FROM "LedgerEntry" e WHERE e."sourceType" = s.type
    AND e."sourceId" = s.id AND e."postedAt" IS NOT NULL
);

-- Reject new draft entries, postings or period changes after closing.
CREATE OR REPLACE FUNCTION ledger_guard_entry() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p "LedgerPeriod"%ROWTYPE; n integer; d numeric; c numeric; original "LedgerEntry"%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."postedAt" IS NOT NULL THEN RAISE EXCEPTION 'Posted entry is immutable'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."postedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Posted entry is immutable';
  END IF;
  SELECT * INTO p FROM "LedgerPeriod" WHERE id = NEW."periodId" FOR UPDATE;
  IF NOT FOUND OR p."closedAt" IS NOT NULL OR NEW.date NOT BETWEEN p."startsAt" AND p."endsAt" THEN
    RAISE EXCEPTION 'Invalid accounting period';
  END IF;
  IF NEW."postedAt" IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN RAISE EXCEPTION 'Post entry after inserting lines'; END IF;
    SELECT count(*), coalesce(sum(debit),0), coalesce(sum(credit),0) INTO n,d,c
      FROM "LedgerLine" WHERE "entryId" = NEW.id;
    IF n < 2 OR n > 100 OR d <= 0 OR d <> c THEN RAISE EXCEPTION 'Unbalanced entry'; END IF;
    IF NEW."reversalOfId" IS NOT NULL THEN
      SELECT * INTO original FROM "LedgerEntry" WHERE id = NEW."reversalOfId";
      IF NOT FOUND OR original."postedAt" IS NULL OR original."reversalOfId" IS NOT NULL
         OR original.date > NEW.date OR original.id = NEW.id OR original."journalId" <> NEW."journalId" THEN
        RAISE EXCEPTION 'Invalid original entry for reversal';
      END IF;
      IF EXISTS (
        (SELECT "accountId", debit, credit FROM "LedgerLine" WHERE "entryId" = NEW.id
         EXCEPT ALL
         SELECT "accountId", credit, debit FROM "LedgerLine" WHERE "entryId" = original.id)
        UNION ALL
        (SELECT "accountId", credit, debit FROM "LedgerLine" WHERE "entryId" = original.id
         EXCEPT ALL
         SELECT "accountId", debit, credit FROM "LedgerLine" WHERE "entryId" = NEW.id)
      ) THEN RAISE EXCEPTION 'Reversal does not match original entry'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION ledger_guard_period() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."closedAt" IS NOT NULL THEN RAISE EXCEPTION 'Closed period is immutable'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW."startsAt" <> OLD."startsAt" OR NEW."endsAt" <> OLD."endsAt" THEN
    RAISE EXCEPTION 'Period dates are immutable';
  END IF;
  IF NEW."closedAt" IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM "LedgerEntry" WHERE "periodId" = NEW.id AND "postedAt" IS NULL) THEN
      RAISE EXCEPTION 'Unposted ledger entries remain';
    END IF;
    IF EXISTS (SELECT 1 FROM "LedgerPendingSource" WHERE date IS NULL OR
      (date >= NEW."startsAt" AND date < NEW."endsAt" + 1)) THEN
      RAISE EXCEPTION 'Unposted business sources remain';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Serialize business events with the closure of their accounting period.
-- A write to the period row ensures a concurrent SERIALIZABLE closure fails instead of using a stale snapshot.
CREATE FUNCTION ledger_touch_open_period(event_date timestamp) RETURNS void LANGUAGE plpgsql AS $$
DECLARE p "LedgerPeriod"%ROWTYPE;
BEGIN
  IF event_date IS NULL THEN RETURN; END IF;
  SELECT * INTO p FROM "LedgerPeriod" WHERE event_date::date BETWEEN "startsAt" AND "endsAt" FOR UPDATE;
  IF FOUND THEN
    IF p."closedAt" IS NOT NULL THEN RAISE EXCEPTION 'Business event in closed accounting period'; END IF;
    UPDATE "LedgerPeriod" SET name = name WHERE id = p.id;
  END IF;
END $$;

-- Protect posted source financial fields, while permitting unrelated operational metadata updates.
-- Args: source type, event date field, source identity field, then protected fields.
CREATE FUNCTION ledger_guard_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_row jsonb; new_row jsonb; old_date timestamp; new_date timestamp;
  source_id uuid; field text; changed boolean := false;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_row := to_jsonb(OLD); old_date := (old_row ->> TG_ARGV[1])::timestamp; END IF;
  IF TG_OP <> 'DELETE' THEN new_row := to_jsonb(NEW); new_date := (new_row ->> TG_ARGV[1])::timestamp; END IF;
  IF TG_OP = 'UPDATE' THEN
    FOREACH field IN ARRAY TG_ARGV[3:array_length(TG_ARGV,1)-1] LOOP
      IF (old_row -> field) IS DISTINCT FROM (new_row -> field) THEN changed := true; EXIT; END IF;
    END LOOP;
    IF NOT changed AND old_date IS NOT DISTINCT FROM new_date THEN RETURN NEW; END IF;
  END IF;
  IF TG_OP <> 'INSERT' AND old_date IS NOT NULL THEN
    source_id := (old_row ->> TG_ARGV[2])::uuid;
    IF source_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM "LedgerEntry" WHERE "sourceType" = TG_ARGV[0] AND "sourceId" = source_id AND "postedAt" IS NOT NULL
    ) THEN RAISE EXCEPTION 'Posted business source is immutable'; END IF;
    PERFORM ledger_touch_open_period(old_date);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM ledger_touch_open_period(new_date);
    RETURN NEW;
  END IF;
  RETURN OLD;
END $$;

CREATE TRIGGER ledger_invoice_source BEFORE INSERT OR UPDATE OR DELETE ON "Invoice"
FOR EACH ROW EXECUTE FUNCTION ledger_guard_source('INVOICE','issuedAt','id','id','totalHt','totalTax','totalTtc','customerId','orderId','status','number');
CREATE TRIGGER ledger_credit_source BEFORE INSERT OR UPDATE OR DELETE ON "CreditNote"
FOR EACH ROW EXECUTE FUNCTION ledger_guard_source('CREDIT_NOTE','issuedAt','id','id','invoiceId','amount','number','reason');
CREATE TRIGGER ledger_payment_source BEFORE INSERT OR UPDATE OR DELETE ON "Payment"
FOR EACH ROW EXECUTE FUNCTION ledger_guard_source('PAYMENT','receivedAt','id','id','orderId','amount','method','externalReference');
CREATE TRIGGER ledger_payment_reversal_source BEFORE INSERT OR UPDATE OR DELETE ON "PaymentReversal"
FOR EACH ROW EXECUTE FUNCTION ledger_guard_source('PAYMENT_REVERSAL','createdAt','id','id','paymentId','amount','reason');
CREATE TRIGGER ledger_expense_source BEFORE INSERT OR UPDATE OR DELETE ON "Expense"
FOR EACH ROW EXECUTE FUNCTION ledger_guard_source('EXPENSE','paidAt','id','id','storeId','categoryId','amount','method','cashMovementId','description');
CREATE TRIGGER ledger_expense_refund_source BEFORE INSERT OR UPDATE OR DELETE ON "Expense"
FOR EACH ROW EXECUTE FUNCTION ledger_guard_source('EXPENSE_REFUND','endedAt','id','id','refundMovementId','endReason');
CREATE TRIGGER ledger_receipt_source BEFORE INSERT OR UPDATE OR DELETE ON "GoodsReceipt"
FOR EACH ROW EXECUTE FUNCTION ledger_guard_source('GOODS_RECEIPT','receivedAt','id','id','purchaseOrderId','storeId','status','number');
CREATE TRIGGER ledger_supplier_return_source BEFORE INSERT OR UPDATE OR DELETE ON "SupplierReturn"
FOR EACH ROW EXECUTE FUNCTION ledger_guard_source('SUPPLIER_RETURN','confirmedAt','id','id','receiptId','total','status','reason');
CREATE TRIGGER ledger_cash_movement_source BEFORE INSERT OR UPDATE OR DELETE ON "CashMovement"
FOR EACH ROW EXECUTE FUNCTION ledger_guard_source('CASH_MOVEMENT','createdAt','id','id','sessionId','amount','paymentId','transferKey','reversalOfId','reason');
CREATE TRIGGER ledger_cash_transfer_source BEFORE INSERT OR UPDATE OR DELETE ON "CashMovement"
FOR EACH ROW EXECUTE FUNCTION ledger_guard_source('CASH_TRANSFER','createdAt','transferKey','id','sessionId','amount','paymentId','transferKey','reversalOfId','reason');

-- The cost snapshot of a confirmed receipt cannot be altered by bypassing the application.
CREATE FUNCTION ledger_guard_receipt_line() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM "GoodsReceipt" WHERE id = OLD."receiptId" AND status = 'CONFIRMED' AND (EXISTS (SELECT 1 FROM "LedgerEntry" e WHERE e."sourceType" = 'GOODS_RECEIPT' AND e."sourceId" = "GoodsReceipt".id AND e."postedAt" IS NOT NULL) OR EXISTS (SELECT 1 FROM "LedgerPeriod" p WHERE p."closedAt" IS NOT NULL AND "GoodsReceipt"."receivedAt"::date BETWEEN p."startsAt" AND p."endsAt"))) THEN
      RAISE EXCEPTION 'Confirmed receipt line is immutable';
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM "GoodsReceipt" WHERE id = NEW."receiptId" AND status = 'CONFIRMED' AND (EXISTS (SELECT 1 FROM "LedgerEntry" e WHERE e."sourceType" = 'GOODS_RECEIPT' AND e."sourceId" = "GoodsReceipt".id AND e."postedAt" IS NOT NULL) OR EXISTS (SELECT 1 FROM "LedgerPeriod" p WHERE p."closedAt" IS NOT NULL AND "GoodsReceipt"."receivedAt"::date BETWEEN p."startsAt" AND p."endsAt"))) THEN
      RAISE EXCEPTION 'Confirmed receipt line is immutable';
    END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER ledger_receipt_line_guard BEFORE INSERT OR UPDATE OR DELETE ON "GoodsReceiptLine"
FOR EACH ROW EXECUTE FUNCTION ledger_guard_receipt_line();
