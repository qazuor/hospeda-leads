import {sql,type RawBuilder} from 'kysely';
import type {InboxUser} from './inboxTypes';
import {db} from './db';
import {normalizeSearchSql} from './searchSql';
import {argentinaInstant} from './workDates';
import superjson from 'superjson';
import {getServerUserSession} from './getServerUserSession';
import {CrmForbidden,assertAccountViewable} from './crmPermissions';
import {crmError,fallbackStatus} from './crmErrors';
import {ZodError} from 'zod';
import {inboxBusinessesInput,inboxThreadsInput,inboxThreadInput,inboxSearchInput} from '../endpoints/inbox.schema';
import {buildInboxSnippet,decodeInboxCursor,encodeInboxCursor,escapeLikePattern,inboxSearchLength,INBOX_SEARCH_MIN} from '../endpoints/inboxPure';
import {inboxReplyAvailability} from './inboxReplyAvailability';
import {smtpConfigured} from './smtpTransport';

/** A business or management that does not exist (or is not in the requested business): 404. */
export class InboxNotFound extends Error {}
const json=(value:unknown,status=200)=>new Response(superjson.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const badRequest=(error:unknown)=>error instanceof ZodError||error instanceof Error&&(error.message==='Cursor inválido.'||error.message==='Rango de fechas inválido.');
const fail=(error:unknown)=>json({error:crmError(error)},error instanceof Error&&error.name==='NotAuthenticatedError'?401:error instanceof CrmForbidden?403:error instanceof InboxNotFound?404:badRequest(error)?400:fallbackStatus(error));
async function auth(request:Request){return getServerUserSession(request);}
const params=(request:Request)=>Object.fromEntries(new URL(request.url).searchParams);
/** Single-business read access (assertAccountViewable: archived only for admin or its own seller; deleted forbidden); a missing business is 404. */
async function viewableAccount(user:InboxUser,accountId:string){
 const account=await db.selectFrom('crmAccounts').select(['id','nombre','assignedUserEmail','archivedAt','deletedAt','mergedIntoId','doNotContact']).where('id','=',accountId).executeTakeFirst();
 if(!account)throw new InboxNotFound('No encontramos ese negocio.');
 assertAccountViewable(user,account);
 return {accountOwner:user.role==='admin'||account.assignedUserEmail===user.email,accountName:account.nombre};
}
/**
 * Keyset cursor instant with full timestamptz (microsecond) precision. It is compared back as `${at}::text::timestamptz`:
 * a parameter typed timestamptz is serialized by postgres.js through `new Date()`, which drops the microseconds.
 */
const cursorAt=(expression:RawBuilder<unknown>)=>sql<string>`to_char(${expression} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

export async function inboxBusinesses(request:Request){try{
 const {user}=await auth(request),a=inboxBusinessesInput.parse(params(request)),cursor=decodeInboxCursor(a.cursor),all=a.scope==='all'&&user.role==='admin';
 if(cursor&&cursor.kind!=='business')throw new Error('Cursor inválido.');
 const result=await queryInboxBusinesses(user,all,a.filter,a.channel,cursor?{at:cursor.at,id:cursor.id}:undefined,a.limit),allRows=result.rows as Record<string,unknown>[],page=allRows.slice(0,a.limit),last=page.at(-1),rows=page.map(({cursorAt:_cursorAt,...row})=>row);
 return json({rows,nextCursor:allRows.length>a.limit&&last?encodeInboxCursor({at:String(last.cursorAt),id:String(last.accountId),kind:'business'}):null});
}catch(e){return fail(e);}}

export async function inboxThreads(request:Request){try{
 const {user}=await auth(request),{accountId}=inboxThreadsInput.parse(params(request)),{accountName}=await viewableAccount(user,accountId);
 // accountName lets the Bandeja title the business even when it is not in the loaded list page (deep link, left «A revisar»).
 const rows=await queryInboxThreads(user,accountId);return json({rows:rows.rows,accountName});
}catch(e){return fail(e);}}

export async function inboxThread(request:Request){try{
 const {user}=await auth(request),a=inboxThreadInput.parse(params(request)),cursor=decodeInboxCursor(a.cursor),leadId=a.leadId==='none'?null:a.leadId,admin=user.role==='admin',includeVoided=admin&&a.includeVoided==='1';
 if(cursor&&String(cursor.kind)==='business')throw new Error('Cursor inválido.');
 const {accountOwner}=await viewableAccount(user,a.accountId);
 if(leadId===null&&!accountOwner)throw new CrmForbidden('Solo el responsable del negocio o un administrador puede consultar la actividad general.');
 if(leadId){
  const lead=await db.selectFrom('leads').select(['accountId','deletedAt','assignedUserEmail']).where('id','=',leadId).executeTakeFirst();
  if(!lead||String(lead.accountId)!==a.accountId)throw new InboxNotFound('No encontramos esa gestión en este negocio.');
  if(lead.deletedAt&&!admin)throw new CrmForbidden('Esta gestión está en la papelera. Solo un administrador puede consultarla.');
  if(!accountOwner&&lead.assignedUserEmail!==user.email)throw new CrmForbidden('No tenés acceso a esta gestión.');
 }
 const availability=inboxReplyAvailability(smtpConfigured(),admin,user.email),rows=await queryInboxThreadEvents(a.accountId,leadId,a.channel,availability,includeVoided,cursor?{at:cursor.at,id:cursor.id,kind:cursor.kind as 'in'|'out'}:undefined,a.limit),items=rows.rows as Record<string,unknown>[],page=items.slice(0,a.limit),last=page.at(-1),visible=page.map(({cursorAt:_cursorAt,...item})=>item);
 return json({rows:visible,nextCursor:items.length>a.limit&&last?encodeInboxCursor({at:String(last.cursorAt),id:String(last.id),kind:String(last.kind) as 'in'|'out'}):null});
}catch(e){return fail(e);}}

export async function inboxSearch(request:Request){try{
 const {user}=await auth(request),a=inboxSearchInput.parse(params(request)),cursor=decodeInboxCursor(a.cursor),term=a.q.trim(),all=a.scope==='all'&&user.role==='admin';
 if(cursor&&String(cursor.kind)==='business')throw new Error('Cursor inválido.');
 if(inboxSearchLength(term)<INBOX_SEARCH_MIN)return json({rows:[],nextCursor:null,queryTooShort:true});if(a.from&&a.to&&a.from>a.to)throw new Error('Rango de fechas inválido.');
 const result=await queryInboxSearch(
  user,all,term,a.direction,a.channel,a.from,a.to,
  cursor?{at:cursor.at,id:cursor.id,kind:cursor.kind as 'in'|'out'}:undefined,a.limit
 );
 // Raw sql results go through CamelCasePlugin too, so every column is read by its camelCase alias.
 const allRows=result.rows as Record<string,unknown>[];
 const rows=allRows.slice(0,a.limit).map(row=>({
  kind:row.kind,id:row.id,accountId:row.accountId,accountName:row.accountName,
  leadId:row.leadId,leadTitle:row.leadTitle,
  channel:row.channel,at:row.at,snippet:buildInboxSnippet(String(row.text??''),term)
 }));
 const last=allRows[a.limit-1];
 return json({rows,nextCursor:allRows.length>a.limit&&last?encodeInboxCursor({
  at:String(last.cursorAt),id:String(last.id),kind:String(last.kind) as 'in'|'out'
 }):null,queryTooShort:false});
}catch(e){return fail(e);}}

/**
 * Shared literal predicates keep every inbox query on the same status rules. A voided automatic registration (migration 042)
 * is out of every list, count, last activity and search, in both directions; the thread detail shows it only to an admin who
 * asks for it, like the «Anulados» filter of the business «Comunicación» tab.
 */
const listedInbound=(alias:'i')=>sql<boolean>`${sql.ref(`${alias}.status`)} IN ('pending_review','registered')`;
const detailInbound=(alias:'i',includeVoided:boolean)=>includeVoided?sql<boolean>`${sql.ref(`${alias}.status`)} IN ('pending_review','registered','dismissed','voided')`:sql<boolean>`${sql.ref(`${alias}.status`)} IN ('pending_review','registered','dismissed')`;
const pendingInbound=(alias:'i')=>sql<boolean>`${sql.ref(`${alias}.status`)}='pending_review' AND ${sql.ref(`${alias}.is_automatic`)}=false`;
const includedOutbound=(alias:'m')=>sql<boolean>`${sql.ref(`${alias}.status`)} NOT IN ('draft','cancelled','voided')`;
const detailOutbound=(alias:'m',includeVoided:boolean)=>includeVoided?sql<boolean>`${sql.ref(`${alias}.status`)} NOT IN ('draft','cancelled')`:includedOutbound(alias);
const channelIs=(alias:'m'|'i',channel:string|undefined)=>channel?sql<boolean>`AND ${sql.ref(`${alias}.channel`)}=${channel}`:sql<boolean>``;

/**
 * Row visibility shared by every inbox list (decisiones.md, «Bandeja de conversaciones»): the reviewGET rule of inbound.ts
 * (a seller sees a row when the business OR the management is assigned to her) plus assertAccountViewable for archived
 * businesses (only an admin or the business's own seller). Deleted businesses and deleted managements are excluded for
 * everyone, admins included, as in reviewGET; an admin can still open a trashed management's thread by its link.
 * `seesAll` (admin with scope=all) skips the assignment check. Requires aliases `a` (crm_accounts) and
 * `l` (leads LEFT JOINed on the row's lead_id).
 */
function visibleRow(user:InboxUser,seesAll:boolean){
 const admin=user.role==='admin';
 return sql<boolean>`(a.deleted_at IS NULL AND (l.id IS NULL OR l.deleted_at IS NULL)
  AND (${seesAll} OR ((a.assigned_user_email=${user.email} OR l.assigned_user_email=${user.email})
   AND (a.archived_at IS NULL OR a.assigned_user_email=${user.email} OR ${admin}))))`;
}

export async function queryInboxBusinesses(user:InboxUser,seesAll:boolean,filter:string,channel:string|undefined,cursor:{at:string;id:string}|undefined,limit:number){
 const visible=visibleRow(user,seesAll);
 return sql`WITH activity AS (
  SELECT m.account_id,coalesce(m.last_interaction_at,m.created_at) AS at,m.channel,'out'::text AS direction,m.body AS preview,m.id::text AS event_id
  FROM crm_messages m
  JOIN crm_accounts a ON a.id=m.account_id LEFT JOIN leads l ON l.id=m.lead_id
  WHERE ${includedOutbound('m')} AND ${visible} ${channelIs('m',channel)}
  UNION ALL
  SELECT i.account_id,i.received_at,i.channel,'in',i.text_body,i.id::text
  FROM crm_inbound_messages i
  JOIN crm_accounts a ON a.id=i.account_id LEFT JOIN leads l ON l.id=i.lead_id
  WHERE ${listedInbound('i')} AND ${visible} ${channelIs('i',channel)} -- dismissed and unmatched are detail-only or excluded
 ), latest AS (
  SELECT DISTINCT ON (x.account_id) x.account_id,x.at,x.channel,x.direction,x.preview
  FROM activity x
  ORDER BY x.account_id,x.at DESC,x.event_id DESC
 ), counts AS (
  SELECT i.account_id,count(*)::int AS n
  FROM crm_inbound_messages i
  JOIN crm_accounts a ON a.id=i.account_id LEFT JOIN leads l ON l.id=i.lead_id
  WHERE ${pendingInbound('i')} AND ${visible} ${channelIs('i',channel)}
  GROUP BY i.account_id
 )
 SELECT t.account_id::text AS "accountId",a.nombre AS "accountName",t.at AS "lastActivityAt",${cursorAt(sql`t.at`)} AS "cursorAt",t.channel AS "lastChannel",t.direction AS "lastDirection",
  left(regexp_replace(coalesce(t.preview,''),'\\s+',' ','g'),140) AS "lastPreview",coalesce(c.n,0) AS "pendingCount"
 FROM latest t
 JOIN crm_accounts a ON a.id=t.account_id
 LEFT JOIN counts c ON c.account_id=t.account_id
 WHERE (${filter==='all'} OR coalesce(c.n,0)>0)
  ${cursor?sql`AND (t.at,t.account_id)<(${cursor.at}::text::timestamptz,${cursor.id}::bigint)`:sql``}
 ORDER BY t.at DESC,t.account_id DESC
 LIMIT ${limit+1}`.execute(db);
}

/** Conversations of one business; the caller already asserted business read access. Rows follow visibleRow (admin sees all). */
export async function queryInboxThreads(user:InboxUser,accountId:string){
 const visible=visibleRow(user,user.role==='admin');
 return sql`WITH events AS (
  SELECT m.lead_id,m.channel,coalesce(m.last_interaction_at,m.created_at) AS at,false AS pending
  FROM crm_messages m
  JOIN crm_accounts a ON a.id=m.account_id LEFT JOIN leads l ON l.id=m.lead_id
  WHERE m.account_id=${accountId} AND ${includedOutbound('m')} AND ${visible}
  UNION ALL
  SELECT i.lead_id,i.channel,i.received_at,${pendingInbound('i')}
  FROM crm_inbound_messages i
  JOIN crm_accounts a ON a.id=i.account_id LEFT JOIN leads l ON l.id=i.lead_id
  WHERE i.account_id=${accountId} AND ${listedInbound('i')} AND ${visible}
 )
 SELECT e.lead_id::text AS "leadId",coalesce(l.opportunity_name,'General') AS "leadTitle",e.channel,max(e.at) AS "lastActivityAt",
  count(*)::int AS "messageCount",count(*) FILTER(WHERE e.pending)::int AS "pendingCount"
 FROM events e
 LEFT JOIN leads l ON l.id=e.lead_id
 GROUP BY e.lead_id,l.opportunity_name,e.channel
 ORDER BY max(e.at) DESC,e.lead_id DESC NULLS LAST,e.channel`.execute(db);
}

// Thread detail is assembled in the endpoint from this single SQL union so both directions share keyset ordering.
// Every row of one conversation shares the same business and management, so the endpoint's access check covers them all.
// Inbound rows carry everything the shared inbound actions need (subject, automatic flag, linked message, reply
// availability), so the Bandeja never depends on the 200-row window of GET /_api/communication.
export async function queryInboxThreadEvents(accountId:string,leadId:string|null,channel:string,replySql:ReturnType<typeof inboxReplyAvailability>,includeVoided:boolean,cursor:{at:string;id:string;kind:'in'|'out'}|undefined,limit:number){
 return sql`WITH events AS (
  SELECT 'out'::text AS kind,m.id::text AS id,coalesce(m.last_interaction_at,m.created_at) AS at,m.channel,m.status,coalesce(m.body,'') AS text,m.summary,m.owner_email AS "authorEmail",
   NULL::text AS "fromName",NULL::text AS "fromAddress",false AS pending,false AS dismissed,
   (m.channel IN ('call','social','other') OR m.status LIKE 'manual_%') AS "isManualLog",false AS "replyAvailable",false AS "replyRestricted",
   coalesce(m.subject,'') AS subject,false AS "isAutomatic",NULL::text AS "linkedMessageId",m.status='voided' AS voided,
   ar.id::text AS "autoRegistrationId",ar.user_email AS "autoRegistrationUserEmail"
  FROM crm_messages m
  LEFT JOIN LATERAL (SELECT r.id,r.user_email FROM crm_auto_registrations r WHERE r.message_id=m.id AND r.voided_at IS NULL LIMIT 1) ar ON true
  WHERE m.account_id=${accountId} AND m.lead_id IS NOT DISTINCT FROM ${leadId}::bigint AND m.channel=${channel}
   AND ${detailOutbound('m',includeVoided)}
  UNION ALL
  SELECT 'in',i.id::text,i.received_at,i.channel,i.status,i.text_body,NULL::text,NULL::text,i.from_name,i.from_address,
   ${pendingInbound('i')},i.status='dismissed',false,${replySql.canReply},${replySql.replyRestricted},
   coalesce(i.subject,''),i.is_automatic,i.linked_message_id::text,i.status='voided',ar.id::text,ar.user_email
  FROM crm_inbound_messages i
  JOIN crm_accounts a ON a.id=i.account_id LEFT JOIN leads l ON l.id=i.lead_id
  LEFT JOIN LATERAL (SELECT r.id,r.user_email FROM crm_auto_registrations r WHERE r.inbound_id=i.id AND r.voided_at IS NULL LIMIT 1) ar ON true
  WHERE i.account_id=${accountId} AND i.lead_id IS NOT DISTINCT FROM ${leadId}::bigint AND i.channel=${channel}
   AND ${detailInbound('i',includeVoided)} -- dismissed messages are visible only in detail
 )
 SELECT events.*,${cursorAt(sql`events.at`)} AS "cursorAt" FROM events
 ${cursor?sql`WHERE (at,id,kind)<(${cursor.at}::text::timestamptz,${cursor.id},${cursor.kind})`:sql``}
 ORDER BY at DESC,id DESC,kind DESC
 LIMIT ${limit+1}`.execute(db);
}

export async function queryInboxSearch(user:InboxUser,seesAll:boolean,query:string,direction:string,channel:string|undefined,from:string|undefined,to:string|undefined,cursor:{at:string;id:string;kind:'in'|'out'}|undefined,limit:number){
 const nextDay=(day:string)=>{const date=new Date(`${day}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+1);return date.toISOString().slice(0,10);};
 const fromAt=from?argentinaInstant(`${from}T00:00`):null,toAt=to?argentinaInstant(`${nextDay(to)}T00:00`):null;
 // The term is a literal substring: %, _ and \ are escaped so they never act as LIKE wildcards. Both sides keep the
 // normalizeSearchSql() expression of migration 043, so the trigram indexes still apply.
 const pattern=normalizeSearchSql(sql<string>`${'%'+escapeLikePattern(query)+'%'}`);
 const matches=(column:string)=>sql<boolean>`${normalizeSearchSql(sql<string>`${sql.ref(column)}`)} LIKE ${pattern} ESCAPE '\\'`;
 return sql`WITH hits AS (
  SELECT 'out'::text AS kind,m.id::text AS id,m.account_id,m.lead_id,m.channel,coalesce(m.last_interaction_at,m.created_at) AS at,
   coalesce(m.subject,'')||' '||coalesce(m.body,'')||' '||coalesce(m.summary,'') AS text
  FROM crm_messages m
  WHERE ${includedOutbound('m')} AND (${direction!=='in'})
   AND (${channel??null}::text IS NULL OR m.channel=${channel??null})
   AND (${fromAt}::timestamptz IS NULL OR coalesce(m.last_interaction_at,m.created_at)>=${fromAt})
   AND (${toAt}::timestamptz IS NULL OR coalesce(m.last_interaction_at,m.created_at)<${toAt})
   AND (${matches('m.subject')} OR ${matches('m.body')} OR ${matches('m.summary')})
  UNION ALL
  SELECT 'in',i.id::text,i.account_id,i.lead_id,i.channel,i.received_at,coalesce(i.subject,'')||' '||coalesce(i.text_body,'')
  FROM crm_inbound_messages i
  WHERE ${listedInbound('i')} AND (${direction!=='out'}) -- dismissed is detail-only
   AND (${channel??null}::text IS NULL OR i.channel=${channel??null})
   AND (${fromAt}::timestamptz IS NULL OR i.received_at>=${fromAt})
   AND (${toAt}::timestamptz IS NULL OR i.received_at<${toAt})
   AND (${matches('i.subject')} OR ${matches('i.text_body')})
 )
 SELECT h.kind,h.id,h.account_id::text AS "accountId",a.nombre AS "accountName",h.lead_id::text AS "leadId",
  CASE WHEN h.lead_id IS NULL THEN 'General' ELSE l.opportunity_name END AS "leadTitle",h.channel,h.at,h.text,${cursorAt(sql`h.at`)} AS "cursorAt"
 FROM hits h JOIN crm_accounts a ON a.id=h.account_id LEFT JOIN leads l ON l.id=h.lead_id
 WHERE ${visibleRow(user,seesAll)}
  ${cursor?sql`AND (h.at,h.id,h.kind)<(${cursor.at}::text::timestamptz,${cursor.id},${cursor.kind})`:sql``}
 ORDER BY h.at DESC,h.id DESC,h.kind DESC
 LIMIT ${limit+1}`.execute(db);
}
