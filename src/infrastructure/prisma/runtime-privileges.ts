import { PrismaClient } from '@prisma/client';

export async function inspectRuntimePrivileges(prisma: PrismaClient) {
  const rows = await prisma.$queryRaw<{ check_name: string }[]>`
    WITH runtime AS (SELECT * FROM pg_roles WHERE rolname = current_user),
    objects AS (
      SELECT c.oid, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','f')
    )
    SELECT 'ROLE_ATTRIBUTES' AS check_name FROM runtime
      WHERE rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls
      OR NOT rolcanlogin OR current_user <> session_user
    UNION ALL
    SELECT 'ROLE_MEMBERSHIP' FROM runtime WHERE EXISTS (SELECT 1 FROM pg_auth_members WHERE member = runtime.oid)
    UNION ALL
    SELECT 'OBJECT_OWNERSHIP' FROM runtime
      WHERE EXISTS (SELECT 1 FROM pg_database WHERE datname = current_database() AND datdba = runtime.oid)
      OR EXISTS (SELECT 1 FROM pg_namespace WHERE nspowner = runtime.oid)
      OR EXISTS (SELECT 1 FROM pg_class WHERE relowner = runtime.oid)
      OR EXISTS (SELECT 1 FROM pg_proc WHERE proowner = runtime.oid)
      OR EXISTS (SELECT 1 FROM pg_type WHERE typowner = runtime.oid)
    UNION ALL
    SELECT 'SCHEMA_OR_DATABASE_DDL'
      WHERE has_database_privilege(current_database(), 'CREATE,TEMP')
      OR EXISTS (SELECT 1 FROM pg_namespace WHERE has_schema_privilege(oid, 'CREATE'))
    UNION ALL
    SELECT 'TRIGGER_BYPASS'
      WHERE has_parameter_privilege('session_replication_role', 'SET')
      OR current_setting('session_replication_role') <> 'origin'
    UNION ALL
    SELECT 'PRIVILEGED_FUNCTION'
      WHERE EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.prosecdef AND has_function_privilege(p.oid, 'EXECUTE'))
    UNION ALL
    SELECT 'EXCESSIVE_TABLE_PRIVILEGES'
      WHERE EXISTS (SELECT 1 FROM objects
        WHERE has_table_privilege(oid, 'TRUNCATE,TRIGGER,REFERENCES,SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION,DELETE WITH GRANT OPTION')
        OR has_any_column_privilege(oid, 'REFERENCES,SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION'))
    UNION ALL
    SELECT 'READ_ONLY_VIOLATION' WHERE EXISTS (
      SELECT 1 FROM objects WHERE relname IN ('Role','Permission','RolePermission','LedgerPendingSource')
      AND (has_table_privilege(oid, 'INSERT,UPDATE,DELETE') OR has_any_column_privilege(oid, 'INSERT,UPDATE')))
    UNION ALL
    SELECT 'AUDIT_OR_LEDGER_MUTATION' WHERE EXISTS (
      SELECT 1 FROM objects WHERE relname IN ('AuditLog','StockMovement','StockTransferEvent','LedgerLine','CreditNoteLine','CompanySettings','NotificationRead')
      AND (has_table_privilege(oid, 'UPDATE,DELETE') OR has_any_column_privilege(oid, 'UPDATE')))
    UNION ALL
    SELECT 'MIGRATION_METADATA_ACCESS' WHERE EXISTS (
      SELECT 1 FROM objects WHERE relname = '_prisma_migrations'
      AND (has_table_privilege(oid, 'SELECT,INSERT,UPDATE,DELETE') OR has_any_column_privilege(oid, 'SELECT,INSERT,UPDATE')))
    UNION ALL
    SELECT 'MISSING_REQUIRED_PRIVILEGES'
      WHERE NOT has_schema_privilege('public', 'USAGE')
        OR NOT has_table_privilege('public."AuditLog"', 'SELECT')
        OR NOT has_table_privilege('public."AuditLog"', 'INSERT')
        OR NOT has_table_privilege('public."LedgerPendingSource"', 'SELECT')
  `;
  const checks = rows.map((row) => row.check_name);
  return { safe: checks.length === 0, checks };
}

export async function assertRuntimePrivileges(prisma: PrismaClient): Promise<void> {
  const report = await inspectRuntimePrivileges(prisma);
  if (!report.safe) throw new Error('Privilèges PostgreSQL incompatibles : ' + report.checks.join(', '));
}
