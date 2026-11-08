import type {Config} from './config';
import {read} from './data';
import {page} from './contracts';
import {localDay} from '../../helpers/workDates';
import {redactStaffEmails,staffDomainsFromHost} from './privacy';

const n=(v:unknown)=>Number(v??0);
export const clipCommunicationText=(value:unknown)=>{const text=String(value??'');return {text:text.slice(0,4000),truncated:text.length>4000};};
export const attachmentNames=(value:unknown):{name:string|null;type:string|null}[]=>{let parsed=value;try{if(typeof parsed==='string')parsed=JSON.parse(parsed) as unknown;}catch{return [];}return Array.isArray(parsed)?parsed.slice(0,20).map(item=>({name:(item&&typeof item==='object'&&'filename'in item&&typeof item.filename==='string'?item.filename:item&&typeof item==='object'&&'name'in item&&typeof item.name==='string'?item.name:null)?.slice(0,255)??null,type:(item&&typeof item==='object'&&'mimeType'in item&&typeof item.mimeType==='string'?item.mimeType:item&&typeof item==='object'&&'contentType'in item&&typeof item.contentType==='string'?item.contentType:null)?.slice(0,100)??null})):[];};

export async function listTasks(c:Config,input:{range:'today'|'overdue'|'upcoming';sellerId?:string;businessId?:string;cursor:string;limit:number}){
 return read(c,async tx=>{
  const today=localDay(),offset=Number(input.cursor);
  const rows=await tx`SELECT t.id::text,t.title,w.name AS type,t.due_date::text AS due_date,t.due_at,t.status,a.id::text AS business_id,a.nombre AS business_name,t.lead_id::text AS management_id,u.id::text AS owner_id,u.display_name AS owner_name,a.do_not_contact
   FROM public.crm_tasks t JOIN public.crm_accounts a ON a.id=t.account_id LEFT JOIN public.leads l ON l.id=t.lead_id LEFT JOIN public.crm_work_types w ON w.id=t.type_id LEFT JOIN public.users u ON u.email=t.assigned_user_email
   WHERE t.deleted_at IS NULL AND a.deleted_at IS NULL AND a.merged_into_id IS NULL AND (t.lead_id IS NULL OR l.deleted_at IS NULL)
   AND t.status='pending' AND (${input.businessId??null}::bigint IS NULL OR a.id=${input.businessId??null}::bigint)
   AND (${input.sellerId??null}::bigint IS NULL OR u.id=${input.sellerId??null}::bigint)
   AND ((${input.range}='today' AND t.due_date=${today}::date AND (t.due_at IS NULL OR t.due_at>=now()))
    OR (${input.range}='overdue' AND (t.due_date<${today}::date OR (t.due_date=${today}::date AND t.due_at<now())))
    OR (${input.range}='upcoming' AND t.due_date>${today}::date))
   ORDER BY t.due_date,t.due_at NULLS LAST,t.id OFFSET ${offset} LIMIT ${input.limit+1}`;
  const items=rows.map((r:Record<string,unknown>)=>({id:String(r.id),title:r.title,type:r.type,dueDate:r.due_date,dueTime:r.due_at?new Date(String(r.due_at)).toLocaleTimeString('en-GB',{timeZone:'America/Argentina/Buenos_Aires',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}):null,status:r.status,businessId:String(r.business_id),businessName:r.business_name,managementId:r.management_id===null?null:String(r.management_id),ownerName:r.owner_name??null,doNotContact:Boolean(r.do_not_contact)}));
  return page(items,input.limit,r=>String(offset+items.indexOf(r)+1));
 });
}

