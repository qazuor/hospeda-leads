-- F6: Hoy counts the tasks completed today ("Hoy: N de M hechas", work.ts doneToday) by the Argentina calendar day of
-- completed_at; crm_tasks_day only covers pending tasks, so the count scanned crm_tasks. The expression matches the query
-- exactly; the day comes first so the team view (no responsible filter) can use it too. Plain CREATE INDEX (no CONCURRENTLY).
CREATE INDEX crm_tasks_done_day_idx ON crm_tasks(((completed_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date), assigned_user_email) WHERE status='completed' AND deleted_at IS NULL;
