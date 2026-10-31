import {randomUUID} from 'node:crypto';
import {sql} from 'kysely';
import {assertBusinessAccess,CrmForbidden} from './crmPermissions';
import {communicationJournal,completeUserscriptManual,completeUserscriptOpened,lockCommunication,registerUserscriptSent} from './communicationService';
import {phoneSearchSql} from './searchSql';
import {codeFromTitle} from './userscriptPure';
import {sentMatchesPrepared} from '../../userscript/src/textMatch';
import type {Executor} from './communicationService';
import type {User} from './User';
import {autoRegisterEligibility} from './autoRegistration';

export type UserscriptMessage={externalId:string;direction:'in'|'out';text:string;sentAt:string|null;author:string|null};
export type UserscriptBatch={accountId:string;chat:{title:string;phone?:string|null};messages:UserscriptMessage[];automatic?:boolean};
export type UserscriptResult={externalId:string;status:'created'|'duplicate'|'rejected';kind?:'inbound'|'message';id?:string;reason?:string};

const MAX_FUTURE_MS=10*60_000,MAX_PAST_MS=2*365.25*24*60*60_000;
/** A WhatsApp opened from "Contactar" matches a sent message prepared at most this long before it (and at most a few minutes after). */
const OPENED_WINDOW_MS=24*60*60_000,OPENED_SKEW_MS=10*60_000;
const isUniqueViolation=(error:unknown)=>typeof error==='object'&&error!==null&&(error as {code?:string}).code==='23505';

/** An already registered WhatsApp id: a duplicate when it belongs to this business; never reveals rows of another business. */
async function existing(e:Executor,b:UserscriptBatch,m:UserscriptMessage):Promise<UserscriptResult|null>{
 const row=m.direction==='in'
  ?(await sql<{id:string;accountId:string|null}>`SELECT id::text AS id,account_id::text AS "accountId" FROM crm_inbound_messages WHERE channel='whatsapp' AND external_id=${m.externalId}`.execute(e)).rows[0]
  :(await sql<{id:string;accountId:string|null}>`SELECT id::text AS id,account_id::text AS "accountId" FROM crm_messages WHERE channel='whatsapp' AND external_id=${m.externalId}`.execute(e)).rows[0];
 if(!row)return null;
 if(row.accountId!==b.accountId)return {externalId:m.externalId,status:'rejected',reason:'Este mensaje ya está registrado en otro negocio.'};
 return {externalId:m.externalId,status:'duplicate',kind:m.direction==='in'?'inbound':'message',id:row.id};
}

async function registerInbound(e:Executor,b:UserscriptBatch,m:UserscriptMessage,sentAt:Date,user:User):Promise<UserscriptResult>{
 const id=randomUUID(),method=codeFromTitle(b.chat.title)?'crm_code':'phone';
 const inserted=await sql<{id:string}>`INSERT INTO crm_inbound_messages(id,channel,external_id,account_id,match_method,from_address,from_name,text_body,headers,attachments,is_automatic,received_at,status,source,captured_by_email) VALUES(${id}::uuid,'whatsapp',${m.externalId},${b.accountId}::bigint,${method},${b.chat.phone??''},${m.author||b.chat.title},${m.text},'{}'::text::jsonb,'[]'::text::jsonb,false,${sentAt},'pending_review','userscript',${user.email}) ON CONFLICT(channel,external_id) DO NOTHING RETURNING id::text AS id`.execute(e);
 if(!inserted.rows[0])return (await existing(e,b,m))!;
 await communicationJournal(e,{accountId:b.accountId,leadId:null,entityType:'inbound',entityId:id,action:'inbound_received',actor:user,triggeredBy:'userscript',after:{channel:'whatsapp',externalId:m.externalId,status:'pending_review'}});
 return {externalId:m.externalId,status:'created',kind:'inbound',id};
}

type PendingMatch={id:string;kind:'manual'|'opened'};
/**
 * The CRM attempt a sent message completes, so it is not recorded twice. Without a phone nothing matches. In order:
 * the oldest manual attempt (manual_pending) to the chat's phone; else the oldest WhatsApp opened from "Contactar" (whatsapp_opened),
 * or confirmed by hand without a WhatsApp id (manual_sent), prepared within OPENED_WINDOW_MS before the message was sent and whose prepared
 * text the sent one matches: a message written by hand instead is recorded on its own and the attempt stays open (spec 84).
 */
