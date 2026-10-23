import {randomUUID} from 'node:crypto';
import {sql} from 'kysely';
import {assertBusinessAccess,CrmForbidden} from './crmPermissions';
import {communicationJournal,completeUserscriptManual,lockCommunication,registerUserscriptSent} from './communicationService';
import {phoneSearchSql} from './searchSql';
import {codeFromTitle} from './userscriptPure';
import type {Executor} from './communicationService';
import type {User} from './User';

export type UserscriptMessage={externalId:string;direction:'in'|'out';text:string;sentAt:string|null;author:string|null};
export type UserscriptBatch={accountId:string;chat:{title:string;phone?:string|null};messages:UserscriptMessage[]};
export type UserscriptResult={externalId:string;status:'created'|'duplicate'|'rejected';kind?:'inbound'|'message';id?:string;reason?:string};

const MAX_FUTURE_MS=10*60_000,MAX_PAST_MS=2*365.25*24*60*60_000;
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

/** The oldest pending WhatsApp attempt of this business addressed to the chat's phone; without a phone no attempt is completed. */
async function matchingPending(e:Executor,b:UserscriptBatch,user:User):Promise<string|null>{
 const phone=b.chat.phone?.trim();if(!phone)return null;
 const recipient=phoneSearchSql('m.recipient',phone);if(!recipient)return null;
 const row=(await sql<{id:string}>`SELECT m.id::text AS id FROM crm_messages m WHERE m.account_id=${b.accountId}::bigint AND m.channel='whatsapp' AND m.status='manual_pending' AND (${user.role==='admin'} OR m.owner_email=${user.email}) AND ${recipient} ORDER BY m.created_at LIMIT 1 FOR UPDATE`.execute(e)).rows[0];
 return row?.id??null;
}

async function registerOutbound(e:Executor,b:UserscriptBatch,m:UserscriptMessage,sentAt:Date,user:User):Promise<UserscriptResult>{
 // Same guard as the manual "lo envié" flow: a recorded send needs write access to the business.
 await assertBusinessAccess(e,b.accountId,user,true,false);
 const pending=await matchingPending(e,b,user);
 const id=pending
  ?await completeUserscriptManual(e,pending,m.externalId,m.text,user)
  :await registerUserscriptSent(e,{accountId:b.accountId,externalId:m.externalId,phone:b.chat.phone??'',title:b.chat.title,text:m.text,sentAt},user);
 if(!id)return (await existing(e,b,m))??{externalId:m.externalId,status:'rejected',reason:'No se pudo registrar el mensaje.'};
 return {externalId:m.externalId,status:'created',kind:'message',id};
}

async function registerOne(e:Executor,b:UserscriptBatch,m:UserscriptMessage,user:User):Promise<UserscriptResult>{
 if(!m.text.trim())return {externalId:m.externalId,status:'rejected',reason:'El mensaje no puede estar vacío.'};
 const sentAt=m.sentAt?new Date(m.sentAt):new Date();
 if(m.sentAt&&(sentAt.getTime()>Date.now()+MAX_FUTURE_MS||sentAt.getTime()<Date.now()-MAX_PAST_MS))return {externalId:m.externalId,status:'rejected',reason:'Fecha del mensaje inválida'};
 const old=await existing(e,b,m);if(old)return old;
 return m.direction==='in'?registerInbound(e,b,m,sentAt,user):registerOutbound(e,b,m,sentAt,user);
}

/**
 * Registers a user-script batch in one transaction holding the business lock. Each message runs inside its own savepoint, so a
 * database error (or a concurrent external_id collision) rolls back only that message's rows and journal, and the batch continues.
 */
export async function registerUserscriptBatch(e:Executor,b:UserscriptBatch,user:User):Promise<UserscriptResult[]>{
 const account=await assertBusinessAccess(e,b.accountId,user,false,true);
 if(account.mergedIntoId)throw new CrmForbidden('Este negocio se fusionó con otro. Registrá los mensajes en el negocio resultante.');
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
