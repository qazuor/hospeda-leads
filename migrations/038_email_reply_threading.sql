ALTER TABLE email_outbox ADD COLUMN transport text NOT NULL DEFAULT 'api' CHECK(transport IN ('api','smtp'));
ALTER TABLE email_outbox ADD COLUMN in_reply_to text;
ALTER TABLE email_outbox ADD COLUMN references_header text;
ALTER TABLE email_outbox ADD COLUMN inbound_message_id uuid REFERENCES crm_inbound_messages(id) ON DELETE SET NULL;
CREATE INDEX email_outbox_inbound_message_id ON email_outbox(inbound_message_id) WHERE inbound_message_id IS NOT NULL;
-- 037-era ingestion stored headers/attachments as JSON strings; unwrap them so the reply path can read References.
UPDATE crm_inbound_messages SET headers=(headers#>>'{}')::jsonb WHERE jsonb_typeof(headers)='string';
UPDATE crm_inbound_messages SET attachments=(attachments#>>'{}')::jsonb WHERE jsonb_typeof(attachments)='string';