async function matchingPending(e:Executor,b:UserscriptBatch,sentAt:Date,text:string,user:User):Promise<PendingMatch|null>{
 const phone=b.chat.phone?.trim();if(!phone)return null;
 const recipient=phoneSearchSql('m.recipient',phone);if(!recipient)return null;
 const mine=sql`m.account_id=${b.accountId}::bigint AND m.channel='whatsapp' AND (${user.role==='admin'} OR m.owner_email=${user.email}) AND ${recipient}`;
 const manual=(await sql<{id:string}>`SELECT m.id::text AS id FROM crm_messages m WHERE ${mine} AND m.status='manual_pending' ORDER BY m.created_at LIMIT 1 FOR UPDATE`.execute(e)).rows[0];
 if(manual)return {id:manual.id,kind:'manual'};
 const from=new Date(sentAt.getTime()-OPENED_WINDOW_MS),to=new Date(sentAt.getTime()+OPENED_SKEW_MS);
 const opened=(await sql<{id:string;body:string|null}>`SELECT m.id::text AS id,m.body FROM crm_messages m WHERE ${mine} AND (m.status='whatsapp_opened' OR (m.status='manual_sent' AND m.external_id IS NULL)) AND m.created_at BETWEEN ${from} AND ${to} ORDER BY (m.status='whatsapp_opened') DESC,m.created_at LIMIT 20 FOR UPDATE`.execute(e)).rows.find(row=>sentMatchesPrepared(row.body,text));
 return opened?{id:opened.id,kind:'opened'}:null;
}

async function registerOutbound(e:Executor,b:UserscriptBatch,m:UserscriptMessage,sentAt:Date,user:User):Promise<UserscriptResult>{
 // Same guard as the manual "lo envié" flow: a recorded send needs write access to the business.
 await assertBusinessAccess(e,b.accountId,user,true,false);
 const pending=await matchingPending(e,b,sentAt,m.text,user);
 if(pending?.kind==='opened'){
  const done=await completeUserscriptOpened(e,{id:pending.id,externalId:m.externalId,text:m.text,sentAt},user);
  // A send the seller had already confirmed by hand was in the CRM before: report it as such.
  return {externalId:m.externalId,status:done.linked?'duplicate':'created',kind:'message',id:done.id};
 }
 const id=pending
  ?await completeUserscriptManual(e,{id:pending.id,externalId:m.externalId,text:m.text,sentAt},user)
  :await registerUserscriptSent(e,{accountId:b.accountId,externalId:m.externalId,phone:b.chat.phone??'',title:b.chat.title,text:m.text,sentAt},user);
 if(!id)return (await existing(e,b,m))??{externalId:m.externalId,status:'rejected',reason:'No se pudo registrar el mensaje.'};
 return {externalId:m.externalId,status:'created',kind:'message',id};
}

