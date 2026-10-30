-- Hoy's first-use checklist (and pendingContactOutcomes) look up one user's own rows: avoid sequential scans for new users.
CREATE INDEX crm_messages_owner_status_idx ON crm_messages(owner_email,status);
CREATE INDEX crm_activities_actor_idx ON crm_activities(actor_email) WHERE deleted_at IS NULL;
CREATE INDEX crm_work_journal_actor_idx ON crm_work_journal(actor_email,entity,action);
-- U-24 (pendingContactOutcomes) excludes messages whose linked response is 'do_not_contact'.
CREATE INDEX crm_communication_responses_dnc_message_idx ON crm_communication_responses(linked_message_id) WHERE category='do_not_contact';
