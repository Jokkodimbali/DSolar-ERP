-- Historical documents are intentionally left without a fabricated company identity.
ALTER TABLE "Proforma" ADD COLUMN "companySettingsId" UUID REFERENCES "CompanySettings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD COLUMN "companySettingsId" UUID REFERENCES "CompanySettings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryNote" ADD COLUMN "companySettingsId" UUID REFERENCES "CompanySettings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD COLUMN "companySettingsId" UUID REFERENCES "CompanySettings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION capture_company_settings() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD."companySettingsId" IS DISTINCT FROM NEW."companySettingsId" THEN
      RAISE EXCEPTION 'Historical company settings cannot be replaced';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'Payment' THEN
    IF TG_OP = 'INSERT' THEN
      SELECT "id" INTO NEW."companySettingsId" FROM "CompanySettings" ORDER BY "revision" DESC LIMIT 1;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD."status"::text = 'DRAFT' AND NEW."status"::text IN ('ISSUED', 'CONFIRMED') THEN
      SELECT "id" INTO NEW."companySettingsId" FROM "CompanySettings" ORDER BY "revision" DESC LIMIT 1;
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    NEW."companySettingsId" := NULL;
    IF NEW."status"::text IN ('ISSUED', 'ACCEPTED', 'CONFIRMED') THEN
      SELECT "id" INTO NEW."companySettingsId" FROM "CompanySettings" ORDER BY "revision" DESC LIMIT 1;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER capture_company_settings BEFORE INSERT OR UPDATE ON "Proforma" FOR EACH ROW EXECUTE FUNCTION capture_company_settings();
CREATE TRIGGER capture_company_settings BEFORE INSERT OR UPDATE ON "Invoice" FOR EACH ROW EXECUTE FUNCTION capture_company_settings();
CREATE TRIGGER capture_company_settings BEFORE INSERT OR UPDATE ON "DeliveryNote" FOR EACH ROW EXECUTE FUNCTION capture_company_settings();
CREATE TRIGGER capture_company_settings BEFORE INSERT OR UPDATE ON "Payment" FOR EACH ROW EXECUTE FUNCTION capture_company_settings();

CREATE FUNCTION notify_low_stock() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  threshold integer;
BEGIN
  SELECT "lowStockThreshold" INTO threshold FROM "CompanySettings" ORDER BY "revision" DESC LIMIT 1;
  threshold := COALESCE(threshold, 5);
  IF NEW."quantity" - NEW."reserved" > threshold THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD."quantity" - OLD."reserved" <= threshold THEN RETURN NEW; END IF;
  END IF;
  INSERT INTO "AuditLog" ("id", "action", "entityType", "entityId", "storeId", "createdAt")
  VALUES (gen_random_uuid(), 'LOW_STOCK', 'StoreStock', NEW."id"::text, NEW."storeId", CURRENT_TIMESTAMP);
  RETURN NEW;
END;
$$;
CREATE TRIGGER notify_low_stock AFTER INSERT OR UPDATE OF "quantity", "reserved" ON "StoreStock"
FOR EACH ROW EXECUTE FUNCTION notify_low_stock();
