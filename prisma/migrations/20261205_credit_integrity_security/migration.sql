-- Serialize detailed credit issuance on the invoice itself, including direct SQL writes.
-- Historical undetailed credits are retained; do not silently mix them with detailed credits.
CREATE FUNCTION ledger_credit_issuance_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE inv "Invoice"%ROWTYPE; used numeric; allocated numeric;
BEGIN
  SELECT * INTO inv FROM "Invoice" WHERE id = NEW."invoiceId" FOR UPDATE;
  IF NOT FOUND OR inv.status <> 'ISSUED' THEN
    RAISE EXCEPTION 'Credit note requires an issued invoice';
  END IF;
  IF NEW."netAmount" IS NULL THEN
    IF EXISTS (SELECT 1 FROM "CreditNote" WHERE "invoiceId" = inv.id AND "netAmount" IS NOT NULL) THEN
      RAISE EXCEPTION 'Detailed credit history requires detailed credit notes';
    END IF;
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM "CreditNote" WHERE "invoiceId" = inv.id AND "netAmount" IS NULL) THEN
    RAISE EXCEPTION 'Historical credits require documented reconciliation';
  END IF;
  SELECT coalesce(sum(amount),0) INTO used FROM "CreditNote" WHERE "invoiceId" = inv.id;
  SELECT coalesce(sum(amount),0) INTO allocated FROM "PaymentAllocation" WHERE "invoiceId" = inv.id;
  IF NEW.amount <= 0 OR used + allocated + NEW.amount > inv."totalTtc" THEN
    RAISE EXCEPTION 'Credit note exceeds remaining invoice balance';
  END IF;
  -- Publish a row version so serializable transactions cannot proceed on stale credit totals.
  UPDATE "Invoice" SET "number" = "number" WHERE id = inv.id;
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_credit_issuance_guard BEFORE INSERT ON "CreditNote"
FOR EACH ROW EXECUTE FUNCTION ledger_credit_issuance_guard();

CREATE OR REPLACE FUNCTION ledger_validate_credit_details() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE note_id uuid; note "CreditNote"%ROWTYPE; net numeric; tax numeric; invoice_net numeric; invoice_tax numeric;
BEGIN
  IF TG_TABLE_NAME = 'CreditNote' THEN note_id := NEW.id;
  ELSE note_id := NEW."creditNoteId"; END IF;
  SELECT * INTO note FROM "CreditNote" WHERE id = note_id;
  IF NOT FOUND OR note."netAmount" IS NULL THEN RETURN NULL; END IF;
  SELECT coalesce(sum("netAmount"),0), coalesce(sum("taxAmount"),0) INTO net,tax
    FROM "CreditNoteLine" WHERE "creditNoteId" = note_id;
  IF net <> note."netAmount" OR tax <> note."taxAmount" THEN
    RAISE EXCEPTION 'Credit note details do not balance';
  END IF;
  SELECT "totalHt", "totalTax" INTO invoice_net,invoice_tax FROM "Invoice" WHERE id = note."invoiceId";
  IF EXISTS (
    SELECT 1 FROM "InvoiceLine" l JOIN "CreditNoteLine" c ON c."invoiceLineId" = l.id
    WHERE l."invoiceId" = note."invoiceId"
    GROUP BY l.id,l."lineTotal",l."taxAmount"
    HAVING l."lineTotal" <= l."taxAmount"
      OR sum(c."netAmount") > l."lineTotal" - l."taxAmount"
      OR sum(c."taxAmount") > l."taxAmount"
      OR sum(c."taxAmount") <> round(sum(c."netAmount") * l."taxAmount" / nullif(l."lineTotal" - l."taxAmount",0),2)
  ) THEN RAISE EXCEPTION 'Credit note tax allocation exceeds or differs from historical invoice'; END IF;
  IF EXISTS (
    SELECT 1 FROM "CreditNote" WHERE "invoiceId" = note."invoiceId"
    GROUP BY "invoiceId" HAVING sum("netAmount") > invoice_net OR sum("taxAmount") > invoice_tax
  ) THEN RAISE EXCEPTION 'Credit note exceeds historical invoice totals'; END IF;
  RETURN NULL;
END $$;

-- Guard against changing an issued invoice before the accounting worker posts it.
CREATE FUNCTION ledger_issued_invoice_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'ISSUED' THEN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Issued invoice is immutable'; END IF;
    IF to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN
      RAISE EXCEPTION 'Issued invoice is immutable';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_issued_invoice_guard BEFORE UPDATE OR DELETE ON "Invoice"
FOR EACH ROW EXECUTE FUNCTION ledger_issued_invoice_guard();
