import {sql} from 'kysely';
import type {Message} from '../endpoints/communication.schema';
import {sentMatchesPrepared} from '../../userscript/src/textMatch';
import {communicationJournal,markClientForCare,type Executor} from './communicationService';
import {encryptionKey,normalizeInstagramUsername} from './instagram';
import {INSTAGRAM_ECHO_OWNER} from './instagramChannel';
import {attemptUsername} from './instagramChat';

/**
 * Spec 92 §2.5: Meta's echo of a message sent from Hospeda's Instagram account confirms the attempt a seller opened from the
 * composer (`instagram_opened`), or links the `mid` to one she already confirmed by hand. No user session is involved: the
 * webhook is authenticated by its signature, so this is a system path that never checks the seller's current permissions.
 */

/** Same windows as the WhatsApp user script (decisiones, «WhatsApp abierto y el user script»): instants, not business days. */
export const ECHO_WINDOW_PAST_MS=24*60*60_000,ECHO_WINDOW_FUTURE_MS=10*60_000;
/** An echo stored up to this long before `dispatch` is merged into the attempt instead of staying apart (D3). */
export const EARLIER_ECHO_MS=10*60_000;
/** `triggered_by` of every journal entry written because of an echo. */
export const INSTAGRAM_WEBHOOK_TRIGGER='instagram-webhook';
/** Activity result and task result of an attempt that Meta's echo confirmed. */
export const ECHO_CONFIRMED_RESULT='Envío confirmado por Instagram';

/** A row that an echo may resolve, as the candidate query returns it (camelCased by the Kysely plugin). */
export type EchoCandidate={id:string;status:string;recipient:string;body:string|null;textBody:string|null;lastInteractionAt:Date|string;externalId:string|null};

const at=(value:Date|string)=>new Date(value).getTime();
/** True for an attempt the echo can still claim: opened, or confirmed by hand and not linked to any `mid` yet. */
const claimable=(c:EchoCandidate)=>c.status==='instagram_opened'||(c.status==='manual_sent'&&!c.externalId);

/**
 * Pure picker (unit-tested): the attempt one echo resolves, or null. It needs the same username, a claimable status, an open
 * time between `echo − 24 h` and `echo + 10 min` and a copied text whose words overlap the echo's (Dice ≥ 0.5, D4). Opened
 * attempts win over hand-confirmed ones, then the newest. An attempt without prepared text never matches.
 */
export function pickEchoCandidate({candidates,username,text,receivedAt}:{candidates:readonly EchoCandidate[];username:string;text:string;receivedAt:Date}):EchoCandidate|null{
 const echoAt=receivedAt.getTime();
 const matching=candidates.filter(c=>{
  const prepared=(c.textBody||c.body||'').trim(),opened=at(c.lastInteractionAt);
  return claimable(c)&&attemptUsername(c.recipient)===username&&!!prepared&&opened>=echoAt-ECHO_WINDOW_PAST_MS&&opened<=echoAt+ECHO_WINDOW_FUTURE_MS&&sentMatchesPrepared(prepared,text);
 });
 return [...matching].sort((a,b)=>Number(b.status==='instagram_opened')-Number(a.status==='instagram_opened')||at(b.lastInteractionAt)-at(a.lastInteractionAt)||a.id.localeCompare(b.id))[0]??null;
}

const comparable=(text:string|null|undefined)=>(text??'').replace(/\s+/g,' ').trim();
const SYSTEM_ACTOR={role:'user' as const,email:INSTAGRAM_WEBHOOK_TRIGGER};

/**
 * Confirms one attempt with an echo, inside the caller's transaction. An opened attempt becomes `manual_sent` with the echo
 * `mid`, text and time (the prepared `body` stays), its activity says «Envío confirmado por Instagram», its task completes and
 * the care rule runs; a hand-confirmed one only gets the `mid`. Owner, management, contact, template and delegation are kept.
 * Returns the message id, or null when the row is no longer claimable (a concurrent answer or echo got there first).
 */
