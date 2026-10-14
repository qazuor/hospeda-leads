import assert from 'node:assert/strict';
import postgres from 'postgres';

assert.equal(process.env.CRM_STATE_PREFLIGHT,'1','Set CRM_STATE_PREFLIGHT=1 to run the read-only preflight');
assert.equal(process.env.CRM_STATE_PREFLIGHT_TARGET,'isolated-copy','This report may only run against an isolated database copy');
assert.ok(process.env.DATABASE_URL,'DATABASE_URL is required');

const sql=postgres(process.env.DATABASE_URL,{max:1,prepare:false,path:process.env.CRM_TEST_DATABASE==='1'?process.env.CRM_TEST_DATABASE_SOCKET:undefined});
try{
 const report=await sql.begin(async tx=>{
  await tx`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`;
  const [accounts]=(await tx`
   SELECT count(*)::int AS total,
    count(*) FILTER (WHERE review_status='filtered')::int AS filtered,
    count(*) FILTER (WHERE commercial_status='client')::int AS clients,
    count(*) FILTER (WHERE do_not_contact)::int AS do_not_contact,
    count(*) FILTER (WHERE archived_at IS NOT NULL)::int AS archived,
    count(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS in_trash,
    count(*) FILTER (WHERE archived_at IS NOT NULL AND deleted_at IS NOT NULL)::int AS archived_and_in_trash,
    count(*) FILTER (WHERE review_status='filtered' AND archived_at IS NOT NULL)::int AS filtered_and_archived,
    count(*) FILTER (WHERE review_status='filtered' AND deleted_at IS NOT NULL)::int AS filtered_and_in_trash,
    count(*) FILTER (WHERE do_not_contact AND archived_at IS NULL)::int AS do_not_contact_without_archive
   FROM crm_accounts`);
  const stages=await tx`
   SELECT coalesce(l.estado,'<sin etapa>') AS stage,
    coalesce(s.classification,'<sin clasificación>') AS classification,
    coalesce(s.active,false) AS active,
    coalesce(s.historical,false) AS historical,
    count(*)::int AS all_managements,
    count(*) FILTER (WHERE l.deleted_at IS NULL)::int AS non_deleted_managements,
    count(DISTINCT l.account_id) FILTER (WHERE l.deleted_at IS NULL)::int AS non_deleted_businesses
   FROM leads l LEFT JOIN crm_stages s ON s.name=l.estado
   GROUP BY l.estado,s.classification,s.active,s.historical
   ORDER BY l.estado NULLS FIRST`;
  const [managements]=(await tx`
   WITH per_business AS (
    SELECT a.id,
     count(l.id) FILTER (WHERE l.deleted_at IS NULL)::int AS non_deleted_managements,
     count(l.id) FILTER (WHERE l.deleted_at IS NULL AND s.active AND s.classification='open')::int AS open_candidates,
     count(l.id) FILTER (WHERE l.deleted_at IS NULL AND s.classification IN ('won','lost'))::int AS closed_candidates,
     count(l.id) FILTER (WHERE l.deleted_at IS NULL AND (l.estado IS NULL OR s.name IS NULL OR (s.classification='open' AND NOT s.active)))::int AS unresolved_stage_candidates
    FROM crm_accounts a LEFT JOIN leads l ON l.account_id=a.id
    LEFT JOIN crm_stages s ON s.name=l.estado
    GROUP BY a.id
   )
   SELECT count(*) FILTER (WHERE non_deleted_managements=0)::int AS without_management,
    count(*) FILTER (WHERE open_candidates=1)::int AS with_one_open_candidate,
    count(*) FILTER (WHERE open_candidates>1)::int AS with_multiple_open_candidates,
    count(*) FILTER (WHERE closed_candidates>0 AND open_candidates=0)::int AS closed_without_open_candidate,
    count(*) FILTER (WHERE unresolved_stage_candidates>0)::int AS with_unresolved_stage_candidate,
    count(*) FILTER (WHERE open_candidates>0 AND unresolved_stage_candidates>0)::int AS with_open_and_unresolved_candidates,
    count(*) FILTER (WHERE a.archived_at IS NOT NULL AND open_candidates>0)::int AS archived_with_open_candidate,
    count(*) FILTER (WHERE a.review_status='filtered' AND open_candidates>0)::int AS filtered_with_open_candidate,
    count(*) FILTER (WHERE a.commercial_status='client' AND non_deleted_managements=0)::int AS clients_without_non_deleted_management,
    count(*) FILTER (WHERE non_deleted_managements=0 AND a.review_status IS NULL AND a.commercial_status='prospect' AND a.archived_at IS NULL AND a.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM crm_pipeline_events e WHERE e.account_id=a.id))::int AS ordinary_new_candidates,
    count(*) FILTER (WHERE non_deleted_managements=0 AND a.review_status IS NULL AND a.commercial_status='prospect' AND a.archived_at IS NULL AND a.deleted_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM crm_pipeline_events e WHERE e.account_id=a.id))::int AS deleted_new_candidates
   FROM per_business p JOIN crm_accounts a ON a.id=p.id`);
  const [recontact]=(await tx`
   WITH dates AS (
    SELECT account_id,count(*)::int AS dated_events,count(DISTINCT recontact_date)::int AS distinct_dates
    FROM crm_pipeline_events WHERE recontact_date IS NOT NULL GROUP BY account_id
   )
   SELECT (SELECT count(*)::int FROM crm_pipeline_events) AS total_pipeline_events,
    (SELECT count(DISTINCT account_id)::int FROM crm_pipeline_events) AS businesses_with_pipeline_events,
    count(*)::int AS businesses_with_recontact_date,
    count(*) FILTER (WHERE distinct_dates>1)::int AS businesses_with_conflicting_dates,
    count(*) FILTER (WHERE dated_events>1)::int AS businesses_with_multiple_dated_events
   FROM dates`);
  const [journals]=(await tx`
   SELECT (SELECT count(*)::int FROM lead_journal) AS legacy_journal_rows,
    (SELECT count(DISTINCT account_id)::int FROM lead_journal WHERE account_id IS NOT NULL) AS businesses_with_legacy_journal,
    (SELECT count(*)::int FROM lead_journal WHERE lead_id IS NULL) AS detached_legacy_journal_rows,
    (SELECT count(*)::int FROM crm_commercial_journal) AS commercial_journal_rows,
    (SELECT count(DISTINCT account_id)::int FROM crm_commercial_journal) AS businesses_with_commercial_journal`);
  return {generatedAt:new Date().toISOString(),accounts,managements,recontact,journals,stageBreakdown:stages};
 });
 console.log(JSON.stringify(report,null,2));
}finally{await sql.end();}
