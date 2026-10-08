-- OAuth credentials only; no changes to CRM business records.
CREATE TABLE crm_mcp_credentials (
 hash text PRIMARY KEY,
 kind text NOT NULL CHECK (kind IN ('code','refresh')),
 user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 client_id text NOT NULL,
 redirect_uri text,
 challenge text,
 scopes text NOT NULL,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_mcp_credentials_expiry_idx ON crm_mcp_credentials(expires_at);
