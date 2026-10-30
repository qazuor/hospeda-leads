CREATE INDEX IF NOT EXISTS crm_activities_account_occurred_idx ON crm_activities(account_id, occurred_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS crm_activities_lead_idx ON crm_activities(lead_id) WHERE deleted_at IS NULL AND lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_tasks_account_pending_idx ON crm_tasks(account_id, due_date) WHERE status='pending' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS crm_contacts_account_active_idx ON crm_contacts(account_id, is_primary DESC, id) WHERE deleted_at IS NULL;
DROP INDEX IF EXISTS leads_nombre_idx;
ANALYZE crm_activities;
ANALYZE crm_tasks;
ANALYZE crm_contacts;
