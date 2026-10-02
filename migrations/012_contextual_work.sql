-- Historical work keeps its meaning; its purpose is explicitly unclassified.
ALTER TABLE crm_tasks ADD COLUMN purpose text CHECK(purpose IN ('commercial','delivery','care','reactivation'));
ALTER TABLE crm_activities ADD COLUMN purpose text CHECK(purpose IN ('commercial','delivery','care','reactivation'));
ALTER TABLE crm_tasks DROP CONSTRAINT crm_tasks_outcome_check;
ALTER TABLE crm_activities DROP CONSTRAINT crm_activities_outcome_check;
ALTER TABLE crm_tasks ADD CONSTRAINT crm_tasks_outcome_check CHECK(outcome IN ('no_answer','interested','replied','not_interested','do_not_contact','other','delivered','needs_help','awaiting_confirmation','care_completed'));
ALTER TABLE crm_activities ADD CONSTRAINT crm_activities_outcome_check CHECK(outcome IN ('no_answer','interested','replied','not_interested','do_not_contact','other','delivered','needs_help','awaiting_confirmation','care_completed'));

ALTER TABLE crm_stages ADD COLUMN journey_phase text CHECK(journey_phase IN ('contact','need','proposal','decision'));
ALTER TABLE crm_tasks ADD COLUMN continuation text CHECK(continuation IN ('task','wait','done'));
ALTER TABLE crm_activities ADD COLUMN continuation text CHECK(continuation IN ('task','wait','done'));
