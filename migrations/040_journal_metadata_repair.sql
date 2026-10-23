-- Bulk business edits and the responsible rebalance cast a JSON.stringify'd parameter straight to jsonb, which postgres.js stored as a
-- jsonb string (fixed in #223). Unwrap only those two actions; the content is unchanged and a second run finds nothing to update.
DO $$
DECLARE repaired bigint;
BEGIN
  UPDATE crm_commercial_journal SET metadata=(metadata#>>'{}')::jsonb
  WHERE jsonb_typeof(metadata)='string' AND action IN ('account_updated','business_assignment_rebalanced');
  GET DIAGNOSTICS repaired = ROW_COUNT;
  RAISE NOTICE 'crm_commercial_journal metadata repaired: % rows', repaired;
END $$;
