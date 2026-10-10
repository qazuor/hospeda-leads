-- Business deletion is independent from opportunity deletion and archiving.
-- Existing accounts keep their state; no historical records are reclassified.
ALTER TABLE crm_accounts ADD COLUMN deleted_at timestamptz;
ALTER TABLE crm_accounts ADD COLUMN deleted_by_email text;
ALTER TABLE crm_accounts ADD COLUMN deletion_reason text;
CREATE INDEX crm_accounts_deleted ON crm_accounts(deleted_at) WHERE deleted_at IS NOT NULL;
