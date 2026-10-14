import {sql} from 'kysely';
import {db} from './db';
import {normalizeSearchSql} from './searchSql';
import type {OutputType,JournalItem} from '../endpoints/lead_journal_GET.schema';
import type {z} from 'zod';
import type {schema} from '../endpoints/lead_journal_GET.schema';

// Read existing immutable journals together. Never recreate leads or copy events.
const events=sql`WITH raw_events AS (
 SELECT 'lead:'||j.id AS id,j.lead_id,j.account_id,j.lead_name,j.lead_city,j.lead_type,j.actor_email,j.actor_name,j.action,j.field_name,j.old_value,j.new_value,j.metadata,j.created_at,'lead'::text AS source
 FROM lead_journal j
 UNION ALL
 SELECT 'business:'||j.id,NULL::bigint,j.account_id,NULL::text,NULL::text,NULL::text,j.actor_email,j.actor_name,j.action,NULL::text,NULL::text,NULL::text,j.metadata,j.created_at,'business'
 FROM crm_commercial_journal j
 UNION ALL
 SELECT 'work:'||j.id,NULL::bigint,j.account_id,coalesce(j.after_value->>'title',j.before_value->>'title'),NULL::text,NULL::text,j.actor_email,NULL::text,'work_'||lower(j.action),NULL::text,NULL::text,NULL::text,jsonb_build_object('entity',j.entity,'before',j.before_value,'after',j.after_value),j.created_at,'work'
 FROM crm_work_journal j
 UNION ALL
 SELECT 'resource:'||j.id,NULL::bigint,coalesce(nullif(j.after_value->>'account_id','')::bigint,nullif(j.before_value->>'account_id','')::bigint,d.account_id),coalesce(j.after_value->>'title',j.before_value->>'title',j.after_value->>'file_name',j.before_value->>'file_name'),NULL::text,NULL::text,j.actor_email,NULL::text,'resource_'||lower(j.action),NULL::text,NULL::text,NULL::text,jsonb_build_object('entity',j.entity,'before',j.before_value,'after',j.after_value),j.created_at,'resource'
 FROM crm_resource_journal j LEFT JOIN crm_documents d ON d.id::text=coalesce(j.after_value->>'document_id',j.before_value->>'document_id')
 UNION ALL
 SELECT 'pipeline:'||j.id,j.lead_id,j.account_id,NULL::text,NULL::text,NULL::text,j.actor_email,NULL::text,'pipeline_'||j.action,'estado',coalesce(old_stage.display_name,j.old_stage),coalesce(new_stage.display_name,j.new_stage),jsonb_build_object('reason',j.comment,'details',j.metadata),j.created_at,'pipeline'
 FROM crm_pipeline_events j
 LEFT JOIN crm_stages old_stage ON old_stage.name=j.old_stage
 LEFT JOIN crm_stages new_stage ON new_stage.name=j.new_stage
 UNION ALL
 SELECT 'configuration:'||j.id,NULL::bigint,NULL::bigint,j.entity,NULL::text,NULL::text,j.actor_email,NULL::text,'configuration_updated',NULL::text,NULL::text,NULL::text,jsonb_build_object('before',j.before_value,'after',j.after_value),j.created_at,'configuration'
 FROM crm_pipeline_config_journal j
 UNION ALL
 SELECT 'communication:'||j.id,j.lead_id,j.account_id,NULL::text,NULL::text,NULL::text,j.actor_email,
 CASE WHEN j.is_automatic THEN 'Automático · '||coalesce(u.display_name,j.triggered_by_email,'Sistema') ELSE coalesce(j.actor_name,j.actor_email) END,
 CASE WHEN j.is_automatic THEN 'automatic_'||j.action ELSE j.action END,NULL::text,
 coalesce(j.before_value::text,''),coalesce(j.after_value::text,''),
 jsonb_build_object('entityType',j.entity_type,'entityId',j.entity_id,'automatic',j.is_automatic,'triggeredBy',j.triggered_by_email,'before',j.before_value,'after',j.after_value,'relatedEventId',j.related_event_id),
 j.created_at,'communication'
 FROM crm_communication_journal j LEFT JOIN users u ON u.email=j.triggered_by_email
 ), events AS (
 SELECT e.id,e.lead_id,e.account_id,coalesce(e.lead_name,a.nombre,'Configuración / biblioteca') AS lead_name,
 coalesce(e.lead_city,a.ciudad) AS lead_city,coalesce(e.lead_type,a.tipo) AS lead_type,
 NULL::integer AS actor_user_id,e.actor_email,coalesce(e.actor_name,u.display_name,e.actor_email,'Sistema') AS actor_name,
 e.action,e.field_name,e.old_value,e.new_value,e.metadata,e.created_at,e.source,
 a.nombre AS account_name,coalesce(a.deleted_at IS NOT NULL,false) AS account_deleted
 FROM raw_events e LEFT JOIN crm_accounts a ON a.id=e.account_id LEFT JOIN users u ON u.email=e.actor_email
 )`;

export async function globalHistory(input:z.infer<typeof schema>):Promise<OutputType>{
 const predicates=[sql`true`];
 if(input.accountId)predicates.push(sql`account_id=${input.accountId}::bigint`);
 if(input.action)predicates.push(sql`action=${input.action}`);
 if(input.actor)predicates.push(sql`actor_name=${input.actor}`);
 if(input.city)predicates.push(sql`lead_city=${input.city}`);
 if(input.type)predicates.push(sql`lead_type=${input.type}`);
 if(input.from)predicates.push(sql`created_at >= (${input.from}::date::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')`);
 if(input.to)predicates.push(sql`created_at < ((${input.to}::date + 1)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')`);
 if(input.q)predicates.push(sql`${normalizeSearchSql(sql<string>`concat_ws(' ',lead_name,account_name,actor_name,actor_email,field_name,old_value,new_value,metadata::text)`)} LIKE ${normalizeSearchSql(sql<string>`${'%'+input.q+'%'}`)}`);
 const where=sql`WHERE ${sql.join(predicates,sql` AND `)}`;
 const [rows,count,filters]=await Promise.all([
  sql<JournalItem>`${events} SELECT * FROM events ${where} ORDER BY created_at DESC,id DESC LIMIT ${input.pageSize} OFFSET ${(input.page-1)*input.pageSize}`.execute(db),
  sql<{total:string}>`${events} SELECT count(*) AS total FROM events ${where}`.execute(db),
  sql<{action:string;actorName:string;leadCity:string|null;leadType:string|null;accountId:string|null;accountName:string|null}>`${events} SELECT DISTINCT action,actor_name,lead_city,lead_type,account_id::text,account_name FROM events`.execute(db)
 ]);
 const values=(key:'action'|'actorName'|'leadCity'|'leadType')=>[...new Set(filters.rows.map(r=>r[key]).filter((v):v is string=>!!v))].sort((a,b)=>a.localeCompare(b,'es'));
 const accounts=[...new Map(filters.rows.filter(r=>r.accountId&&r.accountName).map(r=>[r.accountId,{id:r.accountId!,name:r.accountName!}])).values()].sort((a,b)=>a.name.localeCompare(b.name,'es'));
 return {rows:rows.rows.map(row=>({...row,id:String(row.id),leadId:row.leadId==null?null:String(row.leadId),accountId:row.accountId==null?null:String(row.accountId)})),total:Number(count.rows[0].total),page:input.page,pageSize:input.pageSize,filters:{actions:values('action'),actors:values('actorName'),cities:values('leadCity'),types:values('leadType'),leads:[],accounts}};
}
