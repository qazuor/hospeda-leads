ALTER TABLE crm_inbound_messages DROP CONSTRAINT crm_inbound_messages_source_check;
ALTER TABLE crm_inbound_messages ADD CONSTRAINT crm_inbound_messages_source_check CHECK(source IN ('email_worker','userscript','instagram_webhook'));
ALTER TABLE crm_inbound_messages ADD COLUMN is_outgoing boolean NOT NULL DEFAULT false;
ALTER TABLE crm_inbound_messages ADD COLUMN instagram_igsid text;
CREATE TABLE crm_instagram_contacts(igsid text PRIMARY KEY,username text,name text,fetched_at timestamptz NOT NULL);
CREATE TABLE crm_integration_secrets(name text PRIMARY KEY,ciphertext text NOT NULL,iv text NOT NULL,tag text NOT NULL,expires_at timestamptz,refreshed_at timestamptz,last_error text,updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX crm_accounts_instagram_normalized ON crm_accounts(lower(trim(both '/' from regexp_replace(regexp_replace(regexp_replace(perfil_instagram,'^https?://(www[.])?instagram[.]com/',''),'^@',''),'/+$','')))) WHERE deleted_at IS NULL AND perfil_instagram IS NOT NULL;
