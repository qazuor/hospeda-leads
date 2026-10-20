-- Domain-scoped live versions. Each write bumps `crm_live_version:<domain>` for every domain passed as a
-- trigger argument, plus the legacy `crm_live_version` key so tabs loaded before this deploy keep refreshing.
-- Domains: business (accounts, managements, contacts, notes, pipeline, work items, data quality),
-- work (work items and work configuration), communication (messages, templates, outbox, resources,
-- contact restrictions, communication journal), catalog (shared configuration and people), journal.
CREATE OR REPLACE FUNCTION bump_crm_live_domain()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE stamp text:=extract(epoch from clock_timestamp())::text;
BEGIN
  -- Keys are written in a fixed order so concurrent transactions lock the rows in the same order.
  INSERT INTO app_settings(key,value,updated_at)
  SELECT k,stamp,clock_timestamp() FROM unnest(array_append(ARRAY(SELECT 'crm_live_version:'||d FROM unnest(TG_ARGV) d),'crm_live_version')) k ORDER BY k
  ON CONFLICT(key) DO UPDATE
    SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at;
  RETURN NULL;
END;
$$;

INSERT INTO app_settings(key,value)
SELECT 'crm_live_version:'||d,extract(epoch from clock_timestamp())::text FROM unnest(ARRAY['business','work','communication','catalog','journal']) d
ON CONFLICT(key) DO NOTHING;

-- 001_initial
CREATE OR REPLACE TRIGGER leads_live_version AFTER INSERT OR UPDATE OR DELETE ON leads FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('business');
CREATE OR REPLACE TRIGGER lead_notes_live_version AFTER INSERT OR UPDATE OR DELETE ON lead_notes FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('business');
CREATE OR REPLACE TRIGGER lead_journal_live_version AFTER INSERT OR UPDATE OR DELETE ON lead_journal FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('journal');
CREATE OR REPLACE TRIGGER message_templates_live_version AFTER INSERT OR UPDATE OR DELETE ON message_templates FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication');
CREATE OR REPLACE TRIGGER crm_cities_live_version AFTER INSERT OR UPDATE OR DELETE ON crm_cities FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('catalog');
CREATE OR REPLACE TRIGGER crm_subtypes_live_version AFTER INSERT OR UPDATE OR DELETE ON crm_subtypes FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('catalog');
CREATE OR REPLACE TRIGGER crm_verticals_live_version AFTER INSERT OR UPDATE OR DELETE ON crm_verticals FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('catalog');
CREATE OR REPLACE TRIGGER authorized_emails_live_version AFTER INSERT OR UPDATE OR DELETE ON authorized_emails FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('catalog');
CREATE OR REPLACE TRIGGER users_live_version AFTER INSERT OR UPDATE OR DELETE ON users FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('catalog');
CREATE OR REPLACE TRIGGER email_outbox_live_version AFTER INSERT OR UPDATE OR DELETE ON email_outbox FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication');
-- 004_commercial_foundation
CREATE OR REPLACE TRIGGER crm_accounts_live_version AFTER INSERT OR UPDATE OR DELETE ON crm_accounts FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('business');
CREATE OR REPLACE TRIGGER crm_contacts_live_version AFTER INSERT OR UPDATE OR DELETE ON crm_contacts FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('business');
CREATE OR REPLACE TRIGGER crm_commercial_journal_live_version AFTER INSERT OR UPDATE OR DELETE ON crm_commercial_journal FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('journal');
-- 006_tasks_activities
CREATE OR REPLACE TRIGGER crm_tasks_live AFTER INSERT OR UPDATE OR DELETE ON crm_tasks FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('business','work');
CREATE OR REPLACE TRIGGER crm_activities_live AFTER INSERT OR UPDATE OR DELETE ON crm_activities FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('business','work');
CREATE OR REPLACE TRIGGER crm_work_types_live AFTER INSERT OR UPDATE OR DELETE ON crm_work_types FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('work');
CREATE OR REPLACE TRIGGER crm_work_settings_live AFTER INSERT OR UPDATE ON app_settings FOR EACH ROW WHEN (NEW.key='crm_work_followup') EXECUTE FUNCTION bump_crm_live_domain('work');
-- 007_pipeline_reactivation
CREATE OR REPLACE TRIGGER crm_stages_live AFTER INSERT OR UPDATE OR DELETE ON crm_stages FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('catalog');
CREATE OR REPLACE TRIGGER crm_reasons_live AFTER INSERT OR UPDATE OR DELETE ON crm_loss_reasons FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('catalog');
CREATE OR REPLACE TRIGGER crm_objection_types_live AFTER INSERT OR UPDATE OR DELETE ON crm_objection_types FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('catalog');
CREATE OR REPLACE TRIGGER crm_objections_live AFTER INSERT OR UPDATE OR DELETE ON crm_objections FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('business');
CREATE OR REPLACE TRIGGER crm_pipeline_events_live AFTER INSERT OR UPDATE OR DELETE ON crm_pipeline_events FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('business');
-- 009_data_quality
CREATE OR REPLACE TRIGGER crm_evidence_live AFTER INSERT ON crm_data_evidence FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('business');
CREATE OR REPLACE TRIGGER crm_import_live AFTER INSERT OR UPDATE ON crm_import_batches FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('business');
CREATE OR REPLACE TRIGGER crm_merge_live AFTER INSERT ON crm_account_merges FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('business');
-- 010_communication_resources (crm_sequences and crm_sequence_runs were dropped by 022)
CREATE OR REPLACE TRIGGER resource_live AFTER INSERT OR UPDATE OR DELETE ON crm_contact_restrictions FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication');
CREATE OR REPLACE TRIGGER resource_live AFTER INSERT OR UPDATE OR DELETE ON crm_messages FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication');
CREATE OR REPLACE TRIGGER resource_live AFTER INSERT OR UPDATE OR DELETE ON crm_documents FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication');
CREATE OR REPLACE TRIGGER resource_live AFTER INSERT OR UPDATE OR DELETE ON crm_document_versions FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication');
CREATE OR REPLACE TRIGGER resource_live AFTER INSERT OR UPDATE OR DELETE ON crm_document_categories FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication');
CREATE OR REPLACE TRIGGER resource_live AFTER INSERT ON crm_document_links FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication');
-- 019_business_management_workflows
CREATE OR REPLACE TRIGGER crm_management_reasons_live AFTER INSERT OR UPDATE OR DELETE ON crm_management_reasons FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('catalog');
-- 022_communication_product_model
CREATE OR REPLACE TRIGGER crm_communication_journal_live AFTER INSERT OR UPDATE OR DELETE ON crm_communication_journal FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication');
CREATE OR REPLACE TRIGGER crm_communication_responses_live AFTER INSERT OR UPDATE OR DELETE ON crm_communication_responses FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication');
CREATE OR REPLACE TRIGGER crm_communication_response_corrections_live AFTER INSERT OR UPDATE OR DELETE ON crm_communication_response_corrections FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication');
CREATE OR REPLACE TRIGGER crm_communication_interaction_corrections_live AFTER INSERT OR UPDATE OR DELETE ON crm_communication_interaction_corrections FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication');
CREATE OR REPLACE TRIGGER crm_message_template_versions_live AFTER INSERT OR UPDATE OR DELETE ON crm_message_template_versions FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication');
