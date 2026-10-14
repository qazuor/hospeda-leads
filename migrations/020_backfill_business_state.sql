-- Idempotent backfill, designed for the production cutover after application
-- code has dual-read/dual-write support. It does not alter leads or journals.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM leads l
    LEFT JOIN crm_stages s ON s.name=l.estado
    WHERE l.deleted_at IS NULL
      AND (l.estado IS NULL OR s.name IS NULL OR s.classification IS NULL OR NOT s.active OR s.historical)
  ) THEN
    RAISE EXCEPTION 'Business state backfill stopped: review live leads with a missing, inactive, historical, or unclassified stage before retrying';
  END IF;
END $$;

UPDATE crm_accounts
SET is_client=(commercial_status='client')
WHERE is_client IS DISTINCT FROM (commercial_status='client');

WITH active_work AS (
  SELECT l.account_id,bool_or(s.classification='open') AS has_open,
         bool_or(s.classification IN ('won','lost')) AS has_closed
  FROM leads l JOIN crm_stages s ON s.name=l.estado
  WHERE l.deleted_at IS NULL AND l.estado IS NOT NULL
  GROUP BY l.account_id
), latest_recontact AS (
  SELECT DISTINCT ON (e.account_id) e.account_id,e.recontact_date
  FROM crm_pipeline_events e
  JOIN leads l ON l.id=e.lead_id AND l.deleted_at IS NULL AND l.estado=e.new_stage
  JOIN crm_stages s ON s.name=l.estado AND s.classification='lost'
  WHERE e.recontact_date IS NOT NULL
  ORDER BY e.account_id,e.created_at DESC,e.id DESC
), candidates AS (
  SELECT a.id,
    CASE
      WHEN a.archived_at IS NOT NULL THEN 'archived'
      WHEN coalesce(w.has_open,false) THEN 'in_management'
      WHEN r.recontact_date IS NOT NULL THEN 'recontact'
      WHEN a.review_status='filtered' OR a.is_client THEN 'reviewed'
      WHEN coalesce(w.has_closed,false) THEN 'no_follow_up_scheduled'
      ELSE 'new'
    END AS status,
    CASE
      WHEN a.archived_at IS NOT NULL OR coalesce(w.has_open,false) THEN NULL
      WHEN r.recontact_date IS NOT NULL THEN r.recontact_date
      ELSE a.recontact_at
    END AS recontact_at
  FROM crm_accounts a
  LEFT JOIN active_work w ON w.account_id=a.id
  LEFT JOIN latest_recontact r ON r.account_id=a.id
)
UPDATE crm_accounts a SET status=c.status,recontact_at=c.recontact_at,updated_at=now()
FROM candidates c WHERE c.id=a.id AND a.status IS NULL;

ALTER TABLE crm_accounts ALTER COLUMN status SET NOT NULL;
ALTER TABLE crm_accounts ALTER COLUMN status SET DEFAULT 'new';

CREATE INDEX crm_accounts_status_idx ON crm_accounts(status) WHERE deleted_at IS NULL;
CREATE INDEX leads_management_type_stage_idx ON leads(management_type,estado) WHERE deleted_at IS NULL;
