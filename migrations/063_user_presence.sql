CREATE TABLE user_presence (
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('crm', 'whatsapp', 'instagram')),
  last_seen_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, source)
);
CREATE INDEX user_presence_last_seen_at_idx ON user_presence(last_seen_at);
