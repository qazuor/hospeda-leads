-- Spec 91 §12: per user and per business, when that user last looked at the business «Comunicación» tab.
-- Only feeds the «Nuevo desde tu última visita» divider. It is the viewer's own read marker: not a business write,
-- not contact, no journal, no history and no live bump (a read must not wake other tabs).
CREATE TABLE crm_communication_reads (
 user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 account_id bigint NOT NULL REFERENCES crm_accounts(id) ON DELETE CASCADE,
 last_seen_at timestamptz NOT NULL,
 PRIMARY KEY (user_id, account_id)
);
CREATE INDEX crm_communication_reads_account ON crm_communication_reads(account_id);