export async function completeInstagramAttempt(e:Executor,v:{id:string;mid:string;text:string;at:Date;source:'instagram_echo'|'instagram_echo_earlier';echoId?:string}):Promise<string|null>{
 const m=(await sql<Message>`SELECT * FROM crm_messages WHERE id=${v.id}::uuid FOR UPDATE`.execute(e)).rows[0];
 if(!m)return null;
 const extra=v.echoId?{echoId:v.echoId}:{};
 if(m.status==='manual_sent'){
  if(m.externalId)return null;
  const linked=await sql<{id:string}>`UPDATE crm_messages SET external_id=${v.mid},updated_at=now() WHERE id=${m.id}::uuid AND external_id IS NULL RETURNING id`.execute(e);
  if(!linked.rows[0])return null;
  await communicationJournal(e,{accountId:String(m.accountId),leadId:m.leadId,entityType:'interaction',entityId:m.id,action:'contact_linked',actor:null,automatic:true,triggeredBy:INSTAGRAM_WEBHOOK_TRIGGER,after:{externalId:v.mid,source:v.source,...extra}});
  return m.id;
 }
 if(m.status!=='instagram_opened')return null;
 const textEdited=comparable(v.text)!==comparable(m.textBody||m.body);
 await sql`UPDATE crm_messages SET status='manual_sent',external_id=${v.mid},text_body=${v.text},summary=${v.text},last_interaction_at=${v.at},revision=revision+1,updated_at=now() WHERE id=${m.id}::uuid`.execute(e);
 // System variant of the activity: the open already created it; the actor stays the attempt owner, never a session user.
 const activityId=m.activityId??(await sql<{id:string}>`INSERT INTO crm_activities(account_id,lead_id,type_id,title,channel,result,occurred_at,contact_ids,participants,actor_email,notes) VALUES(${m.accountId},${m.leadId},'message','Comunicación Instagram','social',${ECHO_CONFIRMED_RESULT},${v.at},${JSON.stringify(m.contactId?[m.contactId]:[])}::text::jsonb,${m.recipientName},${m.ownerEmail},${'Snapshot de mensaje #'+m.id}) RETURNING id`.execute(e)).rows[0]!.id;
 if(m.activityId)await sql`UPDATE crm_activities SET result=${ECHO_CONFIRMED_RESULT},updated_at=now() WHERE id=${m.activityId} AND outcome IS NULL`.execute(e);
 else await sql`UPDATE crm_messages SET activity_id=${activityId} WHERE id=${m.id}::uuid`.execute(e);
 if(m.taskId)await sql`UPDATE crm_tasks SET status='completed',completed_at=now(),result=${ECHO_CONFIRMED_RESULT},updated_at=now() WHERE id=${m.taskId} AND status='pending'`.execute(e);
 // Decision D4 still applies: the webhook is not an admin, so a No contactar business is not marked as client.
 await markClientForCare(e,m,SYSTEM_ACTOR);
 await communicationJournal(e,{accountId:String(m.accountId),leadId:m.leadId,entityType:'interaction',entityId:m.id,action:'contact_resolved',actor:null,automatic:true,triggeredBy:INSTAGRAM_WEBHOOK_TRIGGER,before:{status:m.status},after:{status:'manual_sent',externalId:v.mid,source:v.source,textEdited,...extra,...(m.delegatedTaskId?{delegatedTaskId:String(m.delegatedTaskId)}:{})}});
 return m.id;
}

/** Input of {@link resolveInstagramEcho}: an echo whose chat resolved to exactly one business. */
export type EchoInput={accountId:string;username:string;mid:string;text:string;receivedAt:Date};

/** Webhook step: finds and confirms the attempt this echo belongs to. Returns the resolved message id, or null to store a standalone echo. */
export async function resolveInstagramEcho(e:Executor,v:EchoInput):Promise<string|null>{
 const from=new Date(v.receivedAt.getTime()-ECHO_WINDOW_PAST_MS),to=new Date(v.receivedAt.getTime()+ECHO_WINDOW_FUTURE_MS);
 const candidates=(await sql<EchoCandidate>`SELECT id::text AS id,status,recipient,body,text_body,last_interaction_at,external_id FROM crm_messages WHERE account_id=${v.accountId} AND channel='social' AND destination_detail='instagram' AND owner_email<>${INSTAGRAM_ECHO_OWNER} AND (status='instagram_opened' OR (status='manual_sent' AND external_id IS NULL)) AND last_interaction_at BETWEEN ${from} AND ${to} FOR UPDATE`.execute(e)).rows;
 const picked=pickEchoCandidate({candidates,username:v.username,text:v.text,receivedAt:v.receivedAt});
 return picked?completeInstagramAttempt(e,{id:picked.id,mid:v.mid,text:v.text,at:v.receivedAt,source:'instagram_echo'}):null;
}

/**
 * Runs the resolution step in a savepoint: any error rolls back only that step and returns null, so the caller stores the
 * echo as a standalone row and answers 200. Meta never retries forever because of an attempt.
 */
