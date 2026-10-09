import {sql} from 'kysely';
import {db} from './db';
import type {CommercialHistoryData,CommercialHistoryEvent} from '../endpoints/businessHistory.schema';
/** Called only after the commercial endpoint resolves the business and checks read access. */
export async function businessHistory(family:string[],page:number):Promise<CommercialHistoryData>{
 const ids=sql.join(family);
 const events=sql`WITH events AS (
 SELECT 'activity:'||a.id::text AS id,a.occurred_at,a.title,a.result,a.notes,a.channel,a.outcome,a.continuation,a.actor_email,a.lead_id,l.opportunity_name,
 'activity'::text AS kind,m.recipient_name,m.status AS message_status,m.subject AS message_subject,
 coalesce(m.text_body,CASE WHEN m.channel='whatsapp' THEN m.body ELSE '' END) AS message_text
 FROM crm_activities a LEFT JOIN leads l ON l.id=a.lead_id
 LEFT JOIN LATERAL(SELECT * FROM crm_messages m WHERE m.activity_id=a.id AND m.account_id IN (${ids}) AND (m.lead_id IS NULL OR EXISTS(SELECT 1 FROM leads ml WHERE ml.id=m.lead_id AND ml.deleted_at IS NULL)) AND m.status NOT IN ('draft','cancelled') ORDER BY m.created_at DESC,m.id LIMIT 1)m ON true
 WHERE a.account_id IN (${ids}) AND a.deleted_at IS NULL AND (a.lead_id IS NULL OR l.deleted_at IS NULL)
 UNION ALL
 SELECT 'message:'||m.id::text,coalesce(m.last_interaction_at,m.created_at),coalesce(nullif(m.subject,''),'Mensaje'),NULL::text,NULL::text,m.channel,NULL::text,NULL::text,coalesce(m.last_actor_email,m.owner_email),m.lead_id,l.opportunity_name,
 'message'::text,m.recipient_name,m.status,m.subject,coalesce(m.text_body,CASE WHEN m.channel='whatsapp' THEN m.body ELSE '' END)
 FROM crm_messages m LEFT JOIN leads l ON l.id=m.lead_id
 WHERE m.account_id IN (${ids}) AND m.status NOT IN ('draft','cancelled') AND (m.lead_id IS NULL OR l.deleted_at IS NULL)
 AND NOT EXISTS(SELECT 1 FROM crm_activities a WHERE a.id=m.activity_id AND a.deleted_at IS NULL)
 )`;
 const pending=sql`FROM crm_tasks t LEFT JOIN leads l ON l.id=t.lead_id WHERE t.account_id IN (${ids}) AND t.deleted_at IS NULL AND t.status='pending' AND (t.lead_id IS NULL OR l.deleted_at IS NULL)`;
 const [rows,count,tasks,taskCount]=await Promise.all([
  sql<CommercialHistoryEvent>`${events} SELECT * FROM events ORDER BY occurred_at DESC,id DESC LIMIT 50 OFFSET ${(page-1)*50}`.execute(db),
  sql<{total:string}>`${events} SELECT count(*) AS total FROM events`.execute(db),
  sql<CommercialHistoryData['pending'][number]>`SELECT t.id,t.title,t.due_date,t.due_at,t.assigned_user_email,t.lead_id,l.opportunity_name,t.continuation ${pending} ORDER BY t.due_date,t.due_at NULLS LAST,t.id LIMIT 10`.execute(db),
  sql<{total:string}>`SELECT count(*) AS total ${pending}`.execute(db)
 ]);
 return {events:rows.rows,total:Number(count.rows[0].total),page,pending:tasks.rows,totalPending:Number(taskCount.rows[0].total)};
}
