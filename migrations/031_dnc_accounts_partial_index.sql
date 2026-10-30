-- D2: the contact-time phone warning looks up only the No contactar businesses; a partial index keeps that lookup off a sequential scan of crm_accounts.
CREATE INDEX crm_accounts_dnc_idx ON crm_accounts(id) WHERE do_not_contact AND merged_into_id IS NULL AND deleted_at IS NULL;
