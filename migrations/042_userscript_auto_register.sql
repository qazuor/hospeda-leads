ALTER TABLE users ADD COLUMN userscript_auto_register boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN userscript_auto_register_since timestamptz NOT NULL DEFAULT now();

ALTER TABLE crm_messages DROP CONSTRAINT crm_messages_status_check;
ALTER TABLE crm_messages ADD CONSTRAINT crm_messages_status_check CHECK(status IN (
  'draft','whatsapp_opened','manual_pending','manual_sent','manual_no_contact','manual_not_done',
  'submitting','accepted','delivery_confirmed','failed','unknown','replied','rejected','cancelled','voided'
));

ALTER TABLE crm_inbound_messages DROP CONSTRAINT crm_inbound_messages_status_check;
ALTER TABLE crm_inbound_messages ADD CONSTRAINT crm_inbound_messages_status_check CHECK(status IN ('unmatched','pending_review','registered','dismissed','voided'));
ALTER TABLE crm_inbound_messages ALTER COLUMN external_id DROP NOT NULL;
ALTER TABLE crm_inbound_messages DROP CONSTRAINT crm_inbound_messages_external_id_check;
ALTER TABLE crm_inbound_messages ADD CONSTRAINT crm_inbound_messages_external_id_check CHECK(external_id IS NULL OR length(btrim(external_id)) BETWEEN 1 AND 1000);
ALTER TABLE crm_inbound_messages ADD CONSTRAINT crm_inbound_messages_voided_external_id_check CHECK((status='voided')=(external_id IS NULL));

CREATE TABLE crm_auto_registrations (
 id uuid PRIMARY KEY,
 account_id bigint NOT NULL REFERENCES crm_accounts(id) ON DELETE CASCADE,
 user_email text NOT NULL REFERENCES users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
 channel text NOT NULL CHECK(channel='whatsapp'),
 direction text NOT NULL CHECK(direction IN ('in','out')),
 external_id text NOT NULL,
 message_id uuid REFERENCES crm_messages(id) ON DELETE SET NULL,
 inbound_id uuid REFERENCES crm_inbound_messages(id) ON DELETE SET NULL,
 effects jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 voided_at timestamptz,
 voided_by_email text REFERENCES users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
 void_reason text CHECK(void_reason IS NULL OR length(void_reason) BETWEEN 3 AND 500),
 CHECK((message_id IS NULL) <> (inbound_id IS NULL)),
 CHECK((voided_at IS NULL AND voided_by_email IS NULL AND void_reason IS NULL) OR (voided_at IS NOT NULL AND voided_by_email IS NOT NULL AND void_reason IS NOT NULL))
);
CREATE UNIQUE INDEX crm_auto_registrations_active_external ON crm_auto_registrations(channel,external_id) WHERE voided_at IS NULL;
CREATE INDEX crm_auto_registrations_account_created ON crm_auto_registrations(account_id,created_at DESC);
CREATE TRIGGER resource_audit AFTER INSERT OR UPDATE OR DELETE ON crm_auto_registrations FOR EACH ROW EXECUTE FUNCTION crm_audit_resource();
CREATE TRIGGER resource_live AFTER INSERT OR UPDATE OR DELETE ON crm_auto_registrations FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication');
ALTER TABLE crm_communication_journal DROP CONSTRAINT crm_communication_journal_entity_type_check;
ALTER TABLE crm_communication_journal ADD CONSTRAINT crm_communication_journal_entity_type_check CHECK(entity_type IN ('interaction','response','restriction','business','inbound','auto_registration'));
