import {CrmForbidden,assertBusinessAccess,lockAccounts} from '../helpers/crmPermissions';
import {crmError,fallbackStatus,isTransientDbError} from '../helpers/crmErrors';
import {sql} from 'kysely';
import {timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import superjson from 'superjson';
import {db} from '../helpers/db';
import {getServerUserSession} from '../helpers/getServerUserSession';
import {NotAuthenticatedError} from '../helpers/getSetServerSession';
import {setWorkActor} from '../helpers/workAudit';
import {communicationMutation} from './communication.schema';
import {mutateCommunication,leadFor,communicationConfig,CommunicationForbidden,CommunicationConflict,digest,reconcileEvents,lockCommunication,pendingContactOutcomes} from '../helpers/communicationService';
const response=(v:unknown,status=200)=>new Response(superjson.stringify(v),{status,headers:{'Content-Type':'application/json'}});
const failure=(e:unknown)=>response({error:crmError(e)},e instanceof NotAuthenticatedError?401:e instanceof CommunicationForbidden||e instanceof CrmForbidden?403:e instanceof CommunicationConflict?409:fallbackStatus(e));
const camelRows=(rows:Record<string,unknown>[])=>rows.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key.replace(/_([a-z])/g,(_,letter:string)=>letter.toUpperCase()),value])));
export async function get(request:Request){
 try{
  const {user}=await getServerUserSession(request);
  const params=new URL(request.url).searchParams;
  const leadId=params.get('leadId');
  let lead:{id:string;accountId:string};
  if(leadId){
   z.string().regex(/^[1-9]\d*$/).parse(leadId);
   lead=(await leadFor(db,leadId,user,false)).lead;
  }else{
   const accountId=z.string().regex(/^[1-9]\d*$/).parse(params.get('accountId'));
   await assertBusinessAccess(db,accountId,user);
   lead={id:'',accountId};
  }
  const cfg=await communicationConfig(db);
  const recentMessages=(await sql`SELECT * FROM crm_messages WHERE account_id=${lead.accountId}
   AND (${user.role==='admin'} OR lead_id IS NULL OR EXISTS(SELECT 1 FROM leads l WHERE l.id=crm_messages.lead_id AND l.deleted_at IS NULL))
   AND status NOT IN ('draft','cancelled') AND last_interaction_at IS NOT NULL
   ORDER BY last_interaction_at DESC LIMIT 200`.execute(db)).rows;
  const templatePicks=(await sql<{templateId:string;picks:Record<string,string>}>`SELECT DISTINCT ON (template_snapshot->>'id') template_snapshot->>'id' AS "templateId",template_snapshot->'variantPicks' AS picks FROM crm_messages WHERE account_id=${lead.accountId} AND template_snapshot ? 'variantPicks' AND jsonb_typeof(template_snapshot->'variantPicks')='object' ORDER BY template_snapshot->>'id',created_at DESC`.execute(db)).rows;
  const messages=(await sql`SELECT * FROM crm_messages WHERE account_id=${lead.accountId}
   AND (CAST(NULLIF(${lead.id},'') AS bigint) IS NULL OR lead_id=CAST(NULLIF(${lead.id},'') AS bigint))
   ORDER BY created_at DESC LIMIT 200`.execute(db)).rows;
  const restrictions=(await sql`SELECT * FROM crm_contact_restrictions WHERE account_id=${lead.accountId}
   ORDER BY created_at DESC LIMIT 200`.execute(db)).rows;
  // Uncapped: blocking checks must never miss an active restriction hidden behind 200 newer lifted ones.
  const activeRestrictions=(await sql`SELECT * FROM crm_contact_restrictions WHERE account_id=${lead.accountId} AND lifted_at IS NULL ORDER BY created_at DESC`.execute(db)).rows;
  const responses=(await sql`SELECT r.*,coalesce(l.opportunity_name,'General') AS context_name FROM crm_communication_responses r LEFT JOIN leads l ON l.id=r.lead_id WHERE r.account_id=${lead.accountId} AND (r.lead_id IS NULL OR l.deleted_at IS NULL) ORDER BY r.occurred_at DESC LIMIT 200`.execute(db)).rows;
  const openManagements=(await sql`SELECT l.id,l.opportunity_name,l.management_type,l.estado,l.assigned_user_email,s.classification FROM leads l JOIN crm_stages s ON s.name=l.estado WHERE l.account_id=${lead.accountId} AND l.deleted_at IS NULL AND s.classification='open' ORDER BY l.id`.execute(db)).rows.map((item:any)=>({id:item.id,opportunityName:item.opportunity_name,managementType:item.management_type,estado:item.estado,assignedUserEmail:item.assigned_user_email,classification:item.classification,canClose:user.role==='admin'||item.assigned_user_email===user.email}));
  // Decision 2B: the viewer's own contacts here that still wait for "¿Cómo salió?".
  const pendingOutcomes=await pendingContactOutcomes(db,{ownerEmail:user.email,isAdmin:user.role==='admin',accountId:lead.accountId,leadId:lead.id||null});
  return response({pendingOutcomes,templatePicks:Object.fromEntries(templatePicks.map(row=>[row.templateId,row.picks])),recentMessages:camelRows(recentMessages as Record<string,unknown>[]),messages:camelRows(messages as Record<string,unknown>[]),restrictions:camelRows(restrictions as Record<string,unknown>[]),activeRestrictions:camelRows(activeRestrictions as Record<string,unknown>[]),responses:camelRows(responses as Record<string,unknown>[]),openManagements,recentContactHours:cfg.recentContactHours,webhookConfigured:(process.env.BREVO_WEBHOOK_TOKEN?.length??0)>=32});
 }catch(e){return failure(e)}
}
export async function post(request:Request){try{const {user}=await getServerUserSession(request);if(Number(request.headers.get('Content-Length')??0)>100000)throw new Error('Solicitud demasiado grande');const raw=await request.text();if(raw.length>100000)throw new Error('Solicitud demasiado grande');return response(await mutateCommunication(db,communicationMutation.parse((()=>{try{return superjson.parse(raw)}catch{throw new Error('Solicitud inválida.')}})()),user));}catch(e){return failure(e)}}
export async function webhook(request:Request){
 const secret=process.env.BREVO_WEBHOOK_TOKEN;if(!secret||secret.length<32)return new Response('Webhook not configured',{status:503});
 const provided=request.headers.get('Authorization')??'',expected='Bearer '+secret;const a=Buffer.from(provided),b=Buffer.from(expected);if(a.length!==b.length||!timingSafeEqual(a,b))return new Response('Unauthorized',{status:401});
 try{
  const raw=await request.text();if(Buffer.byteLength(raw)>262144)return new Response('Payload too large',{status:413});
  const eventSchema=z.object({event:z.string().max(100),email:z.string().email(),'message-id':z.string().min(1).max(500),ts_event:z.number().int().positive().optional(),ts:z.number().int().positive().optional(),ts_epoch:z.number().positive().optional(),tags:z.array(z.string()).optional()}).passthrough();
  const values=z.array(eventSchema).max(100).parse(Array.isArray(JSON.parse(raw))?JSON.parse(raw):[JSON.parse(raw)]);
  await db.transaction().execute(async e=>{
   // Lock every business this batch can reconcile up front, in id order; the per-event lock below only adds rows that became visible meanwhile.
   const ids=values.map(v=>v['message-id']),emails=values.map(v=>v.email.toLowerCase()),tags=values.flatMap(v=>v.tags??[]).filter(t=>/^hospeda-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(t)).map(t=>t.slice(8));
   await lockCommunication(e,async e=>({accountIds:(await sql<{accountId:string}>`SELECT DISTINCT m.account_id FROM crm_messages m JOIN email_outbox o ON o.id=m.outbox_id WHERE (trim(both '<>' from o.message_id)=ANY(SELECT trim(both '<>' from x) FROM unnest(${ids}::text[]) x) AND lower(o.recipient_email)=ANY(${emails}::text[])) OR m.id=ANY(${tags}::uuid[])`.execute(e)).rows.map(r=>r.accountId)}));await setWorkActor(e,{email:'brevo-webhook'});
   for(const v of values){
    const epoch=v.ts_event??v.ts??(v.ts_epoch?(v.ts_epoch>1e12?v.ts_epoch/1000:v.ts_epoch):null);if(!epoch||epoch*1000>Date.now()+86400000)throw new Error('Invalid event time');
    const at=new Date(epoch*1000);const fingerprint=digest([v['message-id'].replace(/^<|>$/g,''),v.email.toLowerCase(),v.event,epoch]);
    const out=(await sql<{id:string}>`SELECT id FROM email_outbox WHERE trim(both '<>' from message_id)=trim(both '<>' from ${v['message-id']}) AND lower(recipient_email)=lower(${v.email}) LIMIT 1`.execute(e)).rows[0];
    // Tags correlate early events even if persistence after provider acceptance failed.
    const tagId=v.tags?.find(t=>/^hospeda-[0-9a-f-]{36}$/.test(t))?.slice(8);
    const tagged=!out&&tagId?(await sql<{id:string}>`SELECT o.id FROM email_outbox o JOIN crm_messages m ON m.outbox_id=o.id WHERE m.id=${tagId}::uuid AND lower(o.recipient_email)=lower(${v.email})`.execute(e)).rows[0]:null;
    const oid=out?.id??tagged?.id??null;
    await sql`INSERT INTO crm_email_events(fingerprint,message_id,recipient,event,occurred_at,payload,outbox_id) VALUES(${fingerprint},${v['message-id']},${v.email},${v.event},${at},${JSON.stringify(v)}::text::jsonb,${oid}) ON CONFLICT DO NOTHING`.execute(e);
    if(oid){await lockAccounts(e,(await sql<{accountId:string}>`SELECT account_id FROM crm_messages WHERE outbox_id=${oid}`.execute(e)).rows.map(r=>r.accountId));await sql`UPDATE email_outbox SET message_id=coalesce(message_id,${v['message-id']}) WHERE id=${oid}`.execute(e);await reconcileEvents(e,oid);}
   }
  });return new Response('OK');
 // Lock waits, deadlocks and timeouts are retryable: 503 lets the provider redeliver; invalid payloads stay 400.
 }catch(e){return isTransientDbError(e)?new Response('Temporarily unavailable',{status:503,headers:{'Retry-After':'30'}}):new Response('Invalid webhook event',{status:400})}
}