export async function businessCommunication(c:Config,input:{businessId:string;cursor:string;limit:number;since?:string}){
 return read(c,async tx=>{
 const [business]=await tx`SELECT merged_into_id,do_not_contact FROM public.crm_accounts WHERE id=${input.businessId} AND deleted_at IS NULL`;
  if(!business)return {found:false};if(business.merged_into_id)return {found:false,reason:'merged',mergedIntoId:String(business.merged_into_id)};
  const staff=await tx`SELECT email FROM public.users WHERE email IS NOT NULL`;
  const staffIdentity={emails:staff.map((row:Record<string,unknown>)=>String(row.email)),domains:staffDomainsFromHost(new URL(c.origin).host)};
  const offset=Number(input.cursor),since=input.since??null;
  const rows=await tx`SELECT * FROM (
   SELECT m.id::text AS id,m.channel,CASE WHEN m.status IN ('manual_sent','accepted','delivery_confirmed','replied') THEN 'outgoing' ELSE NULL END::text AS direction,m.status,CASE WHEN m.status IN ('manual_sent','accepted','delivery_confirmed','replied') THEN coalesce(m.last_interaction_at,m.created_at) ELSE m.created_at END AS date,u.display_name AS actor_name,m.contact_id::text AS contact_id,m.lead_id::text AS management_id,coalesce(m.text_body,m.body,'') AS text,'[]'::text AS attachments,0 AS kind
    FROM public.crm_messages m LEFT JOIN public.users u ON u.email=m.last_actor_email WHERE m.account_id=${input.businessId} AND m.status NOT IN ('draft','cancelled','voided') AND (${since}::date IS NULL OR ((CASE WHEN m.status IN ('manual_sent','accepted','delivery_confirmed','replied') THEN coalesce(m.last_interaction_at,m.created_at) ELSE m.created_at END AT TIME ZONE 'America/Argentina/Buenos_Aires')::date>=${since}::date))
   UNION ALL
   SELECT r.id::text,r.channel,'recorded'::text,r.category,r.occurred_at,u.display_name,r.contact_id::text,r.lead_id::text,concat_ws(E'\n',r.summary,r.exact_text,r.other_detail),'[]'::text,1
    FROM public.crm_communication_responses r LEFT JOIN public.users u ON u.email=r.actor_email WHERE r.account_id=${input.businessId} AND (${since}::date IS NULL OR (r.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date>=${since}::date)
   UNION ALL
   SELECT i.id::text,i.channel,'incoming'::text,i.status,i.received_at,NULL::text,i.contact_id::text,i.lead_id::text,concat_ws(E'\n',i.subject,i.text_body),CASE WHEN jsonb_typeof(i.attachments)='array' THEN coalesce((SELECT jsonb_agg(jsonb_build_object('filename',x.value->>'filename','mimeType',x.value->>'mimeType','contentType',x.value->>'contentType')) FROM jsonb_array_elements(i.attachments) AS x(value)),'[]'::jsonb)::text ELSE '[]'::text END,2
    FROM public.crm_inbound_messages i WHERE i.account_id=${input.businessId} AND i.status<>'voided' AND (${since}::date IS NULL OR (i.received_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date>=${since}::date)
  ) events ORDER BY date DESC,kind,id OFFSET ${offset} LIMIT ${input.limit+1}`;
  const candidates=rows.map((r:Record<string,unknown>)=>{const full=redactStaffEmails(r.text,staffIdentity)??'',body=clipCommunicationText(full);return {id:r.id,channel:r.channel,direction:r.direction,status:r.status,date:r.date,actorName:r.actor_name??null,...(r.contact_id?{contactId:String(r.contact_id)}:{}),managementId:r.management_id===null?null:String(r.management_id),text:body.text,untrusted:true,truncated:body.truncated,attachments:attachmentNames(r.attachments)};});
  const items:typeof candidates=[];let size=0;for(const item of candidates.slice(0,input.limit)){const itemSize=Buffer.byteLength(JSON.stringify(item));if(items.length&&size+itemSize>60_000)break;items.push(item);size+=itemSize;}
  const hasMore=rows.length>items.length,limitedBySize=items.length<Math.min(input.limit,candidates.length);return {found:true,doNotContact:Boolean(business.do_not_contact),items,nextCursor:hasMore?String(offset+items.length):null,truncated:limitedBySize};
 });
}

