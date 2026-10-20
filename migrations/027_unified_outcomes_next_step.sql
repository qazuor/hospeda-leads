-- Single outcome list (owner decision 3A) and mandatory next step (owner decision 2B).
-- Additive only: every historical outcome stays valid and no stored row is rewritten.
-- Constraints are added NOT VALID and validated afterwards: no table rewrite, only a read scan.
ALTER TABLE crm_tasks DROP CONSTRAINT crm_tasks_outcome_check;
ALTER TABLE crm_tasks ADD CONSTRAINT crm_tasks_outcome_check CHECK(outcome IN ('no_answer','interested','later','replied','not_interested','do_not_contact','other','delivered','needs_help','awaiting_confirmation','care_completed')) NOT VALID;
ALTER TABLE crm_tasks VALIDATE CONSTRAINT crm_tasks_outcome_check;
ALTER TABLE crm_activities DROP CONSTRAINT crm_activities_outcome_check;
ALTER TABLE crm_activities ADD CONSTRAINT crm_activities_outcome_check CHECK(outcome IN ('no_answer','interested','later','replied','not_interested','do_not_contact','other','delivered','needs_help','awaiting_confirmation','care_completed')) NOT VALID;
ALTER TABLE crm_activities VALIDATE CONSTRAINT crm_activities_outcome_check;

-- Why the seller chose "No agendar nada". Nullable without default: a catalog-only change.
ALTER TABLE crm_tasks ADD COLUMN continuation_reason text;
ALTER TABLE crm_tasks ADD CONSTRAINT crm_tasks_continuation_reason_check CHECK(continuation_reason IS NULL OR length(btrim(continuation_reason)) BETWEEN 3 AND 500) NOT VALID;
ALTER TABLE crm_tasks VALIDATE CONSTRAINT crm_tasks_continuation_reason_check;
ALTER TABLE crm_activities ADD COLUMN continuation_reason text;
ALTER TABLE crm_activities ADD CONSTRAINT crm_activities_continuation_reason_check CHECK(continuation_reason IS NULL OR length(btrim(continuation_reason)) BETWEEN 3 AND 500) NOT VALID;
ALTER TABLE crm_activities VALIDATE CONSTRAINT crm_activities_continuation_reason_check;
