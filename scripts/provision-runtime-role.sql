\set ON_ERROR_STOP on
-- Run as the schema owner, after migrations, on the dedicated ERP database.
-- The runtime login must already exist; no passwords are accepted by this script.
BEGIN;
SELECT set_config('dsolar.runtime_role', :'runtime_role', true);
DO $$
DECLARE
  runtime name := current_setting('dsolar.runtime_role');
  account pg_roles%ROWTYPE;
  table_name text;
  relation record;
  readonly_tables text[] := ARRAY['Role','Permission','RolePermission','LedgerPendingSource'];
  append_tables text[] := ARRAY['AuditLog','StockMovement','StockTransferEvent','LedgerLine','CreditNoteLine','CompanySettings','NotificationRead'];
  update_tables text[] := ARRAY['LedgerAccount','LedgerJournal','LedgerPeriod','LedgerEntry','LedgerPostingRule',
    'LedgerAccountClassification','LedgerBankAccount','LedgerBankStatement','LedgerBankLine','LedgerAutomation'];
  business_tables text[] := ARRAY[
    'Store','Product','StoreStock','User','UserRole','UserStoreAccess','RefreshSession',
    'Category','Brand','TaxRegime','ProductPrice','SerialNumber','StockTransfer','StockTransferLine',
    'InventorySession','InventoryLine','Supplier','PurchaseOrder','PurchaseOrderLine','GoodsReceipt','GoodsReceiptLine',
    'Customer','Proforma','ProformaLine','SalesOrder','SalesOrderLine','DeliveryNote','DeliveryLine','Invoice','InvoiceLine',
    'CreditNote','Payment','PaymentAllocation','PaymentReversal','DiscountApproval','DocumentSequence','IdempotencyKey',
    'CashRegister','CashSession','CashMovement','ExpenseCategory','Expense','SupplierReturn','SupplierReturnLine',
    'SupplierReturnCredit','SupplierReturnSerial','LedgerAutomationFailure','AuthRateLimitBucket'];
BEGIN
  SELECT * INTO account FROM pg_roles WHERE rolname = runtime;
  IF NOT FOUND OR NOT account.rolcanlogin OR runtime = current_user THEN
    RAISE EXCEPTION 'A distinct existing runtime login is required';
  END IF;
  IF account.rolsuper OR account.rolcreaterole OR account.rolcreatedb OR account.rolreplication OR account.rolbypassrls
     OR EXISTS (SELECT 1 FROM pg_auth_members WHERE member = account.oid) THEN
    RAISE EXCEPTION 'Runtime login has elevated attributes or role memberships';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_database WHERE datname = current_database() AND datdba = account.oid)
    OR EXISTS (SELECT 1 FROM pg_namespace WHERE nspowner = account.oid)
    OR EXISTS (SELECT 1 FROM pg_class WHERE relowner = account.oid)
    OR EXISTS (SELECT 1 FROM pg_proc WHERE proowner = account.oid)
    OR EXISTS (SELECT 1 FROM pg_type WHERE typowner = account.oid) THEN
    RAISE EXCEPTION 'Runtime login owns database objects';
  END IF;

  EXECUTE format('REVOKE ALL PRIVILEGES ON DATABASE %I FROM %I', current_database(), runtime);
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), runtime);
  EXECUTE format('REVOKE ALL PRIVILEGES ON SCHEMA public FROM %I', runtime);
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', runtime);
  IF has_database_privilege(runtime, current_database(), 'CREATE')
    OR has_database_privilege(runtime, current_database(), 'TEMP')
    OR EXISTS (SELECT 1 FROM pg_namespace n WHERE has_schema_privilege(runtime, n.oid, 'CREATE')) THEN
    RAISE EXCEPTION 'Runtime login inherits CREATE or TEMP privileges; review PUBLIC grants before provisioning';
  END IF;

  -- Reset previous direct grants; new tables are not automatically accessible.
  EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I', runtime);
  EXECUTE format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I', runtime);
  FOREACH table_name IN ARRAY readonly_tables LOOP
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO %I', table_name, runtime);
  END LOOP;
  FOREACH table_name IN ARRAY append_tables LOOP
    EXECUTE format('GRANT SELECT, INSERT ON TABLE public.%I TO %I', table_name, runtime);
  END LOOP;
  FOREACH table_name IN ARRAY update_tables LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE public.%I TO %I', table_name, runtime);
  END LOOP;
  FOREACH table_name IN ARRAY business_tables LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO %I', table_name, runtime);
  END LOOP;
  EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', runtime);

  IF has_parameter_privilege(runtime, 'session_replication_role', 'SET') THEN
    RAISE EXCEPTION 'Runtime login can bypass replication-sensitive triggers';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef AND has_function_privilege(runtime, p.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'Runtime login can execute a SECURITY DEFINER function in public';
  END IF;
  -- Check effective privileges, including PUBLIC and any pre-existing column grants.
  FOR relation IN SELECT c.oid,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','f')
  LOOP
    IF has_table_privilege(runtime, relation.oid, 'TRUNCATE')
      OR has_table_privilege(runtime, relation.oid, 'TRIGGER')
      OR has_table_privilege(runtime, relation.oid, 'REFERENCES')
      OR has_any_column_privilege(runtime, relation.oid, 'REFERENCES')
      OR has_table_privilege(runtime, relation.oid, 'SELECT WITH GRANT OPTION')
      OR has_table_privilege(runtime, relation.oid, 'INSERT WITH GRANT OPTION')
      OR has_table_privilege(runtime, relation.oid, 'UPDATE WITH GRANT OPTION')
      OR has_table_privilege(runtime, relation.oid, 'DELETE WITH GRANT OPTION')
      OR has_any_column_privilege(runtime, relation.oid, 'SELECT WITH GRANT OPTION, INSERT WITH GRANT OPTION, UPDATE WITH GRANT OPTION') THEN
      RAISE EXCEPTION 'Unexpected effective privileges on %', relation.relname;
    END IF;
    IF relation.relname = ANY(readonly_tables || append_tables || update_tables) AND
      has_table_privilege(runtime, relation.oid, 'DELETE') THEN
      RAISE EXCEPTION 'Unexpected DELETE privilege on %', relation.relname;
    END IF;
    IF relation.relname = ANY(readonly_tables || append_tables) AND
      (has_table_privilege(runtime, relation.oid, 'UPDATE') OR has_any_column_privilege(runtime, relation.oid, 'UPDATE')) THEN
      RAISE EXCEPTION 'Unexpected UPDATE privilege on %', relation.relname;
    END IF;
    IF relation.relname = ANY(readonly_tables) AND
      (has_table_privilege(runtime, relation.oid, 'INSERT') OR has_any_column_privilege(runtime, relation.oid, 'INSERT')) THEN
      RAISE EXCEPTION 'Unexpected INSERT privilege on %', relation.relname;
    END IF;
    IF NOT (relation.relname = ANY(readonly_tables || append_tables || update_tables || business_tables)) AND
      (has_table_privilege(runtime, relation.oid, 'SELECT, INSERT, UPDATE, DELETE') OR
       has_any_column_privilege(runtime, relation.oid, 'SELECT, INSERT, UPDATE')) THEN
      RAISE EXCEPTION 'Unexpected privilege on unlisted object %', relation.relname;
    END IF;
  END LOOP;
END $$;
COMMIT;
