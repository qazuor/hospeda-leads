-- SQL snapshots for representative hot paths. Refresh from local synthetic query logs when schema/query plans change.
-- query: business projection count
-- APPROXIMATION: replace with the real SQL captured via log_statement on the synthetic DB before using as baseline
SELECT count(*) FROM crm_accounts WHERE deleted_at IS NULL AND archived_at IS NULL AND merged_into_id IS NULL;
-- query: business projection page
-- APPROXIMATION: replace with the real SQL captured via log_statement on the synthetic DB before using as baseline
SELECT id, nombre, ciudad, tipo, subtipo, status, assigned_user_email FROM crm_accounts WHERE deleted_at IS NULL AND archived_at IS NULL AND merged_into_id IS NULL ORDER BY nombre ASC LIMIT 50 OFFSET 0;
-- query: distinct cities
SELECT DISTINCT ciudad FROM crm_accounts WHERE deleted_at IS NULL AND archived_at IS NULL AND merged_into_id IS NULL;
-- query: work day pending
-- APPROXIMATION: replace with the real SQL captured via log_statement on the synthetic DB before using as baseline
SELECT t.id, t.account_id, t.title, t.due_date FROM crm_tasks AS t WHERE t.status = 'pending' AND t.deleted_at IS NULL ORDER BY t.due_date, t.due_at, t.id LIMIT 25;
-- query: server user session lookup
SELECT s.id AS session_id, s.created_at, s.last_accessed, u.id, u.email, u.display_name, u.full_name, u.role, u.avatar_url
FROM sessions AS s INNER JOIN users AS u ON s.user_id = u.id
WHERE s.id = '00000000-0000-0000-0000-000000000000' LIMIT 1;
-- query: app settings live version contention observation
SELECT * FROM pg_stat_user_tables WHERE relname = 'app_settings';
