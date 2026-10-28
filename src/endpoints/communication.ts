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
import {smtpConfigured} from '../helpers/smtpTransport';
import {inboxReplyAvailability} from '../helpers/inboxReplyAvailability';
import {COMMUNICATION_LIST_LIMIT,communicationMutation,communicationSeenInput} from './communication.schema';
import {messageMaterials} from '../helpers/salesMaterialDraft';
import {isTerminalEmailEvent} from '../helpers/emailEngagement';
import {SalesMaterialNotFound} from '../helpers/salesMaterialService';
import {R2NotConfigured,R2Unavailable} from '../helpers/r2';
import {MaterialShareUrlUnavailable} from '../helpers/salesMaterialMessage';
import {mutateCommunication,leadFor,communicationConfig,CommunicationForbidden,CommunicationConflict,digest,reconcileEvents,lockCommunication,pendingContactOutcomes} from '../helpers/communicationService';
const response=(v:unknown,status=200)=>new Response(superjson.stringify(v),{status,headers:{'Content-Type':'application/json'}});
const failure=(e:unknown)=>response({error:crmError(e)},e instanceof NotAuthenticatedError?401:e instanceof CommunicationForbidden||e instanceof CrmForbidden?403:e instanceof CommunicationConflict?409:e instanceof SalesMaterialNotFound?404:e instanceof R2NotConfigured||e instanceof R2Unavailable||e instanceof MaterialShareUrlUnavailable?503:fallbackStatus(e));
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
  const includeVoided=user.role==='admin'&&params.get('includeVoided')==='1';
  const recentMessages=(await sql`SELECT m.*, (SELECT r.id::text FROM crm_auto_registrations r WHERE r.message_id=m.id AND r.voided_at IS NULL LIMIT 1) AS auto_registration_id FROM crm_messages m WHERE m.account_id=${lead.accountId}
   AND (${user.role==='admin'} OR m.lead_id IS NULL OR EXISTS(SELECT 1 FROM leads l WHERE l.id=m.lead_id AND l.deleted_at IS NULL))
   AND m.status NOT IN ('draft','cancelled','voided') AND m.last_interaction_at IS NOT NULL
   ORDER BY m.last_interaction_at DESC LIMIT 200`.execute(db)).rows;
  const templatePicks=(await sql<{templateId:string;picks:Record<string,string>}>`SELECT DISTINCT ON (template_snapshot->>'id') template_snapshot->>'id' AS "templateId",template_snapshot->'variantPicks' AS picks FROM crm_messages WHERE account_id=${lead.accountId} AND template_snapshot ? 'variantPicks' AND jsonb_typeof(template_snapshot->'variantPicks')='object' ORDER BY template_snapshot->>'id',created_at DESC`.execute(db)).rows;
  const messages=(await sql`SELECT m.*, (SELECT r.id::text FROM crm_auto_registrations r WHERE r.message_id=m.id AND r.voided_at IS NULL LIMIT 1) AS auto_registration_id, (SELECT r.user_email FROM crm_auto_registrations r WHERE r.message_id=m.id AND r.voided_at IS NULL LIMIT 1) AS auto_registration_user_email, (SELECT j.after_value->>'managementOwner' FROM crm_communication_journal j WHERE j.entity_type='interaction' AND j.entity_id=m.id::text AND j.action='message_prepared_by_delegation' ORDER BY j.id LIMIT 1) AS delegated_from_email FROM crm_messages m WHERE m.account_id=${lead.accountId} AND (${includeVoided} OR m.status<>'voided')
   AND (CAST(NULLIF(${lead.id},'') AS bigint) IS NULL OR m.lead_id=CAST(NULLIF(${lead.id},'') AS bigint))
   ORDER BY m.created_at DESC LIMIT ${COMMUNICATION_LIST_LIMIT}`.execute(db)).rows;
  // Spec 89 §8.4: the sales material links of each message (title, versions, attachment, link state).
  const materials=await messageMaterials(db,{messageIds:messages.map(row=>String((row as {id:string}).id))});
  const restrictions=(await sql`SELECT * FROM crm_contact_restrictions WHERE account_id=${lead.accountId}
   ORDER BY created_at DESC LIMIT 200`.execute(db)).rows;
  // Uncapped: blocking checks must never miss an active restriction hidden behind 200 newer lifted ones.
  const activeRestrictions=(await sql`SELECT * FROM crm_contact_restrictions WHERE account_id=${lead.accountId} AND lifted_at IS NULL ORDER BY created_at DESC`.execute(db)).rows;
  // Spec 90, read-only: resolved_task_titles lists the (not deleted) tasks this response completed, from its response_task_resolved journal rows;
  // has_inbound tells whether a received message is linked to it, even one outside the loaded window.
  const responses=(await sql`SELECT r.*,coalesce(l.opportunity_name,'General') AS context_name,(SELECT array_agg(t.title ORDER BY t.id) FROM crm_communication_journal rj JOIN crm_tasks t ON t.id=(rj.after_value->>'taskId')::bigint AND t.deleted_at IS NULL WHERE rj.account_id=r.account_id AND rj.entity_type='response' AND rj.entity_id=r.id::text AND rj.action='response_task_resolved') AS resolved_task_titles,EXISTS(SELECT 1 FROM crm_inbound_messages hi WHERE hi.account_id=r.account_id AND hi.response_id=r.id) AS has_inbound FROM crm_communication_responses r LEFT JOIN leads l ON l.id=r.lead_id WHERE r.account_id=${lead.accountId} AND (r.lead_id IS NULL OR l.deleted_at IS NULL) ORDER BY r.occurred_at DESC LIMIT ${COMMUNICATION_LIST_LIMIT}`.execute(db)).rows;
  const repliesAvailable=smtpConfigured();
  const replySql=inboxReplyAvailability(repliesAvailable,user.role==='admin',user.email);
  const inbound=(await sql`SELECT i.id,i.channel,i.channel_detail,i.received_at,i.from_address,i.from_name,i.subject,i.text_body,i.status,i.is_automatic,i.match_method,i.lead_id,coalesce(l.opportunity_name,'General') AS context_name,i.linked_message_id,i.response_id,i.attachments,(SELECT r.id::text FROM crm_auto_registrations r WHERE r.inbound_id=i.id AND r.voided_at IS NULL LIMIT 1) AS auto_registration_id, (SELECT r.user_email FROM crm_auto_registrations r WHERE r.inbound_id=i.id AND r.voided_at IS NULL LIMIT 1) AS auto_registration_user_email,
   ${replySql.canReply} AS can_reply,
   ${replySql.replyRestricted} AS reply_restricted
   FROM crm_inbound_messages i JOIN crm_accounts a ON a.id=i.account_id LEFT JOIN leads l ON l.id=i.lead_id WHERE i.account_id=${lead.accountId} AND (${includeVoided} OR i.status<>'voided') AND (${user.role==='admin'} OR i.lead_id IS NULL OR l.deleted_at IS NULL) ORDER BY i.received_at DESC LIMIT ${COMMUNICATION_LIST_LIMIT}`.execute(db)).rows;
  const openManagements=(await sql`SELECT l.id,l.opportunity_name,l.management_type,l.estado,l.assigned_user_email,s.classification FROM leads l JOIN crm_stages s ON s.name=l.estado WHERE l.account_id=${lead.accountId} AND l.deleted_at IS NULL AND s.classification='open' ORDER BY l.id`.execute(db)).rows.map((item:any)=>({id:item.id,opportunityName:item.opportunity_name,managementType:item.management_type,estado:item.estado,assignedUserEmail:item.assigned_user_email,classification:item.classification,canClose:user.role==='admin'||item.assigned_user_email===user.email}));
  // Decision 2B: the viewer's own contacts here that still wait for "¿Cómo salió?".
  const pendingOutcomes=await pendingContactOutcomes(db,{ownerEmail:user.email,isAdmin:user.role==='admin',accountId:lead.accountId,leadId:lead.id||null});
  // Spec 91 §12, read-only: the caller's previous visit, for the «Nuevo desde tu última visita» divider.
  const lastSeenAt=(await sql<{lastSeenAt:Date}>`SELECT last_seen_at AS "lastSeenAt" FROM crm_communication_reads WHERE user_id=${user.id} AND account_id=${lead.accountId}`.execute(db)).rows[0]?.lastSeenAt??null;
  return response({lastSeenAt,pendingOutcomes,templatePicks:Object.fromEntries(templatePicks.map(row=>[row.templateId,row.picks])),recentMessages:camelRows(recentMessages as Record<string,unknown>[]),messages:camelRows(messages as Record<string,unknown>[]).map(row=>({...row,materials:materials[String(row.id)]??[]})),restrictions:camelRows(restrictions as Record<string,unknown>[]),activeRestrictions:camelRows(activeRestrictions as Record<string,unknown>[]),responses:camelRows(responses as Record<string,unknown>[]),inbound:camelRows(inbound as Record<string,unknown>[]),replyAvailable:repliesAvailable,openManagements,recentContactHours:cfg.recentContactHours,webhookConfigured:(process.env.BREVO_WEBHOOK_TOKEN?.length??0)>=32});
 }catch(e){return failure(e)}
}
export async function post(request:Request){try{const {user}=await getServerUserSession(request);if(Number(request.headers.get('Content-Length')??0)>100000)throw new Error('Solicitud demasiado grande');const raw=await request.text();if(raw.length>100000)throw new Error('Solicitud demasiado grande');return response(await mutateCommunication(db,communicationMutation.parse((()=>{try{return superjson.parse(raw)}catch{throw new Error('Solicitud inválida.')}})()),user));}catch(e){return failure(e)}}
/**
 * POST /_api/communication/seen (spec 91 §12): records the caller's visit to a business «Comunicación» tab. Same read check
 * as the GET; it writes only the caller's own row of crm_communication_reads (no journal, no history, no live bump). The
 * marker never moves backwards (GREATEST) and a future `seenAt` is capped at the server's now().
 */
