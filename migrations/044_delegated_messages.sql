ALTER TABLE crm_messages ADD COLUMN delegated_task_id bigint REFERENCES crm_tasks(id) ON DELETE SET NULL;
CREATE INDEX crm_messages_delegated_task ON crm_messages(delegated_task_id) WHERE delegated_task_id IS NOT NULL;
