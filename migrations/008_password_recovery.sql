CREATE TABLE password_reset_tokens (
 token_hash text PRIMARY KEY,
 user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX password_reset_user_idx ON password_reset_tokens(user_id);
CREATE TABLE password_reset_requests (
 email_hash text PRIMARY KEY,
 requested_at timestamptz NOT NULL DEFAULT now()
);
