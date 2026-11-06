CREATE TABLE crm_account_seller_groups (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  note text CHECK (note IS NULL OR length(note) <= 500)
);
CREATE TABLE crm_account_seller_group_members (
  group_id bigint NOT NULL REFERENCES crm_account_seller_groups(id) ON DELETE CASCADE,
  account_id bigint NOT NULL REFERENCES crm_accounts(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  added_by text NOT NULL,
  PRIMARY KEY (group_id, account_id),
  CONSTRAINT crm_account_seller_group_members_one_group UNIQUE (account_id)
);
CREATE TRIGGER crm_account_seller_groups_live_version AFTER INSERT OR UPDATE OR DELETE ON crm_account_seller_groups
  FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('business');
CREATE TRIGGER crm_account_seller_group_members_live_version AFTER INSERT OR UPDATE OR DELETE ON crm_account_seller_group_members
  FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('business');