export async function seen(request:Request){
 try{
  const {user}=await getServerUserSession(request);
  if(Number(request.headers.get('Content-Length')??0)>2000)throw new Error('Solicitud demasiado grande');
  const raw=await request.text();if(raw.length>2000)throw new Error('Solicitud demasiado grande');
  const input=communicationSeenInput.parse((()=>{try{return superjson.parse(raw)}catch{throw new Error('Solicitud inválida.')}})());
  await assertBusinessAccess(db,input.accountId,user);
  const row=(await sql<{lastSeenAt:Date}>`INSERT INTO crm_communication_reads(user_id,account_id,last_seen_at) VALUES(${user.id},${input.accountId},LEAST(${input.seenAt}::timestamptz,now()))
   ON CONFLICT(user_id,account_id) DO UPDATE SET last_seen_at=GREATEST(crm_communication_reads.last_seen_at,EXCLUDED.last_seen_at) RETURNING last_seen_at AS "lastSeenAt"`.execute(db)).rows[0];
  return response({lastSeenAt:row.lastSeenAt});
 }catch(e){return failure(e)}
}
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
    const fresh=(await sql<{fingerprint:string}>`INSERT INTO crm_email_events(fingerprint,message_id,recipient,event,occurred_at,payload,outbox_id) VALUES(${fingerprint},${v['message-id']},${v.email},${v.event},${at},${JSON.stringify(v)}::text::jsonb,${oid}) ON CONFLICT DO NOTHING RETURNING fingerprint`.execute(e)).rows.length>0;
    if(oid){
     await lockAccounts(e,(await sql<{accountId:string}>`SELECT account_id FROM crm_messages WHERE outbox_id=${oid}`.execute(e)).rows.map(r=>r.accountId));await sql`UPDATE email_outbox SET message_id=coalesce(message_id,${v['message-id']}) WHERE id=${oid} AND message_id IS NULL`.execute(e);
     // Spec 93 §2.2: reconcile only on new delivery evidence (a fresh terminal event) or to adopt earlier orphan events. Opens, clicks,
     // spam, deferred and redelivered duplicates are stored and change nothing, so a lifted restriction is never re-added by them.
     const orphans=(await sql`SELECT 1 FROM crm_email_events WHERE outbox_id IS NULL AND trim(both '<>' from message_id)=trim(both '<>' from ${v['message-id']}) AND lower(recipient)=lower(${v.email}) LIMIT 1`.execute(e)).rows.length>0;
     if((fresh&&isTerminalEmailEvent(v.event))||orphans)await reconcileEvents(e,oid);
    }
   }
  });return new Response('OK');
 // Lock waits, deadlocks and timeouts are retryable: 503 lets the provider redeliver; invalid payloads stay 400.
 }catch(e){return isTransientDbError(e)?new Response('Temporarily unavailable',{status:503,headers:{'Retry-After':'30'}}):new Response('Invalid webhook event',{status:400})}
}