export async function withEchoSavepoint(e:Executor,step:()=>Promise<string|null>):Promise<string|null>{
 await sql`SAVEPOINT instagram_echo_resolution`.execute(e);
 try{const id=await step();await sql`RELEASE SAVEPOINT instagram_echo_resolution`.execute(e);return id;}
 catch{await sql`ROLLBACK TO SAVEPOINT instagram_echo_resolution`.execute(e);console.warn('Instagram echo resolution failed; the echo is stored on its own.');return null;}
}

/**
 * `dispatch` step (D3): an echo of the same business, chat and text that arrived up to 10 minutes before the attempt was
 * recorded. The echo row is voided (like an auto-registration void, its `mid` moves to the attempt so a Meta retry still
 * finds it) and the attempt is confirmed with the echo's time and text. Returns the confirmed message, or null.
 */
export async function resolveEarlierInstagramEcho(e:Executor,{messageId,triggeredBy}:{messageId:string;triggeredBy:string}):Promise<Message|null>{
 const m=(await sql<Message>`SELECT * FROM crm_messages WHERE id=${messageId}::uuid FOR UPDATE`.execute(e)).rows[0];
 const username=m?attemptUsername(m.recipient):null,prepared=(m?.textBody||m?.body||'').trim();
 if(!m||m.status!=='instagram_opened'||!username||!prepared)return null;
 const echoes=(await sql<{id:string;recipient:string;textBody:string|null;lastInteractionAt:Date;externalId:string}>`SELECT id::text AS id,recipient,text_body,last_interaction_at,external_id FROM crm_messages WHERE account_id=${m.accountId} AND channel='social' AND owner_email=${INSTAGRAM_ECHO_OWNER} AND status='manual_sent' AND external_id IS NOT NULL AND last_interaction_at>=now()-(${EARLIER_ECHO_MS}*interval '1 millisecond') ORDER BY last_interaction_at DESC,id FOR UPDATE`.execute(e)).rows;
 const echo=echoes.find(x=>attemptUsername(x.recipient)===username&&sentMatchesPrepared(prepared,x.textBody??''));
 if(!echo)return null;
 await sql`UPDATE crm_messages SET status='voided',external_id=NULL,revision=revision+1,updated_at=now() WHERE id=${echo.id}::uuid`.execute(e);
 await communicationJournal(e,{accountId:String(m.accountId),leadId:m.leadId,entityType:'interaction',entityId:echo.id,action:'interaction_voided',actor:null,automatic:true,triggeredBy,before:{status:'manual_sent',externalId:echo.externalId},after:{status:'voided',reason:`Unido al intento ${m.id} abierto desde el CRM`,mergedInto:m.id}});
 await completeInstagramAttempt(e,{id:m.id,mid:echo.externalId,text:echo.textBody??'',at:new Date(echo.lastInteractionAt),source:'instagram_echo_earlier',echoId:echo.id});
 return (await sql<Message>`SELECT * FROM crm_messages WHERE id=${m.id}::uuid`.execute(e)).rows[0]??null;
}

/**
 * Read-only flags for the Instagram composer (spec 92 §2.6). `instagramAutoConfirm`: the webhook is configured and the stored
 * token is valid (without it echoes cannot be resolved to a username). `instagramShared`: another business normalizes to the
 * same username, so its chat is never associated on its own. Only booleans: no secret and no other business's data.
 */
export async function instagramComposerFlags(e:Executor,{accountId,recipient}:{accountId:string;recipient:string}):Promise<{instagramAutoConfirm:boolean;instagramShared:boolean}>{
 const username=normalizeInstagramUsername(recipient);
 let instagramAutoConfirm=!!process.env.INSTAGRAM_APP_SECRET&&!!process.env.INSTAGRAM_ACCOUNT_ID&&!!encryptionKey(process.env.INTEGRATION_SECRETS_KEY);
 if(instagramAutoConfirm){const row=(await sql<{expiresAt:Date|null}>`SELECT expires_at FROM crm_integration_secrets WHERE name='instagram'`.execute(e)).rows[0];instagramAutoConfirm=!!row?.expiresAt&&new Date(row.expiresAt).getTime()>Date.now();}
 if(!username)return {instagramAutoConfirm,instagramShared:false};
 // Same rule as the webhook match: every business outside the trash whose profile normalizes to this username.
 const needle='%'+username.replace(/[\\%_]/g,'\\$&')+'%';
 const others=(await sql<{profile:string|null}>`SELECT perfil_instagram AS profile FROM crm_accounts WHERE deleted_at IS NULL AND id<>${accountId} AND perfil_instagram ILIKE ${needle}`.execute(e)).rows;
 return {instagramAutoConfirm,instagramShared:others.some(r=>normalizeInstagramUsername(r.profile)===username)};
}
