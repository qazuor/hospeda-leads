import {CrmForbidden,assertBusinessAccess} from '../helpers/crmPermissions';
import {crmError} from '../helpers/crmErrors';
import {sql} from 'kysely';
import {timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import superjson from 'superjson';
import {db} from '../helpers/db';
import {getServerUserSession} from '../helpers/getServerUserSession';
import {NotAuthenticatedError} from '../helpers/getSetServerSession';
import {setWorkActor} from '../helpers/workAudit';
import {communicationMutation} from './communication.schema';
import {mutateCommunication,leadFor,communicationConfig,CommunicationForbidden,CommunicationConflict,digest,reconcileEvents,lockCommunication} from '../helpers/communicationService';
const response=(v:unknown,status=200)=>new Response(superjson.stringify(v),{status,headers:{'Content-Type':'application/json'}});
const failure=(e:unknown)=>response({error:crmError(e)},e instanceof NotAuthenticatedError?401:e instanceof CommunicationForbidden||e instanceof CrmForbidden?403:e instanceof CommunicationConflict?409:400);
export async function get(request:Request){try{const {user}=await getServerUserSession(request);const params=new URL(request.url).searchParams;if(params.get('mode')==='config'){if(user.role!=='admin')throw new CommunicationForbidden('Solo admin configura seguimientos');return response({sequences:(await sql`SELECT * FROM crm_sequences ORDER BY name`.execute(db)).rows})}const leadId=params.get('leadId');let lead:{id:string;accountId:string};if(leadId){z.string().regex(/^[1-9]\d*$/).parse(leadId);lead=(await leadFor(db,leadId,user,false)).lead;}else{const accountId=z.string().regex(/^[1-9]\d*$/).parse(params.get('accountId'));await assertBusinessAccess(db,accountId,user);lead={id:'0',accountId};}const cfg=await communicationConfig(db);return response({recentMessages:(await sql`SELECT * FROM crm_messages WHERE account_id=${lead.accountId} AND status NOT IN ('draft','cancelled') AND last_interaction_at IS NOT NULL ORDER BY last_interaction_at DESC LIMIT 200`.execute(db)).rows,messages:(await sql`SELECT * FROM crm_messages WHERE lead_id=${lead.id} ORDER BY created_at DESC LIMIT 200`.execute(db)).rows,restrictions:(await sql`SELECT * FROM crm_contact_restrictions WHERE account_id=${lead.accountId} ORDER BY created_at DESC LIMIT 200`.execute(db)).rows,sequences:(await sql`SELECT * FROM crm_sequences ORDER BY name`.execute(db)).rows,runs:(await sql`SELECT * FROM crm_sequence_runs WHERE lead_id=${lead.id} ORDER BY created_at DESC LIMIT 100`.execute(db)).rows,recentContactHours:cfg.recentContactHours,webhookConfigured:(process.env.BREVO_WEBHOOK_TOKEN?.length??0)>=32});}catch(e){return failure(e)}}
export async function post(request:Request){try{const {user}=await getServerUserSession(request);if(Number(request.headers.get('Content-Length')??0)>100000)throw new Error('Solicitud demasiado grande');const raw=await request.text();if(raw.length>100000)throw new Error('Solicitud demasiado grande');return response(await mutateCommunication(db,communicationMutation.parse(superjson.parse(raw)),user));}catch(e){return failure(e)}}
export async function webhook(request:Request){
 const secret=process.env.BREVO_WEBHOOK_TOKEN;if(!secret||secret.length<32)return new Response('Webhook not configured',{status:503});
 const provided=request.headers.get('Authorization')??'',expected='Bearer '+secret;const a=Buffer.from(provided),b=Buffer.from(expected);if(a.length!==b.length||!timingSafeEqual(a,b))return new Response('Unauthorized',{status:401});
 try{
  const raw=await request.text();if(Buffer.byteLength(raw)>262144)return new Response('Payload too large',{status:413});
  const eventSchema=z.object({event:z.string().max(100),email:z.string().email(),'message-id':z.string().min(1).max(500),ts_event:z.number().int().positive().optional(),ts:z.number().int().positive().optional(),ts_epoch:z.number().positive().optional(),tags:z.array(z.string()).optional()}).passthrough();
  const values=z.array(eventSchema).max(100).parse(Array.isArray(JSON.parse(raw))?JSON.parse(raw):[JSON.parse(raw)]);
  await db.transaction().execute(async e=>{
   await lockCommunication(e);await setWorkActor(e,{email:'brevo-webhook'});
   for(const v of values){
    const epoch=v.ts_event??v.ts??(v.ts_epoch?(v.ts_epoch>1e12?v.ts_epoch/1000:v.ts_epoch):null);if(!epoch||epoch*1000>Date.now()+86400000)throw new Error('Invalid event time');
    const at=new Date(epoch*1000);const fingerprint=digest([v['message-id'].replace(/^<|>$/g,''),v.email.toLowerCase(),v.event,epoch]);
    const out=(await sql<{id:string}>`SELECT id FROM email_outbox WHERE trim(both '<>' from message_id)=trim(both '<>' from ${v['message-id']}) AND lower(recipient_email)=lower(${v.email}) LIMIT 1`.execute(e)).rows[0];
    // Tags correlate early events even if persistence after provider acceptance failed.
    const tagId=v.tags?.find(t=>/^hospeda-[0-9a-f-]{36}$/.test(t))?.slice(8);
    const tagged=!out&&tagId?(await sql<{id:string}>`SELECT o.id FROM email_outbox o JOIN crm_messages m ON m.outbox_id=o.id WHERE m.id=${tagId}::uuid AND lower(o.recipient_email)=lower(${v.email})`.execute(e)).rows[0]:null;
    const oid=out?.id??tagged?.id??null;
    await sql`INSERT INTO crm_email_events(fingerprint,message_id,recipient,event,occurred_at,payload,outbox_id) VALUES(${fingerprint},${v['message-id']},${v.email},${v.event},${at},${JSON.stringify(v)}::text::jsonb,${oid}) ON CONFLICT DO NOTHING`.execute(e);
    if(oid){await sql`UPDATE email_outbox SET message_id=coalesce(message_id,${v['message-id']}) WHERE id=${oid}`.execute(e);await reconcileEvents(e,oid);}
   }
  });return new Response('OK');
 }catch{return new Response('Invalid webhook event',{status:400})}
}