export async function metrics(c:Config,input:{groupBy:'business_status'|'vertical'|'seller'|'management_stage'|'overdue_tasks';from?:string;to?:string}){
 if(input.from&&input.to&&input.from>input.to)throw Object.assign(new Error('Invalid date range'),{code:'INVALID_INPUT'});
 return read(c,async tx=>{
  const from=input.from??null,to=input.to??null;let groups:Record<string,unknown>[]=[];
  if(input.groupBy==='business_status')groups=await tx`SELECT coalesce(commercial_status,'(sin estado)') AS key,coalesce(commercial_status,'(sin estado)') AS label,count(*)::int AS count FROM public.crm_accounts WHERE deleted_at IS NULL AND archived_at IS NULL AND merged_into_id IS NULL AND (${from}::date IS NULL OR (created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date>=${from}::date) AND (${to}::date IS NULL OR (created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date<=${to}::date) GROUP BY commercial_status ORDER BY key`;
  else if(input.groupBy==='vertical')groups=await tx`SELECT coalesce(c.tipo,'(sin vertical)') AS key,coalesce(c.tipo,'(sin vertical)') AS label,count(DISTINCT a.id)::int AS count FROM public.crm_accounts a LEFT JOIN public.crm_account_classifications c ON c.account_id=a.id WHERE a.deleted_at IS NULL AND a.archived_at IS NULL AND a.merged_into_id IS NULL AND (${from}::date IS NULL OR (a.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date>=${from}::date) AND (${to}::date IS NULL OR (a.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date<=${to}::date) GROUP BY c.tipo ORDER BY key`;
  else if(input.groupBy==='seller')groups=await tx`SELECT coalesce(u.id::text,'(sin responsable)') AS key,coalesce(u.display_name,'Sin responsable') AS label,count(*)::int AS count FROM public.crm_accounts a LEFT JOIN public.users u ON u.email=a.assigned_user_email WHERE a.deleted_at IS NULL AND a.archived_at IS NULL AND a.merged_into_id IS NULL AND (${from}::date IS NULL OR (a.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date>=${from}::date) AND (${to}::date IS NULL OR (a.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date<=${to}::date) GROUP BY u.id,u.display_name ORDER BY label,key`;
  else if(input.groupBy==='management_stage')groups=await tx`SELECT coalesce(l.estado,'(sin etapa)') AS key,coalesce(s.display_name,s.name,l.estado,'(sin etapa)') AS label,count(*)::int AS count FROM public.leads l JOIN public.crm_accounts a ON a.id=l.account_id LEFT JOIN public.crm_stages s ON s.name=l.estado WHERE l.deleted_at IS NULL AND a.deleted_at IS NULL AND a.archived_at IS NULL AND a.merged_into_id IS NULL AND coalesce(s.classification,'open')='open' AND (${from}::date IS NULL OR (l.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date>=${from}::date) AND (${to}::date IS NULL OR (l.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date<=${to}::date) GROUP BY l.estado,s.display_name,s.name ORDER BY label`;
  else groups=await tx`SELECT 'overdue'::text AS key,'Vencidas'::text AS label,count(*)::int AS count FROM public.crm_tasks t JOIN public.crm_accounts a ON a.id=t.account_id LEFT JOIN public.leads l ON l.id=t.lead_id WHERE t.deleted_at IS NULL AND t.status='pending' AND a.deleted_at IS NULL AND a.archived_at IS NULL AND a.merged_into_id IS NULL AND (t.lead_id IS NULL OR l.deleted_at IS NULL) AND (t.due_date<${localDay()}::date OR (t.due_date=${localDay()}::date AND t.due_at<now())) AND (${from}::date IS NULL OR t.due_date>=${from}::date) AND (${to}::date IS NULL OR t.due_date<=${to}::date)`;
  return {metric:input.groupBy,groups:groups.map(r=>({key:String(r.key),label:String(r.label),count:n(r.count)})),asOf:new Date().toISOString(),notes:'Los conteos de negocios y gestiones son entidades distintas. Los conteos por vertical pueden solaparse: un negocio puede tener varias verticales; «(sin vertical)» agrupa los negocios sin clasificación. Los conteos excluyen negocios archivados; las etapas de gestión cuentan solo las abiertas. Las fechas from/to filtran la fecha de creación en Argentina, salvo tareas vencidas, donde filtran vencimiento.'};
 });
}
