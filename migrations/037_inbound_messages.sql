CREATE TABLE crm_inbound_messages (
 id uuid PRIMARY KEY,
 channel text NOT NULL CHECK(channel IN ('email','whatsapp','social')),
 channel_detail text,
 external_id text NOT NULL CHECK(length(btrim(external_id)) BETWEEN 1 AND 1000),
 account_id bigint REFERENCES crm_accounts(id) ON DELETE SET NULL,
 lead_id bigint REFERENCES leads(id) ON DELETE SET NULL,
 contact_id bigint REFERENCES crm_contacts(id) ON DELETE SET NULL,
 linked_message_id uuid REFERENCES crm_messages(id) ON DELETE SET NULL,
 match_method text NOT NULL CHECK(match_method IN ('in_reply_to','references','sender_email','phone','crm_code','instagram_handle','manual','none')),
 from_address text NOT NULL CHECK(length(from_address)<=1000),
 from_name text NOT NULL DEFAULT '' CHECK(length(from_name)<=1000),
 subject text NOT NULL DEFAULT '' CHECK(length(subject)<=2000),
 text_body text NOT NULL DEFAULT '' CHECK(length(text_body)<=50000),
 html_body text CHECK(html_body IS NULL OR length(html_body)<=200000),
 headers jsonb NOT NULL DEFAULT '{}'::jsonb,
 attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
 is_automatic boolean NOT NULL DEFAULT false,
 received_at timestamptz NOT NULL,
 status text NOT NULL CHECK(status IN ('unmatched','pending_review','registered','dismissed')),
 response_id uuid REFERENCES crm_communication_responses(id) ON DELETE SET NULL,
 source text NOT NULL CHECK(source IN ('email_worker','userscript')),
 captured_by_email text REFERENCES users(email) ON UPDATE CASCADE ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(channel,external_id)
);
CREATE INDEX crm_inbound_messages_account_received ON crm_inbound_messages(account_id,received_at DESC);
CREATE INDEX crm_inbound_messages_pending ON crm_inbound_messages(status) WHERE status IN ('unmatched','pending_review');
ALTER TABLE crm_communication_journal DROP CONSTRAINT crm_communication_journal_entity_type_check;
ALTER TABLE crm_communication_journal ADD CONSTRAINT crm_communication_journal_entity_type_check CHECK(entity_type IN ('interaction','response','restriction','business','inbound'));
CREATE TRIGGER resource_audit AFTER INSERT OR UPDATE OR DELETE ON crm_inbound_messages FOR EACH ROW EXECUTE FUNCTION crm_audit_resource();
CREATE TRIGGER resource_live AFTER INSERT OR UPDATE OR DELETE ON crm_inbound_messages FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication');
