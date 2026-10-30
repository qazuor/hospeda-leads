-- Spec 96 §10.1 (owner, 28/10/2026): a registered response resolves the pending «Anotá cómo salió» of the send it answers.
-- The activity keeps which response set its outcome, so the CRM shows it as automatic until a person corrects it (the
-- correction clears the mark; the activity audit trigger keeps the before/after). Nothing is backfilled.
ALTER TABLE crm_activities ADD COLUMN outcome_response_id uuid REFERENCES crm_communication_responses(id) ON DELETE SET NULL;
CREATE INDEX crm_activities_outcome_response_idx ON crm_activities(outcome_response_id) WHERE outcome_response_id IS NOT NULL;
