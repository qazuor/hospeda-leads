-- The owner confirmed that every sequence and generated step in this CRM was
-- test data. Remove only records linked to sequence runs; preserve ordinary
-- tasks, activities, messages, provider events and journals.
CREATE TEMP TABLE _sequence_messages ON COMMIT DROP AS
SELECT id,activity_id,outbox_id,task_id,lead_id
FROM crm_messages WHERE run_id IS NOT NULL;
CREATE TEMP TABLE _sequence_runs ON COMMIT DROP AS
SELECT id FROM crm_sequence_runs;
CREATE TEMP TABLE _sequence_tasks ON COMMIT DROP AS
SELECT DISTINCT task_id AS id FROM _sequence_messages WHERE task_id IS NOT NULL;
CREATE TEMP TABLE _sequence_activities ON COMMIT DROP AS
SELECT DISTINCT activity_id AS id FROM _sequence_messages WHERE activity_id IS NOT NULL;
CREATE TEMP TABLE _sequence_outbox ON COMMIT DROP AS
SELECT DISTINCT outbox_id AS id FROM _sequence_messages WHERE outbox_id IS NOT NULL;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM _sequence_tasks st
    JOIN crm_messages m ON m.task_id=st.id AND m.run_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Sequence cleanup blocked: a generated task is also linked to an independent message';
  END IF;
  IF EXISTS (
    SELECT 1 FROM _sequence_activities sa
    JOIN crm_messages m ON m.activity_id=sa.id AND m.run_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Sequence cleanup blocked: a generated activity is also linked to an independent message';
  END IF;
  IF EXISTS (
    SELECT 1 FROM _sequence_tasks st
    JOIN crm_activities a ON a.task_id=st.id
    LEFT JOIN _sequence_activities sa ON sa.id=a.id
    WHERE sa.id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM _sequence_tasks st
    JOIN crm_pipeline_events p ON p.task_id=st.id
  ) THEN
    RAISE EXCEPTION 'Sequence cleanup blocked: a generated task is referenced by independent activity or pipeline history';
  END IF;
  IF EXISTS (
    SELECT 1 FROM _sequence_activities sa
    JOIN crm_documents d ON d.activity_id=sa.id
  ) OR EXISTS (
    SELECT 1 FROM _sequence_activities sa
    JOIN crm_document_links l ON l.activity_id=sa.id
  ) THEN
    RAISE EXCEPTION 'Sequence cleanup blocked: a generated activity is linked to a document';
  END IF;
END $$;

DELETE FROM crm_email_events e USING _sequence_outbox o WHERE e.outbox_id=o.id;
DELETE FROM crm_email_events e USING _sequence_messages m
 WHERE e.payload->'tags' ? ('hospeda-'||m.id::text);
DELETE FROM crm_messages WHERE run_id IS NOT NULL;
DELETE FROM email_outbox o USING _sequence_outbox s WHERE o.id=s.id;
DELETE FROM crm_activities a USING _sequence_activities s WHERE a.id=s.id;
DELETE FROM crm_tasks t USING _sequence_tasks s WHERE t.id=s.id;
DELETE FROM crm_sequence_runs;
DELETE FROM crm_sequences;

-- Resource audit triggers on these tables record the cleanup itself. Remove
-- those generated audit rows after the DELETEs, along with older sequence rows.
DELETE FROM lead_journal j USING _sequence_messages m
 WHERE j.action='contact_logged' AND j.metadata->>'messageId'=m.id::text;
DELETE FROM crm_work_journal j USING _sequence_tasks t
 WHERE j.entity='crm_tasks' AND j.entity_id=t.id;
DELETE FROM crm_work_journal j USING _sequence_activities a
 WHERE j.entity='crm_activities' AND j.entity_id=a.id;
DELETE FROM crm_resource_journal j USING _sequence_messages m
 WHERE j.entity='crm_messages' AND j.entity_id=m.id::text;
DELETE FROM crm_resource_journal j USING _sequence_runs r
 WHERE j.entity='crm_sequence_runs' AND j.entity_id=r.id::text;
DELETE FROM crm_resource_journal WHERE entity='crm_sequences';

DROP TRIGGER IF EXISTS crm_sequence_lead_stop ON leads;
DROP TRIGGER IF EXISTS crm_sequence_account_stop ON crm_accounts;
DROP TRIGGER IF EXISTS crm_sequence_activity_stop ON crm_activities;
DROP FUNCTION IF EXISTS crm_sequence_lead_stop();
DROP FUNCTION IF EXISTS crm_sequence_account_stop();
DROP FUNCTION IF EXISTS crm_sequence_activity_stop();
DROP FUNCTION IF EXISTS crm_stop_sequences(bigint,text);
DROP INDEX IF EXISTS crm_sequence_one_active;
ALTER TABLE crm_messages DROP COLUMN run_id;
ALTER TABLE crm_messages DROP COLUMN step_index;
DROP TABLE crm_sequence_runs;
DROP TABLE crm_sequences;

ALTER TABLE crm_messages DROP CONSTRAINT crm_messages_channel_check;
ALTER TABLE crm_messages ADD CONSTRAINT crm_messages_channel_check
  CHECK(channel IN ('email','whatsapp','call','social','other'));
ALTER TABLE crm_messages DROP CONSTRAINT crm_messages_status_check;
ALTER TABLE crm_messages ADD CONSTRAINT crm_messages_status_check CHECK(status IN (
  'draft','whatsapp_opened','manual_pending','manual_sent','manual_no_contact','manual_not_done',
  'submitting','accepted','delivery_confirmed','failed','unknown','replied','rejected','cancelled'
));
ALTER TABLE crm_messages
  ADD COLUMN purpose text CHECK(purpose IN ('verification','first_contact','resume','relationship','care','operations','other')),
  ADD COLUMN other_purpose text,
  ADD COLUMN destination_detail text,
  ADD COLUMN content_hash text,
  ADD COLUMN summary text,
  ADD COLUMN completed_at timestamptz,
  ADD COLUMN completed_by_email text REFERENCES users(email) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE message_templates DROP CONSTRAINT message_templates_channel_check;
ALTER TABLE message_templates ADD CONSTRAINT message_templates_channel_check
  CHECK(channel IN ('email','whatsapp','social','other'));
ALTER TABLE message_templates ADD COLUMN management_type text
  CHECK(management_type IN ('main','partner','provider','editor','accompaniment'));

ALTER TABLE crm_contact_restrictions DROP CONSTRAINT crm_contact_restrictions_channel_check;
ALTER TABLE crm_contact_restrictions ADD CONSTRAINT crm_contact_restrictions_channel_check
  CHECK(channel IN ('email','whatsapp','call','social','other','all'));
ALTER TABLE crm_contact_restrictions DROP CONSTRAINT crm_contact_restrictions_check;
ALTER TABLE crm_contact_restrictions
  ADD COLUMN source text NOT NULL DEFAULT 'manual' CHECK(source IN ('automatic','manual')),
  ADD COLUMN evidence text;

CREATE TABLE crm_communication_responses (
  id uuid PRIMARY KEY,
  account_id bigint NOT NULL REFERENCES crm_accounts(id),
  original_account_id bigint NOT NULL REFERENCES crm_accounts(id),
  lead_id bigint REFERENCES leads(id) ON DELETE SET NULL,
  contact_id bigint REFERENCES crm_contacts(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK(channel IN ('email','whatsapp','call','social','other')),
  recipient text NOT NULL,
  recipient_name text NOT NULL DEFAULT '',
  destination_detail text,
  linked_message_id uuid REFERENCES crm_messages(id) ON DELETE SET NULL,
  category text NOT NULL CHECK(category IN ('interested','information','later','rejected','not_now','operational','do_not_contact','other')),
  summary text NOT NULL CHECK(length(btrim(summary))>0),
  exact_text text,
  other_detail text,
  actor_email text NOT NULL REFERENCES users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_communication_responses_account ON crm_communication_responses(account_id,occurred_at DESC);
CREATE INDEX crm_communication_responses_lead ON crm_communication_responses(lead_id,occurred_at DESC);

CREATE TABLE crm_communication_response_corrections (
  id bigserial PRIMARY KEY,
  response_id uuid NOT NULL REFERENCES crm_communication_responses(id) ON DELETE CASCADE,
  account_id bigint NOT NULL REFERENCES crm_accounts(id),
  lead_id bigint REFERENCES leads(id) ON DELETE SET NULL,
  actor_email text NOT NULL REFERENCES users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  reason text NOT NULL CHECK(length(btrim(reason))>=3),
  before_value jsonb NOT NULL,
  after_value jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_communication_response_corrections_response ON crm_communication_response_corrections(response_id,created_at);

CREATE TABLE crm_communication_interaction_corrections (
  id bigserial PRIMARY KEY,
  message_id uuid NOT NULL REFERENCES crm_messages(id) ON DELETE CASCADE,
  account_id bigint NOT NULL REFERENCES crm_accounts(id),
  lead_id bigint REFERENCES leads(id) ON DELETE SET NULL,
  actor_email text NOT NULL REFERENCES users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  reason text NOT NULL CHECK(length(btrim(reason))>=3),
  before_value jsonb NOT NULL,
  after_value jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_communication_interaction_corrections_message ON crm_communication_interaction_corrections(message_id,created_at);

CREATE TABLE crm_communication_journal (
  id bigserial PRIMARY KEY,
  account_id bigint NOT NULL REFERENCES crm_accounts(id),
  original_account_id bigint NOT NULL REFERENCES crm_accounts(id),
  lead_id bigint REFERENCES leads(id) ON DELETE SET NULL,
  entity_type text NOT NULL CHECK(entity_type IN ('interaction','response','restriction','business')),
  entity_id text NOT NULL,
  action text NOT NULL,
  actor_email text,
  actor_name text,
  is_automatic boolean NOT NULL DEFAULT false,
  triggered_by_email text,
  related_event_id bigint REFERENCES crm_communication_journal(id) ON DELETE SET NULL,
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_communication_journal_account ON crm_communication_journal(account_id,created_at DESC);
CREATE INDEX crm_communication_journal_lead ON crm_communication_journal(lead_id,created_at DESC);

ALTER TABLE crm_tasks ADD COLUMN communication_response_id uuid
  REFERENCES crm_communication_responses(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX crm_tasks_communication_response ON crm_tasks(communication_response_id)
  WHERE communication_response_id IS NOT NULL;

CREATE TABLE crm_message_template_versions (
  id bigserial PRIMARY KEY,
  template_id bigint NOT NULL REFERENCES message_templates(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK(version>0),
  snapshot jsonb NOT NULL,
  actor_email text REFERENCES users(email) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(template_id,version)
);
INSERT INTO crm_message_template_versions(template_id,version,snapshot)
SELECT id,1,to_jsonb(t) FROM message_templates t;
CREATE INDEX crm_message_template_versions_lookup ON crm_message_template_versions(template_id,version DESC);

CREATE TRIGGER crm_communication_journal_live AFTER INSERT OR UPDATE OR DELETE ON crm_communication_journal
  FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_version();
CREATE TRIGGER crm_communication_responses_live AFTER INSERT OR UPDATE OR DELETE ON crm_communication_responses
  FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_version();
CREATE TRIGGER crm_communication_response_corrections_live AFTER INSERT OR UPDATE OR DELETE ON crm_communication_response_corrections
  FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_version();
CREATE TRIGGER crm_communication_interaction_corrections_live AFTER INSERT OR UPDATE OR DELETE ON crm_communication_interaction_corrections
  FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_version();
CREATE TRIGGER crm_message_template_versions_live AFTER INSERT OR UPDATE OR DELETE ON crm_message_template_versions
  FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_version();
