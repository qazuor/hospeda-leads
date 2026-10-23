CREATE TABLE crm_userscript_tokens (
 id uuid PRIMARY KEY,
 user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE,
 label text NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 80),
 created_at timestamptz NOT NULL DEFAULT now(),
 last_used_at timestamptz,
 revoked_at timestamptz
);
CREATE INDEX crm_userscript_tokens_user ON crm_userscript_tokens(user_id);
ALTER TABLE crm_messages ADD COLUMN external_id text;
CREATE UNIQUE INDEX crm_messages_channel_external_id ON crm_messages(channel,external_id) WHERE external_id IS NOT NULL;
