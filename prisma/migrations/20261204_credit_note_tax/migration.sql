ALTER TABLE "CreditNote" ADD COLUMN "netAmount" DECIMAL(18,2), ADD COLUMN "taxAmount" DECIMAL(18,2);
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_tax_snapshot_check" CHECK (
  ("netAmount" IS NULL AND "taxAmount" IS NULL) OR
  ("netAmount" IS NOT NULL AND "taxAmount" IS NOT NULL AND "netAmount" >= 0 AND "taxAmount" >= 0
    AND "netAmount" + "taxAmount" = amount AND amount > 0)
);
CREATE TABLE "CreditNoteLine" (
  id UUID PRIMARY KEY,
  "creditNoteId" UUID NOT NULL REFERENCES "CreditNote"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "invoiceLineId" UUID NOT NULL REFERENCES "InvoiceLine"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "netAmount" DECIMAL(18,2) NOT NULL CHECK ("netAmount" > 0),
  "taxAmount" DECIMAL(18,2) NOT NULL CHECK ("taxAmount" >= 0),
  UNIQUE ("creditNoteId","invoiceLineId")
);
CREATE INDEX "CreditNoteLine_invoiceLineId_idx" ON "CreditNoteLine" ("invoiceLineId");

-- Never change historical invoice line amounts after issuance.
CREATE FUNCTION ledger_invoice_line_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE invoice_id uuid; current_status text;
BEGIN
  FOR invoice_id IN SELECT DISTINCT x FROM unnest(ARRAY[
    CASE WHEN TG_OP <> 'INSERT' THEN OLD."invoiceId" ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW."invoiceId" ELSE NULL END
  ]) AS x WHERE x IS NOT NULL ORDER BY x
  LOOP
    SELECT status::text INTO current_status FROM "Invoice" WHERE id = invoice_id FOR UPDATE;
    IF current_status = 'ISSUED' THEN RAISE EXCEPTION 'Issued invoice lines are immutable'; END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_invoice_line_guard BEFORE INSERT OR UPDATE OR DELETE ON "InvoiceLine"
FOR EACH ROW EXECUTE FUNCTION ledger_invoice_line_guard();

-- Detailed credits cannot be altered after creation. Legacy rows remain distinguishable.
CREATE FUNCTION ledger_credit_detail_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE note "CreditNote"%ROWTYPE; line "InvoiceLine"%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Credit note details are immutable'; END IF;
  SELECT * INTO note FROM "CreditNote" WHERE id = NEW."creditNoteId" FOR UPDATE;
  SELECT * INTO line FROM "InvoiceLine" WHERE id = NEW."invoiceLineId";
  IF note."netAmount" IS NULL OR line."invoiceId" <> note."invoiceId" OR EXISTS (
    SELECT 1 FROM "LedgerEntry" WHERE "sourceType" = 'CREDIT_NOTE' AND "sourceId" = note.id AND "postedAt" IS NOT NULL
  ) THEN RAISE EXCEPTION 'Invalid credit note detail'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_credit_detail_guard BEFORE INSERT OR UPDATE OR DELETE ON "CreditNoteLine"
FOR EACH ROW EXECUTE FUNCTION ledger_credit_detail_guard();

CREATE FUNCTION ledger_credit_snapshot_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."netAmount" IS NOT NULL OR NEW."netAmount" IS NOT NULL OR OLD."taxAmount" IS NOT NULL OR NEW."taxAmount" IS NOT NULL THEN
    RAISE EXCEPTION 'Detailed credit note is immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_credit_snapshot_guard BEFORE UPDATE OR DELETE ON "CreditNote"
FOR EACH ROW EXECUTE FUNCTION ledger_credit_snapshot_guard();

-- Deferred checks validate the parent and all child amounts at commit.
CREATE FUNCTION ledger_validate_credit_details() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE note_id uuid; note "CreditNote"%ROWTYPE; net numeric; tax numeric;
BEGIN
  IF TG_TABLE_NAME = 'CreditNote' THEN note_id := NEW.id;
  ELSE note_id := NEW."creditNoteId"; END IF;
  SELECT * INTO note FROM "CreditNote" WHERE id = note_id;
  IF NOT FOUND OR note."netAmount" IS NULL THEN RETURN NULL; END IF;
  SELECT coalesce(sum("netAmount"),0), coalesce(sum("taxAmount"),0) INTO net,tax
    FROM "CreditNoteLine" WHERE "creditNoteId" = note_id;
  IF net <> note."netAmount" OR tax <> note."taxAmount" THEN RAISE EXCEPTION 'Credit note details do not balance'; END IF;
  IF EXISTS (
    SELECT 1 FROM "InvoiceLine" l JOIN "CreditNoteLine" c ON c."invoiceLineId" = l.id
    WHERE l."invoiceId" = note."invoiceId"
    GROUP BY l.id, l."lineTotal", l."taxAmount"
    HAVING sum(c."netAmount") > l."lineTotal" - l."taxAmount" OR sum(c."taxAmount") > l."taxAmount"
  ) THEN RAISE EXCEPTION 'Credit note exceeds original invoice line'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER ledger_credit_parent_check AFTER INSERT ON "CreditNote"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_validate_credit_details();
CREATE CONSTRAINT TRIGGER ledger_credit_child_check AFTER INSERT ON "CreditNoteLine"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_validate_credit_details();
