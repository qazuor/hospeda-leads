-- A business must exist before a management is initiated. This runs before
-- crm_lead_account_link and disables its historical automatic business creation.
-- No existing records, stages or assignments are changed.
CREATE FUNCTION crm_require_management_account() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.account_id IS NULL THEN
    RAISE EXCEPTION 'Creá primero el negocio e iniciá la gestión explícitamente con account_id'
      USING ERRCODE = '23502';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER crm_lead_account_guard BEFORE INSERT ON leads
  FOR EACH ROW EXECUTE FUNCTION crm_require_management_account();

-- Only future batches inherit this default; historical batches remain unchanged.
ALTER TABLE crm_import_batches ALTER COLUMN mode SET DEFAULT 'business';

-- UI retries after an uncertain response reuse the same key; only one record
-- can be created. Keys on historical records stay null.
ALTER TABLE leads ADD COLUMN creation_request_key uuid UNIQUE,
  ADD COLUMN creation_request_hash text;
