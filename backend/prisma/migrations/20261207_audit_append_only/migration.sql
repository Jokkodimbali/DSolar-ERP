-- Preserve existing audit history. Application writes may only append new events.
CREATE FUNCTION audit_log_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit history is append-only' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER audit_log_no_mutation BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON "AuditLog"
FOR EACH STATEMENT EXECUTE FUNCTION audit_log_append_only();
CREATE INDEX "AuditLog_createdAt_id_idx" ON "AuditLog" ("createdAt",id);
CREATE INDEX "AuditLog_actorId_createdAt_id_idx" ON "AuditLog" ("actorId","createdAt",id);
CREATE INDEX "AuditLog_storeId_createdAt_id_idx" ON "AuditLog" ("storeId","createdAt",id);
