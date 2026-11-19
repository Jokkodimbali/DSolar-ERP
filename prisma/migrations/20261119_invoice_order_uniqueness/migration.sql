-- Enforce the business invariant: a sales order may have at most one invoice.
-- PostgreSQL UNIQUE indexes permit multiple NULL orderId values for standalone invoices.
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_orderId_unique"
ON "Invoice" ("orderId")
WHERE "orderId" IS NOT NULL;
