import assert from 'node:assert/strict';
import postgres from 'postgres';

assert.equal(process.env.CRM_TEST_DATABASE, '1', 'Run only against an explicitly marked local/test database');
assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required');
const target = new URL(process.env.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1', '::1'].includes(target.hostname), 'Preflight refuses non-local database hosts');

const sql = postgres(process.env.DATABASE_URL, {max: 1, prepare: false});
try {
  await sql.begin(async tx => {
    await tx`SET TRANSACTION READ ONLY`;
    const tables = await tx`SELECT to_regclass('crm_sequences') IS NOT NULL AS has_sequences,
      to_regclass('crm_sequence_runs') IS NOT NULL AS has_runs,
      to_regclass('crm_messages') IS NOT NULL AS has_messages`;
    const state = tables[0];
    const counts = {sequenceDefinitions: 0, runs: 0, messages: 0, tasks: 0, activities: 0, outbox: 0, emailEvents: 0, sharedTasks: 0, sharedActivities: 0, independentTaskActivities: 0, pipelineTaskReferences: 0, documentActivityReferences: 0};
    if (state.has_sequences) counts.sequenceDefinitions = Number((await tx`SELECT count(*)::int n FROM crm_sequences`)[0].n);
    if (state.has_runs) counts.runs = Number((await tx`SELECT count(*)::int n FROM crm_sequence_runs`)[0].n);
    if (state.has_messages) {
      const hasRunId = await tx`SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='crm_messages' AND column_name='run_id') AS value`;
      if (hasRunId[0].value) {
        const refs = await tx`SELECT count(*)::int messages,
          count(DISTINCT task_id)::int tasks,
          count(DISTINCT activity_id)::int activities,
          count(DISTINCT outbox_id)::int outbox
          FROM crm_messages WHERE run_id IS NOT NULL`;
        counts.messages = refs[0].messages;
        counts.tasks = refs[0].tasks;
        counts.activities = refs[0].activities;
        counts.outbox = refs[0].outbox;
        const protectedRefs = await tx`WITH sequence_messages AS (SELECT id,task_id,activity_id FROM crm_messages WHERE run_id IS NOT NULL),
          sequence_tasks AS (SELECT DISTINCT task_id AS id FROM sequence_messages WHERE task_id IS NOT NULL),
          sequence_activities AS (SELECT DISTINCT activity_id AS id FROM sequence_messages WHERE activity_id IS NOT NULL)
          SELECT
            (SELECT count(DISTINCT st.id)::int FROM sequence_tasks st JOIN crm_messages m ON m.task_id=st.id AND m.run_id IS NULL) AS shared_tasks,
            (SELECT count(DISTINCT sa.id)::int FROM sequence_activities sa JOIN crm_messages m ON m.activity_id=sa.id AND m.run_id IS NULL) AS shared_activities,
            (SELECT count(DISTINCT st.id)::int FROM sequence_tasks st JOIN crm_activities a ON a.task_id=st.id LEFT JOIN sequence_activities sa ON sa.id=a.id WHERE sa.id IS NULL) AS independent_task_activities,
            (SELECT count(DISTINCT st.id)::int FROM sequence_tasks st JOIN crm_pipeline_events p ON p.task_id=st.id) AS pipeline_task_references,
            (SELECT count(DISTINCT sa.id)::int FROM sequence_activities sa JOIN crm_documents d ON d.activity_id=sa.id) +
            (SELECT count(DISTINCT sa.id)::int FROM sequence_activities sa JOIN crm_document_links l ON l.activity_id=sa.id) AS document_activity_references`;
        counts.sharedTasks = protectedRefs[0].shared_tasks;
        counts.sharedActivities = protectedRefs[0].shared_activities;
        counts.independentTaskActivities = protectedRefs[0].independent_task_activities;
        counts.pipelineTaskReferences = protectedRefs[0].pipeline_task_references;
        counts.documentActivityReferences = protectedRefs[0].document_activity_references;
        if (state.has_runs && refs[0].messages > 0) {
          counts.emailEvents = Number((await tx`SELECT count(*)::int n FROM crm_email_events e
            WHERE e.outbox_id IN (SELECT outbox_id FROM crm_messages WHERE run_id IS NOT NULL)
            OR EXISTS (SELECT 1 FROM crm_messages m WHERE m.run_id IS NOT NULL
              AND e.payload->'tags' ? ('hospeda-'||m.id::text))`)[0].n);
        }
      }
    }
    console.log(JSON.stringify({readOnly: true, databaseHost: target.hostname, counts}, null, 2));
  });
} finally {
  await sql.end();
}
