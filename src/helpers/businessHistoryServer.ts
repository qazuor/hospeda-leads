import {sql} from 'kysely';
import {db} from './db';
import type {CommercialHistoryData,CommercialHistoryEvent} from '../endpoints/businessHistory.schema';
import {historyFilterKinds,journalTitle,stageChangeTitle,type HistoryFilter} from './historyLabels';
type HistoryRow=CommercialHistoryEvent&{oldStage:string|null;newStage:string|null};
/** Raw journal/stage rows become plain-words entries; the internal action key and stage keys never reach the client. */
const present=({oldStage,newStage,...e}:HistoryRow):CommercialHistoryEvent=>e.kind==='stage'?{...e,title:stageChangeTitle({oldStage,newStage})}:e.kind==='communication'||e.kind==='change'?{...e,title:journalTitle({kind:e.kind,action:e.title})}:e;
/** Called only after the commercial endpoint resolves the business and checks read access. */
/** One date-ordered stream (50 per page) of contacts, responses, stage changes and data changes; `filter` narrows it by kind. */
export async function businessHistory(family:string[],page:number,filter:HistoryFilter='all'):Promise<CommercialHistoryData>{
 const ids=sql.join(family);
 const kinds=filter==='all'?sql``:sql`WHERE kind IN (${sql.join(historyFilterKinds[filter])})`;
 const events=sql`WITH events AS (
 SELECT 'activity:'||a.id::text AS id,a.occurred_at,a.title,a.result,a.notes,a.channel,a.outcome,a.continuation,a.actor_email,a.lead_id,l.opportunity_name,
 'activity'::text AS kind,m.recipient_name,m.status AS message_status,m.subject AS message_subject,
 coalesce(m.text_body,CASE WHEN m.channel IN ('whatsapp','social','other') THEN coalesce(nullif(m.body,''),m.template_snapshot->>'finalBody','') ELSE '' END) AS message_text,
 NULL::text AS old_stage,NULL::text AS new_stage
 FROM crm_activities a LEFT JOIN leads l ON l.id=a.lead_id
 LEFT JOIN LATERAL(SELECT * FROM crm_messages m WHERE m.activity_id=a.id AND m.account_id IN (${ids}) AND (m.lead_id IS NULL OR EXISTS(SELECT 1 FROM leads ml WHERE ml.id=m.lead_id AND ml.deleted_at IS NULL)) AND m.status NOT IN ('draft','cancelled') ORDER BY m.created_at DESC,m.id LIMIT 1)m ON true
 WHERE a.account_id IN (${ids}) AND a.deleted_at IS NULL AND (a.lead_id IS NULL OR l.deleted_at IS NULL)
 UNION ALL
 SELECT 'message:'||m.id::text,coalesce(m.last_interaction_at,m.created_at),coalesce(nullif(m.subject,''),'Mensaje'),NULL::text,NULL::text,m.channel,NULL::text,NULL::text,coalesce(m.last_actor_email,m.owner_email),m.lead_id,l.opportunity_name,
 'message'::text,m.recipient_name,m.status,m.subject,coalesce(m.text_body,CASE WHEN m.channel IN ('whatsapp','social','other') THEN coalesce(nullif(m.body,''),m.template_snapshot->>'finalBody','') ELSE '' END),NULL::text,NULL::text
 FROM crm_messages m LEFT JOIN leads l ON l.id=m.lead_id
 WHERE m.account_id IN (${ids}) AND m.status NOT IN ('draft','cancelled') AND (m.lead_id IS NULL OR l.deleted_at IS NULL)
 AND NOT EXISTS(SELECT 1 FROM crm_activities a WHERE a.id=m.activity_id AND a.deleted_at IS NULL)
 UNION ALL
 SELECT 'response:'||r.id::text,r.occurred_at,'Respuesta recibida',r.category,r.summary,r.channel,r.category,NULL::text,r.actor_email,r.lead_id,l.opportunity_name,
 'response'::text,r.recipient_name,NULL::text,NULL::text,coalesce(r.exact_text,''),NULL::text,NULL::text
 FROM crm_communication_responses r LEFT JOIN leads l ON l.id=r.lead_id
 WHERE r.account_id IN (${ids}) AND (r.lead_id IS NULL OR l.deleted_at IS NULL)
 UNION ALL
 SELECT 'communication:'||j.id::text,j.created_at,j.action,coalesce(j.after_value::text,j.before_value::text),NULL::text,NULL::text,NULL::text,NULL::text,
 coalesce(j.actor_email,j.triggered_by_email),j.lead_id,l.opportunity_name,'communication'::text,NULL::text,NULL::text,NULL::text,
 jsonb_build_object('automatic',j.is_automatic,'triggeredBy',j.triggered_by_email,'before',j.before_value,'after',j.after_value)::text,NULL::text,NULL::text
 FROM crm_communication_journal j LEFT JOIN leads l ON l.id=j.lead_id
 WHERE j.account_id IN (${ids}) AND (j.entity_type<>'response' OR j.action<>'response_registered') AND (j.lead_id IS NULL OR l.deleted_at IS NULL)
 UNION ALL
 SELECT 'stage:'||e.id::text,e.created_at,'stage',nullif(e.comment,''),NULL::text,NULL::text,NULL::text,NULL::text,e.actor_email,e.lead_id,l.opportunity_name,
 'stage'::text,NULL::text,NULL::text,NULL::text,NULL::text,e.old_stage,e.new_stage
 FROM crm_pipeline_events e JOIN leads l ON l.id=e.lead_id
 WHERE e.account_id IN (${ids}) AND e.action='stage' AND l.deleted_at IS NULL
 UNION ALL
 SELECT 'change:'||c.id::text,c.created_at,c.action,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,c.actor_email,NULL::bigint,NULL::text,
 'change'::text,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text
 FROM crm_commercial_journal c
 WHERE c.account_id IN (${ids}) AND c.action<>'stage'
 )`;
 const pending=sql`FROM crm_tasks t LEFT JOIN leads l ON l.id=t.lead_id WHERE t.account_id IN (${ids}) AND t.deleted_at IS NULL AND t.status='pending' AND (t.lead_id IS NULL OR l.deleted_at IS NULL)`;
 const [rows,count,tasks,taskCount]=await Promise.all([
  sql<HistoryRow>`${events} SELECT * FROM events ${kinds} ORDER BY occurred_at DESC,id DESC LIMIT 50 OFFSET ${(page-1)*50}`.execute(db),
  sql<{total:string}>`${events} SELECT count(*) AS total FROM events ${kinds}`.execute(db),
  sql<CommercialHistoryData['pending'][number]>`SELECT t.id,t.title,t.due_date,t.due_at,t.assigned_user_email,t.lead_id,l.opportunity_name,t.continuation ${pending} ORDER BY t.due_date,t.due_at NULLS LAST,t.id LIMIT 10`.execute(db),
  sql<{total:string}>`SELECT count(*) AS total ${pending}`.execute(db)
 ]);
 return {events:rows.rows.map(present),total:Number(count.rows[0].total),page,pending:tasks.rows,totalPending:Number(taskCount.rows[0].total)};
}
