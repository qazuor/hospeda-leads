CREATE TABLE crm_account_classifications (
  id bigserial PRIMARY KEY,
  account_id bigint NOT NULL REFERENCES crm_accounts(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (btrim(tipo) <> ''),
  subtipo text CHECK (subtipo IS NULL OR btrim(subtipo) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  CONSTRAINT crm_account_classifications_unique UNIQUE NULLS NOT DISTINCT (account_id, tipo, subtipo)
);
CREATE INDEX crm_account_classifications_tipo ON crm_account_classifications (tipo, account_id);
CREATE INDEX crm_account_classifications_subtipo ON crm_account_classifications (subtipo, account_id) WHERE subtipo IS NOT NULL;
CREATE TRIGGER crm_account_classifications_live_version AFTER INSERT OR UPDATE OR DELETE ON crm_account_classifications
  FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('business');
INSERT INTO crm_account_classifications (account_id, tipo, subtipo, created_by)
SELECT id, btrim(tipo), nullif(btrim(subtipo), ''), 'migration_066'
FROM crm_accounts WHERE nullif(btrim(tipo), '') IS NOT NULL;
COMMENT ON COLUMN crm_accounts.tipo IS 'Display copy of crm_account_classifications (migration 066); drop in a later migration.';
COMMENT ON COLUMN crm_accounts.subtipo IS 'Display copy of crm_account_classifications (migration 066); drop in a later migration.';