async function registerOne(e:Executor,b:UserscriptBatch,m:UserscriptMessage,user:User):Promise<UserscriptResult>{
 if(!m.text.trim())return {externalId:m.externalId,status:'rejected',reason:'El mensaje no puede estar vacío.'};
 if(b.automatic&&!m.sentAt)return {externalId:m.externalId,status:'rejected',reason:'Sin hora; registralo a mano si corresponde.'};
 const sentAt=m.sentAt?new Date(m.sentAt):new Date();
 if(m.sentAt&&(sentAt.getTime()>Date.now()+MAX_FUTURE_MS||sentAt.getTime()<Date.now()-MAX_PAST_MS))return {externalId:m.externalId,status:'rejected',reason:'Fecha del mensaje inválida'};
 if(b.automatic){
  const voided=await sql`SELECT 1 FROM crm_auto_registrations WHERE channel='whatsapp' AND external_id=${m.externalId} AND voided_at IS NOT NULL LIMIT 1`.execute(e);
  if(voided.rows.length)return {externalId:m.externalId,status:'rejected',reason:'Anulado antes; registralo a mano si corresponde.'};
  const eligibility=await autoRegisterEligibility(e,b.accountId,user);
  if(sentAt.getTime()<new Date(eligibility.since).getTime())return {externalId:m.externalId,status:'rejected',reason:'El mensaje es anterior al inicio del registro automático.'};
 }
 const old=await existing(e,b,m);if(old)return old;
 const pending=m.direction==='out'?await matchingPending(e,b,sentAt,m.text,user):null;
 const before=pending?(await sql<{id:string;status:string;body:string|null;textBody:string|null;summary:string|null;completedAt:Date|null;completedByEmail:string|null;lastInteractionAt:Date|null;revision:number;activityId:string|null;taskId:string|null;purpose:string|null;taskStatus:string|null;taskResult:string|null;taskCompletedAt:Date|null;activityResult:string|null;activityOccurredAt:Date|null;isClient:boolean}>`SELECT m.id::text,m.status,m.body,m.text_body AS "textBody",m.summary,m.completed_at AS "completedAt",m.completed_by_email AS "completedByEmail",m.last_interaction_at AS "lastInteractionAt",m.revision,m.activity_id::text AS "activityId",m.task_id::text AS "taskId",m.purpose,t.status AS "taskStatus",t.result AS "taskResult",t.completed_at AS "taskCompletedAt",a.result AS "activityResult",a.occurred_at AS "activityOccurredAt",b.is_client AS "isClient" FROM crm_messages m JOIN crm_accounts b ON b.id=m.account_id LEFT JOIN crm_tasks t ON t.id=m.task_id LEFT JOIN crm_activities a ON a.id=m.activity_id WHERE m.id=${pending.id}::uuid`.execute(e)).rows[0]:undefined;
 const result=m.direction==='in'?await registerInbound(e,b,m,sentAt,user):await registerOutbound(e,b,m,sentAt,user);
 if(b.automatic&&result.id&&(result.status==='created'||pending?.kind==='opened'&&before?.status==='manual_sent')){
  const created=m.direction==='out'?(await sql<{id:string|null;revision:number}>`SELECT activity_id::text AS id,revision FROM crm_messages WHERE id=${result.id}::uuid`.execute(e)).rows[0]:undefined,activityId=created?.id??null;
  const client=m.direction==='out'&&before?.purpose==='care'&&!before.isClient?(await sql<{isClient:boolean;clientSince:string|null}>`SELECT is_client AS "isClient",client_since::text AS "clientSince" FROM crm_accounts WHERE id=${b.accountId}::bigint`.execute(e)).rows[0]:undefined;
  let effects:Record<string,unknown>;
  if(m.direction==='in')effects={inboundId:result.id};
  else if(pending?.kind==='opened'&&before?.status==='manual_sent')effects={messageId:result.id,linkedOnly:true};
  else if(before){const activity=before.activityId?{id:activityId,previousResult:before.activityResult,previousOccurredAt:before.activityOccurredAt}:{id:activityId,created:true};effects={messageId:result.id,before:{status:before.status,body:before.body,textBody:before.textBody,summary:before.summary,completedAt:before.completedAt,completedByEmail:before.completedByEmail,lastInteractionAt:before.lastInteractionAt,revision:before.revision},activity,...(before.taskId&&before.taskStatus==='pending'?{taskId:before.taskId}:{}),...(client?.isClient?{clientMarked:true,clientSince:client.clientSince}:{})};}
  else effects={messageId:result.id,created:true,activityId,revision:created?.revision};
  await sql`INSERT INTO crm_auto_registrations(id,account_id,user_email,channel,direction,external_id,message_id,inbound_id,effects) VALUES(${randomUUID()}::uuid,${b.accountId}::bigint,${user.email},'whatsapp',${m.direction},${m.externalId},${m.direction==='out'?result.id:null}::uuid,${m.direction==='in'?result.id:null}::uuid,${JSON.stringify(effects)}::text::jsonb)`.execute(e);
 }
 return result;
}

/**
 * Registers a user-script batch in one transaction holding the business lock. Each message runs inside its own savepoint, so a
 * database error (or a concurrent external_id collision) rolls back only that message's rows and journal, and the batch continues.
 */
export async function registerUserscriptBatch(e:Executor,b:UserscriptBatch,user:User):Promise<UserscriptResult[]>{
 const account=await assertBusinessAccess(e,b.accountId,user,false,true);
 if(account.mergedIntoId)throw new CrmForbidden('Este negocio se fusionó con otro. Registrá los mensajes en el negocio resultante.');
 if(b.automatic){const eligibility=await autoRegisterEligibility(e,b.accountId,user);if(!eligibility.enabled)throw Object.assign(new Error('El registro automático no está disponible para este negocio.'),{name:'AutoRegisterConflict',reason:eligibility.reason});}
 await lockCommunication(e,async()=>({accountIds:[b.accountId]}));
 const results:UserscriptResult[]=[],seen=new Set<string>();
 for(const m of b.messages){
  if(seen.has(m.externalId)){results.push({externalId:m.externalId,status:'rejected',reason:'Repetido en el lote'});continue;}
  seen.add(m.externalId);
  await sql`SAVEPOINT userscript_message`.execute(e);
  try{
   results.push(await registerOne(e,b,m,user));
   await sql`RELEASE SAVEPOINT userscript_message`.execute(e);
  }catch(error){
   await sql`ROLLBACK TO SAVEPOINT userscript_message`.execute(e);
   const duplicate=isUniqueViolation(error)?await existing(e,b,m):null;
   if(duplicate){results.push(duplicate);continue;}
   const known=error instanceof Error&&!('code' in error);
   if(!known)console.error('userscript register failed',{externalId:m.externalId,error:error instanceof Error?error.message:String(error)});
   results.push({externalId:m.externalId,status:'rejected',reason:known?(error as Error).message:'No se pudo registrar este mensaje.'});
  }
 }
 return results;
}
