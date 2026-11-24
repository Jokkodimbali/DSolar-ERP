CREATE TABLE "CompanySettings" (
  "id" UUID NOT NULL PRIMARY KEY,
  "revision" INTEGER NOT NULL UNIQUE CHECK ("revision" > 0),
  "legalName" VARCHAR(180) NOT NULL,
  "tradeName" VARCHAR(180) NOT NULL,
  "taxId" VARCHAR(80) NOT NULL,
  "registrationNumber" VARCHAR(100) NOT NULL,
  "legalForm" VARCHAR(100) NOT NULL,
  "address" VARCHAR(500) NOT NULL,
  "phone" VARCHAR(60) NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "website" VARCHAR(300) NOT NULL,
  "logoUrl" VARCHAR(500) NOT NULL,
  "bankName" VARCHAR(180) NOT NULL,
  "bankAccount" VARCHAR(180) NOT NULL,
  "documentFooter" VARCHAR(500) NOT NULL,
  "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
  "lowStockThreshold" INTEGER NOT NULL DEFAULT 5 CHECK ("lowStockThreshold" BETWEEN 0 AND 1000000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanySettings_legalName_nonempty" CHECK (length(btrim("legalName")) > 0)
);
CREATE TABLE "NotificationRead" (
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "auditId" UUID NOT NULL REFERENCES "AuditLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("userId", "auditId")
);
CREATE INDEX "NotificationRead_auditId_idx" ON "NotificationRead"("auditId");
CREATE FUNCTION company_settings_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Company settings revisions are immutable';
END;
$$;
CREATE TRIGGER company_settings_immutable BEFORE UPDATE OR DELETE ON "CompanySettings"
FOR EACH ROW EXECUTE FUNCTION company_settings_immutable();
CREATE TRIGGER company_settings_no_truncate BEFORE TRUNCATE ON "CompanySettings"
FOR EACH STATEMENT EXECUTE FUNCTION company_settings_immutable();
