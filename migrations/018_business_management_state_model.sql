-- Add the business-level state model without rewriting historical business data.
-- Backfill is intentionally deferred until the production-data preflight is reviewed.
ALTER TABLE crm_accounts
  ADD COLUMN status text CHECK (
    status IS NULL OR status IN (
      'new',
      'reviewed',
      'in_management',
      'no_follow_up_scheduled',
      'recontact',
      'archived'
    )
  ),
  ADD COLUMN recontact_at date,
  ADD COLUMN referred_to_leandro boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN crm_accounts.status IS
  'Business lifecycle state. NULL is retained during the compatibility rollout until legacy records are reconciled.';
COMMENT ON COLUMN crm_accounts.recontact_at IS
  'Optional business-level date for the Recontactar state; historical management recontact dates remain untouched.';
COMMENT ON COLUMN crm_accounts.referred_to_leandro IS
  'Independent business indicator set when any management is referred to Leandro.';
