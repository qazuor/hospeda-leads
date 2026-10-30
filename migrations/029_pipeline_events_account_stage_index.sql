-- Business timeline ("Qué pasó") reads stage changes by business: WHERE account_id IN (...) AND action='stage' ORDER BY created_at.
CREATE INDEX crm_pipeline_events_account_stage_idx ON crm_pipeline_events(account_id,created_at DESC) WHERE action='stage';
