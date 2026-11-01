import {randomUUID} from 'node:crypto';
import {sql,type Kysely} from 'kysely';
import {z} from 'zod';
import {db} from './db';
import {communicationJournal,lockCommunication,type Executor} from './communicationService';
import {setWorkActor} from './workAudit';
import {senderCandidates} from './inboundEmail';
import {chooseInboundMatch} from './inboundEmailPure';
import {canonicalInstagramProfile,normalizeInstagramUsername,INSTAGRAM_PROFILE_INVALID} from './instagramChat';
import {FREE_EMAIL_DOMAINS,addressOwners,emailDomain,groupUnmatched,storedSenderVerified,suggestBusinesses,type SuggestionAccount,type SuggestionContact,type UnmatchedRow} from './inboundSuggestions';
import {INBOUND_DISMISSED_ACTION,INBOUND_RESTORED_ACTION,addressOwnedElsewhere,dismissalText,type AddressOwner,type DismissReason,type RescanResult,type UnmatchedChannel,type UnmatchedGroup,type UnmatchedList,type UnmatchedView} from './inboundUnmatchedShared';
import {findNewDncBlocker,DNC_DUPLICATE_MESSAGE} from '../endpoints/business_duplicate_check';
import {contact as instagramProfile,instagramToken} from '../endpoints/inboundInstagram';
import type {User} from './User';
import type {DB} from './schema';

/** Spec 103 D1–D5: «Mensajes sin asociar» server logic. Every caller is admin-only (checked in `endpoints/inbound.ts`). */
const ROW_LIMIT=1000,GROUP_LIMIT=100;
/**
 * D5: at most this many profile lookups reach Meta per click, and the whole click (Meta and database) stops after `RESCAN_DEADLINE_MS` with a
 * partial result, well before the client's timeout (`RESCAN_CLIENT_TIMEOUT_MS` in the shared contract), so the admin never sees an uncertain outcome.
 */
export const RESCAN_META_LOOKUPS=50,RESCAN_DEADLINE_MS=15000;
/** Session advisory lock that keeps a single rescan running across every server process. */
export const RESCAN_LOCK_KEY=881103;
/** A second «Volver a buscar negocios» while one is running (409). */
export class RescanBusy extends Error{constructor(){super('Ya hay una búsqueda en curso. Esperá a que termine.');}}
/** A `crm_inbound_messages` row as `SELECT *` returns it (camelCased by the Kysely plugin). */
type InboundRow={id:string;channel:string;channelDetail:string|null;status:string;isOutgoing:boolean;instagramIgsid:string|null;fromAddress:string;fromName:string;subject:string;textBody:string;receivedAt:Date;externalId:string|null;accountId:string|number|null;headers:unknown};
type AccountRow={id:string|number;nombre:string;ciudad:string|null;telefono:string|null;whatsapp:string|null;email:string|null;perfilInstagram:string|null;deletedAt:Date|null;mergedIntoId:string|number|null};
const isInstagram=(r:{channel:string;channelDetail:string|null})=>r.channel==='social'&&r.channelDetail==='instagram';
const lower=(v:string|null|undefined)=>v?.trim().toLowerCase()??'';
const likeAny=(values:string[])=>values.map(v=>'%'+v.replace(/[\\%_]/g,'\\$&')+'%');
/** Same text the association uses when a message changed state meanwhile. */
export const NOT_UNMATCHED_ANYMORE='Estos mensajes ya se asociaron o se descartaron.';

const listRows=(x:Executor,view:UnmatchedView,channel:UnmatchedChannel)=>sql<UnmatchedRow>`SELECT id::text AS id,channel,channel_detail AS "channelDetail",is_outgoing AS "isOutgoing",from_address AS "fromAddress",from_name AS "fromName",subject,left(text_body,500) AS excerpt,received_at AS "receivedAt",instagram_igsid AS "instagramIgsid",headers FROM crm_inbound_messages WHERE ${view==='dismissed'?sql`status='dismissed' AND account_id IS NULL`:sql`status='unmatched'`} ${channel==='email'?sql`AND channel='email'`:channel==='instagram'?sql`AND channel='social' AND channel_detail='instagram'`:sql``} ORDER BY received_at DESC LIMIT ${ROW_LIMIT}`.execute(x);
/** Users Meta returned for IGSIDs whose messages were stored with the number (spec 103 §3.2). */
async function knownUsernames(x:Executor,rows:readonly {channel:string;channelDetail:string|null;instagramIgsid:string|null;fromAddress:string}[]){const igsids=[...new Set(rows.filter(r=>isInstagram(r)&&r.instagramIgsid&&!r.fromAddress.startsWith('@')).map(r=>r.instagramIgsid!))];if(!igsids.length)return new Map<string,string|null>();return new Map((await sql<{igsid:string;username:string|null}>`SELECT igsid,username FROM crm_instagram_contacts WHERE igsid=ANY(${igsids}::text[])`.execute(x)).rows.map(r=>[r.igsid,r.username]));}

/** Businesses and people that may match the listed cards (one query each); the pure rules in `inboundSuggestions.ts` decide. */
async function suggestionData(groups:readonly UnmatchedGroup[]){
 const usernames=[...new Set(groups.map(g=>g.instagramUsername).filter((v):v is string=>!!v))],emails=[...new Set(groups.filter(g=>g.channel==='email').map(g=>lower(g.address)).filter(Boolean))];
 const domains=[...new Set(emails.map(emailDomain).filter(d=>d&&!FREE_EMAIL_DOMAINS.has(d)))];
 if(!usernames.length&&!emails.length)return {accounts:[] as SuggestionAccount[],contacts:[] as SuggestionContact[]};
 const contacts=(await sql<SuggestionContact>`SELECT id::text AS id,account_id::text AS "accountId",name,email FROM crm_contacts WHERE deleted_at IS NULL AND (lower(email)=ANY(${emails}::text[]) OR split_part(lower(email),'@',2)=ANY(${domains}::text[])) LIMIT 500`.execute(db)).rows;
 const accounts=(await sql<SuggestionAccount>`SELECT a.id::text AS id,a.nombre,a.ciudad,a.archived_at AS "archivedAt",a.deleted_at AS "deletedAt",a.merged_into_id::text AS "mergedIntoId",a.email,a.sitio_web AS "sitioWeb",a.perfil_instagram AS "perfilInstagram",(SELECT CASE WHEN count(*)=1 THEN min(l.id)::text END FROM leads l JOIN crm_stages s ON s.name=l.estado WHERE l.account_id=a.id AND l.deleted_at IS NULL AND s.classification='open') AS "openLeadId" FROM crm_accounts a WHERE a.deleted_at IS NULL AND a.merged_into_id IS NULL AND (a.perfil_instagram ILIKE ANY(${likeAny(usernames)}::text[]) OR lower(a.email)=ANY(${emails}::text[]) OR split_part(lower(a.email),'@',2)=ANY(${domains}::text[]) OR a.sitio_web ILIKE ANY(${likeAny(domains)}::text[]) OR a.id=ANY(${contacts.map(c=>c.accountId)}::bigint[])) ORDER BY a.id LIMIT 500`.execute(db)).rows;
 return {accounts,contacts};
}
/** Who dismissed each listed message, why and when (D3: the reason lives in `crm_resource_journal`, no migration). */
async function dismissals(ids:readonly string[]){if(!ids.length)return new Map<string,{reason:string;by:string|null;at:Date}>();return new Map((await sql<{entityId:string;reason:string|null;by:string|null;at:Date}>`SELECT DISTINCT ON (j.entity_id) j.entity_id AS "entityId",j.after_value->>'reason' AS reason,coalesce(u.display_name,j.actor_email) AS by,j.created_at AS at FROM crm_resource_journal j LEFT JOIN users u ON u.email=j.actor_email WHERE j.entity='crm_inbound_messages' AND j.action=${INBOUND_DISMISSED_ACTION} AND j.entity_id=ANY(${ids}::text[]) ORDER BY j.entity_id,j.id DESC`.execute(db)).rows.map(r=>[r.entityId,{reason:r.reason??'',by:r.by,at:r.at}]));}

/** D1/D2/D3: the 100 most recent cards for one view and channel, shown with the cards that have an exact suggestion first. */
export async function listUnmatched({view,channel}:{view:UnmatchedView;channel:UnmatchedChannel}):Promise<UnmatchedList>{
 const rows=(await listRows(db,view,channel)).rows,all=groupUnmatched({rows,usernames:await knownUsernames(db,rows)}),listed=all.slice(0,GROUP_LIMIT);
 if(view==='dismissed'){const found=await dismissals(listed.flatMap(g=>g.messages.map(m=>m.id)));for(const g of listed)g.dismissal=g.messages.map(m=>found.get(m.id)).filter(Boolean).sort((a,b)=>new Date(b!.at).getTime()-new Date(a!.at).getTime())[0]??null;}
 else{const data=await suggestionData(listed);for(const g of listed){g.suggestions=suggestBusinesses({group:g,...data});g.addressOwners=addressOwners({group:g,...data});}listed.sort((a,b)=>Number(b.suggestions.some(s=>s.exact))-Number(a.suggestions.some(s=>s.exact))||new Date(b.lastAt).getTime()-new Date(a.lastAt).getTime());}
 return {groups:listed,total:all.length,truncated:rows.length===ROW_LIMIT||all.length>GROUP_LIMIT,totalAtLeast:rows.length===ROW_LIMIT};
}

/**
 * Moves rows to a business: incoming ones stay «Por revisar» (never a response, task or stage change), Instagram echoes become sent messages.
 * Same writes and journal as the original manual association. `echoLeadId` (default `leadId`) is the management an echo goes to.
 */
async function moveToAccount(e:Executor,{rows,accountId,leadId,echoLeadId=leadId,contactId,matchMethod,actor,extra={}}:{rows:readonly InboundRow[];accountId:string;leadId:string|null;echoLeadId?:string|null;contactId:string|null;matchMethod:'manual'|'instagram_handle'|'sender_email';actor:User;extra?:Record<string,unknown>}){
 for(const item of rows){
  if(item.isOutgoing&&isInstagram(item)){const messageId=randomUUID();const moved=await sql<{id:string}>`INSERT INTO crm_messages(id,account_id,original_account_id,lead_id,channel,recipient,recipient_name,body,text_body,owner_email,status,last_interaction_at,external_id) VALUES(${messageId}::uuid,${accountId},${accountId},${echoLeadId},'social',${item.fromAddress},${item.fromName},${item.textBody},${item.textBody},'instagram@hospeda','manual_sent',${item.receivedAt},${item.externalId}) ON CONFLICT(channel,external_id) WHERE external_id IS NOT NULL DO NOTHING RETURNING id`.execute(e);await sql`DELETE FROM crm_inbound_messages WHERE id=${item.id}::uuid`.execute(e);if(moved.rows[0])await communicationJournal(e,{accountId,leadId:echoLeadId,entityType:'interaction',entityId:messageId,action:'contact_completed',actor,after:{channel:'instagram',status:'manual_sent',externalId:item.externalId,to:item.fromAddress,matchMethod,...extra}});continue;}
  await sql`UPDATE crm_inbound_messages SET linked_message_id=CASE WHEN account_id=${accountId}::bigint THEN linked_message_id END,account_id=${accountId},lead_id=${leadId},contact_id=${contactId},match_method=${matchMethod},status='pending_review',updated_at=now() WHERE id=${item.id}::uuid`.execute(e);
  await communicationJournal(e,{accountId,leadId,entityType:'inbound',entityId:item.id,action:'inbound_matched',actor,after:{status:'pending_review',matchMethod,from:item.fromAddress,subject:item.subject,...extra}});
 }
}

/** Spec 103 B3: a message is only associated with a live business; merged, trashed and missing targets are rejected with a readable reason.
 * Archived is accepted: it blocks outputs, not inputs (decisiones.md), same as the automatic matching. */
export function assignableAccount<T extends {deletedAt:Date|null;mergedIntoId:string|number|null}>(account:T|undefined):T{
 if(!account||account.deletedAt)throw new Error('Ese negocio no existe o está en la papelera. Elegí otro.');
 if(account.mergedIntoId!=null)throw new Error('Ese negocio se fusionó con otro. Elegí el negocio que quedó.');
 return account;
}
const dncFields=(a:AccountRow)=>({nombre:a.nombre,ciudad:a.ciudad,telefono:a.telefono,email:a.email,whatsapp:a.whatsapp,perfilInstagram:a.perfilInstagram});
/** Commercial journal row like the business/person edit path writes (metadata as an object, not a JSON string). */
const commercialJournal=(e:Executor,{accountId,contactId=null,action,user,before,after}:{accountId:string;contactId?:string|null;action:string;user:User;before:unknown;after:unknown})=>e.insertInto('crmCommercialJournal').values({accountId,contactId,action,actorEmail:user.email,actorName:user.displayName,metadata:JSON.parse(JSON.stringify({before,after,source:'inbound_unmatched'}))}).execute();
/** Live businesses (other than `accountId`) that already hold the @usuario in their Instagram, or the email in the business or one of its people. */
async function ownersElsewhere(e:Executor,{kind,value,accountId}:{kind:'instagram'|'email';value:string;accountId:string}):Promise<AddressOwner[]>{
 const rows=kind==='instagram'
  ?(await sql<{id:string;nombre:string;ciudad:string|null;profile:string|null}>`SELECT id::text AS id,nombre,ciudad,perfil_instagram AS profile FROM crm_accounts WHERE deleted_at IS NULL AND merged_into_id IS NULL AND id<>${accountId} AND perfil_instagram ILIKE ${likeAny([value])[0]}`.execute(e)).rows.filter(r=>normalizeInstagramUsername(r.profile)===value)
  :(await sql<{id:string;nombre:string;ciudad:string|null}>`SELECT a.id::text AS id,a.nombre,a.ciudad FROM crm_accounts a WHERE a.deleted_at IS NULL AND a.merged_into_id IS NULL AND a.id<>${accountId} AND (lower(a.email)=${value} OR EXISTS(SELECT 1 FROM crm_contacts c WHERE c.account_id=a.id AND c.deleted_at IS NULL AND lower(c.email)=${value})) ORDER BY a.id`.execute(e)).rows;
 return rows.map(r=>({accountId:r.id,nombre:r.nombre,ciudad:r.ciudad}));
}
/** The chat's @usuario: from a message stored with it, or else the user Meta returned for its IGSID (what the card shows). */
async function chatUsername(e:Executor,rows:readonly InboundRow[]):Promise<string|null>{
 const stored=rows.map(r=>r.fromAddress.trim().startsWith('@')?normalizeInstagramUsername(r.fromAddress):null).find(Boolean);if(stored)return stored;
 const known=await knownUsernames(e,rows);return [...known.values()].map(u=>normalizeInstagramUsername(u)).find(Boolean)??null;
}
const emailSchema=z.string().trim().toLowerCase().email().max(320);
/**
 * D4: stores the sender's address in the chosen person or the business, in the association's transaction, only where it is empty (re-checked in
 * the UPDATE itself, so it never overwrites). The business/person edit path has no reusable helper for these fields (`updateBusinessFields` covers
 * city, responsible and classification only), so its rules are applied here explicitly: Instagram as the canonical profile URL (the creation rule)
 * with the No contactar duplicate check; email trimmed, lower-case and validated with Zod's email rule (`checkEmail`), plus the same duplicate check.
 * An address another live business already holds is refused: the webhook and the email matching need exactly one business.
 * Returns what was stored, or null when the field was filled meanwhile or the business already has the address. Any refusal throws and rolls back.
 */
async function saveAddress(e:Executor,{rows,account,contactId,user}:{rows:readonly InboundRow[];account:AccountRow;contactId:string|null;user:User}):Promise<'instagram'|'email'|null>{
 const accountId=String(account.id);
 if(rows.some(isInstagram)){
  const username=await chatUsername(e,rows);if(!username)throw new Error('Este chat no tiene un usuario de Instagram para guardar.');
  if(account.perfilInstagram?.trim())return null;
  const profile=canonicalInstagramProfile(username);if(!profile)throw new Error(INSTAGRAM_PROFILE_INVALID);
  const owned=addressOwnedElsewhere({group:{channel:'instagram',address:'@'+username,instagramUsername:username,addressOwners:await ownersElsewhere(e,{kind:'instagram',value:username,accountId})},accountId});if(owned)throw new Error(owned);
  if(await findNewDncBlocker(e,{after:{...dncFields(account),perfilInstagram:profile},before:dncFields(account),excludeId:accountId}))throw new Error(DNC_DUPLICATE_MESSAGE);
  const done=(await sql<{id:string}>`UPDATE crm_accounts SET perfil_instagram=${profile},updated_at=now() WHERE id=${accountId} AND nullif(btrim(perfil_instagram),'') IS NULL RETURNING id`.execute(e)).rows[0];
  if(done)await commercialJournal(e,{accountId,action:'account_updated',user,before:{perfilInstagram:account.perfilInstagram},after:{perfilInstagram:profile}});
  return done?'instagram':null;
 }
 const senders=[...new Set(rows.map(r=>lower(r.fromAddress)))];if(senders.length!==1)throw new Error('Elegí mensajes de un solo remitente para guardar su email.');
 const parsed=emailSchema.safeParse(senders[0]);if(!parsed.success)throw new Error('Email inválido.');const sender=parsed.data;
 if(!rows.some(r=>storedSenderVerified(r)))throw new Error('El remitente no está verificado: el email no se guarda.');
 const stored=(await sql`SELECT 1 FROM crm_contacts WHERE account_id=${accountId} AND deleted_at IS NULL AND lower(email)=${sender} LIMIT 1`.execute(e)).rows[0];if(stored||lower(account.email)===sender)return null;
 const owned=addressOwnedElsewhere({group:{channel:'email',address:sender,instagramUsername:null,addressOwners:await ownersElsewhere(e,{kind:'email',value:sender,accountId})},accountId});if(owned)throw new Error(owned);
 if(await findNewDncBlocker(e,{after:{...dncFields(account),email:sender},before:dncFields(account),excludeId:accountId}))throw new Error(DNC_DUPLICATE_MESSAGE);
 if(contactId){const done=(await sql<{id:string}>`UPDATE crm_contacts SET email=${sender},updated_at=now() WHERE id=${contactId} AND account_id=${accountId} AND deleted_at IS NULL AND nullif(btrim(email),'') IS NULL RETURNING id`.execute(e)).rows[0];if(done)await commercialJournal(e,{accountId,contactId,action:'contact_updated',user,before:{email:null},after:{email:sender}});return done?'email':null;}
 const done=(await sql<{id:string}>`UPDATE crm_accounts SET email=${sender},updated_at=now() WHERE id=${accountId} AND nullif(btrim(email),'') IS NULL RETURNING id`.execute(e)).rows[0];
 if(done)await commercialJournal(e,{accountId,action:'account_updated',user,before:{email:account.email},after:{email:sender}});
 return done?'email':null;
}

export type AssignInput={id?:string;ids?:string[];accountId:string;leadId?:string|null;contactId?:string|null;saveAddress?:boolean};
/**
 * Manual association (spec 103 B3 + D1/D2/D4). `ids` (a card's ticked messages) moves the ones still unmatched and reports the rest as `skipped`;
 * the legacy single `id` also re-associates a message «Por revisar». An Instagram chat always moves whole. Does not look at «No contactar»:
 * associating is not contacting (spec 103 §11).
 */
export async function assignUnmatched({user,input}:{user:User;input:AssignInput}){
 const ids=input.ids??[input.id!];
 return db.transaction().execute(async e=>{
  // Same lock order as inbound_register/inbound_dismiss: businesses first (current and target), then the inbound rows.
  await lockCommunication(e,async e=>({accountIds:[input.accountId,...(await sql<{accountId:string}>`SELECT DISTINCT account_id::text AS "accountId" FROM crm_inbound_messages WHERE id=ANY(${ids}::uuid[]) AND account_id IS NOT NULL`.execute(e)).rows.map(r=>r.accountId)]}));
  const rows=(await sql<InboundRow>`SELECT * FROM crm_inbound_messages WHERE id=ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE`.execute(e)).rows;
  const eligible=rows.filter(r=>r.status==='unmatched'||!input.ids&&r.status==='pending_review');
  if(!eligible.length)throw new Error(input.ids?NOT_UNMATCHED_ANYMORE:'El email ya no está disponible para asociar.');
  const account=assignableAccount(await e.selectFrom('crmAccounts').select(['id','nombre','ciudad','telefono','whatsapp','email','perfilInstagram','deletedAt','mergedIntoId']).where('id','=',input.accountId).executeTakeFirst() as AccountRow|undefined);
  if(input.leadId){const lead=await e.selectFrom('leads').select(['id','accountId','deletedAt']).where('id','=',input.leadId).executeTakeFirstOrThrow();if(String(lead.accountId)!==input.accountId||lead.deletedAt)throw new Error('La gestión no pertenece al negocio o está eliminada.');const open=(await sql`SELECT 1 FROM leads l JOIN crm_stages s ON s.name=l.estado WHERE l.id=${input.leadId} AND s.classification='open'`.execute(e)).rows[0];if(!open)throw new Error('La gestión debe estar abierta.');}
  if(input.contactId){const c=await e.selectFrom('crmContacts').select(['id','accountId','deletedAt']).where('id','=',input.contactId).executeTakeFirstOrThrow();if(String(c.accountId)!==input.accountId||c.deletedAt)throw new Error('La persona no pertenece al negocio.');}
  await setWorkActor(e,user);
  const savedAddress=input.saveAddress?await saveAddress(e,{rows:eligible,account,contactId:input.contactId??null,user}):null;
  const igsids=[...new Set(eligible.filter(r=>r.status==='unmatched'&&isInstagram(r)&&r.instagramIgsid).map(r=>r.instagramIgsid!))];
  const chat=igsids.length?(await sql<InboundRow>`SELECT * FROM crm_inbound_messages WHERE channel='social' AND channel_detail='instagram' AND instagram_igsid=ANY(${igsids}::text[]) AND status='unmatched' ORDER BY id FOR UPDATE`.execute(e)).rows:[];
  const moving=[...new Map([...eligible,...chat].map(r=>[r.id,r])).values()];
  await moveToAccount(e,{rows:moving,accountId:input.accountId,leadId:input.leadId??null,contactId:input.contactId??null,matchMethod:'manual',actor:user});
  return {ok:true as const,accountName:account.nombre,accountCode:`H${input.accountId}`,...(igsids.length||input.ids?{movedCount:moving.length}:{}),...(igsids.length?{associatedChat:true}:{}),...(input.ids?{skipped:ids.length-eligible.length}:{}),...(input.saveAddress!==undefined?{savedAddress}:{})};
 });
}

const journalInbound=(e:Executor,{ids,action,user,after}:{ids:readonly string[];action:string;user:User;after:unknown})=>ids.length?sql`INSERT INTO crm_resource_journal(entity,entity_id,actor_email,action,after_value) SELECT 'crm_inbound_messages',x,${user.email},${action},${JSON.stringify(after)}::text::jsonb FROM unnest(${ids}::text[]) AS x`.execute(e):Promise.resolve();
/** D3: dismisses the card's messages that are still unmatched (never an associated one). The reason goes to the journal; nothing is deleted. */
export async function dismissUnmatched({user,ids,reason,detail}:{user:User;ids:string[];reason:DismissReason;detail?:string|null}){
 return db.transaction().execute(async e=>{await setWorkActor(e,user);const done=(await sql<{id:string}>`UPDATE crm_inbound_messages SET status='dismissed',updated_at=now() WHERE id=ANY(${ids}::uuid[]) AND status='unmatched' AND account_id IS NULL RETURNING id::text AS id`.execute(e)).rows.map(r=>r.id);if(!done.length)throw new Error(NOT_UNMATCHED_ANYMORE);await journalInbound(e,{ids:done,action:INBOUND_DISMISSED_ACTION,user,after:{status:'dismissed',reason:dismissalText({reason,detail})}});return {ok:true as const,dismissed:done.length,skipped:ids.length-done.length};});
}
/** D3: «Restaurar» puts dismissed messages without a business back in «Sin asociar». A message dismissed from a business's review is not touched. */
export async function restoreUnmatched({user,ids}:{user:User;ids:string[]}){
 return db.transaction().execute(async e=>{await setWorkActor(e,user);const done=(await sql<{id:string}>`UPDATE crm_inbound_messages SET status='unmatched',updated_at=now() WHERE id=ANY(${ids}::uuid[]) AND status='dismissed' AND account_id IS NULL RETURNING id::text AS id`.execute(e)).rows.map(r=>r.id);if(!done.length)throw new Error('Estos mensajes ya no están descartados.');await journalInbound(e,{ids:done,action:INBOUND_RESTORED_ACTION,user,after:{status:'unmatched'}});return {ok:true as const,restored:done.length};});
}

const onlyOpenLead=async(e:Executor,accountId:string)=>{const opens=(await sql<{id:string}>`SELECT l.id::text AS id FROM leads l JOIN crm_stages s ON s.name=l.estado WHERE l.account_id=${accountId} AND l.deleted_at IS NULL AND s.classification='open' ORDER BY l.id LIMIT 2`.execute(e)).rows;return opens.length===1?opens[0].id:null;};
/** One card through the automatic rules; true when it was associated. Each card runs in its own transaction and re-reads its rows. */
async function rescanGroup(x:Kysely<DB>,{group,username,user}:{group:UnmatchedGroup;username:string|null;user:User}):Promise<boolean>{
 return x.transaction().execute(async e=>{
  if(group.channel==='instagram'&&group.igsid&&username){
   // The webhook's rule: the user stored in exactly one live business; incoming messages without a management, echoes on its only open one.
   const match=(await sql<{id:string;profile:string}>`SELECT id::text AS id,perfil_instagram AS profile FROM crm_accounts WHERE deleted_at IS NULL AND merged_into_id IS NULL AND perfil_instagram ILIKE ${likeAny([username])[0]}`.execute(e)).rows.filter(r=>normalizeInstagramUsername(r.profile)===username);
   if(match.length!==1)return false;const accountId=match[0].id;
   await lockCommunication(e,async()=>({accountIds:[accountId]}));await setWorkActor(e,user);
   const chat=(await sql<InboundRow>`SELECT * FROM crm_inbound_messages WHERE channel='social' AND channel_detail='instagram' AND instagram_igsid=${group.igsid} AND status='unmatched' ORDER BY id FOR UPDATE`.execute(e)).rows;if(!chat.length)return false;
   await moveToAccount(e,{rows:chat,accountId,leadId:null,echoLeadId:await onlyOpenLead(e,accountId),contactId:null,matchMethod:'instagram_handle',actor:user,extra:{rescan:true}});return true;
  }
  if(group.channel!=='email'||!group.verified)return false;
  // The reception rule: a verified sender stored in exactly one business (`chooseInboundMatch`), its only open management, and only the verified messages.
  const sender=lower(group.address),match=chooseInboundMatch({inReplyTo:[],references:[],sender:(await senderCandidates(e,sender)).map(r=>({accountId:String(r.accountId),leadId:null,contactId:r.contactId==null?null:String(r.contactId),messageId:null,method:'sender_email' as const}))});
  if(!match)return false;
  const target=(await sql<{mergedIntoId:string|null}>`SELECT merged_into_id::text AS "mergedIntoId" FROM crm_accounts WHERE id=${match.accountId} AND deleted_at IS NULL`.execute(e)).rows[0];if(!target||target.mergedIntoId)return false;
  await lockCommunication(e,async()=>({accountIds:[match.accountId]}));await setWorkActor(e,user);
  const rows=(await sql<InboundRow>`SELECT * FROM crm_inbound_messages WHERE id=ANY(${group.messages.map(m=>m.id)}::uuid[]) AND status='unmatched' ORDER BY id FOR UPDATE`.execute(e)).rows.filter(r=>storedSenderVerified(r));if(!rows.length)return false;
  await moveToAccount(e,{rows,accountId:match.accountId,leadId:await onlyOpenLead(e,match.accountId),contactId:match.contactId,matchMethod:'sender_email',actor:user,extra:{rescan:true}});return true;
 });
}
/**
 * D5 «Volver a buscar negocios»: the automatic rules of reception over every unmatched card, nothing weaker (no domain). Instagram chats stored
 * with the number ask Meta for the user (at most {@link RESCAN_META_LOOKUPS} lookups per click; cached users cost nothing) and get the user as their
 * address even when no business matches. The whole click stops at `deadlineMs` and reports the cards left as `unchecked`.
 * Only one rescan runs at a time: a session advisory lock on one reserved connection, which also runs all the work (the lock is released at the end,
 * or by PostgreSQL if the process dies). A second click gets {@link RescanBusy}.
 */
export async function rescanUnmatched({user,lookups=RESCAN_META_LOOKUPS,deadlineMs=RESCAN_DEADLINE_MS}:{user:User;lookups?:number;deadlineMs?:number}):Promise<RescanResult>{
 const deadline=Date.now()+deadlineMs;
 return db.connection().execute(async x=>{
  const locked=(await sql<{locked:boolean}>`SELECT pg_try_advisory_lock(${RESCAN_LOCK_KEY}) AS locked`.execute(x)).rows[0]?.locked;if(!locked)throw new RescanBusy();
  try{
   const rows=(await listRows(x,'unmatched','all')).rows,groups=groupUnmatched({rows,usernames:await knownUsernames(x,rows)});
   const token=groups.some(g=>g.channel==='instagram'&&g.igsid&&!g.instagramUsername)?await instagramToken(x):null;
   const budget={left:lookups};let associated=0,lookupsPending=0,unchecked=0;
   for(const [index,group] of groups.entries()){
    if(Date.now()>=deadline){unchecked=groups.length-index;break;}
    let username=group.instagramUsername;
    if(group.channel==='instagram'&&group.igsid&&!username&&token){
     const profile=await instagramProfile(group.igsid,token,deadline,budget,x);
     if(profile.skipped){if(Date.now()>=deadline){unchecked=groups.length-index;break;}lookupsPending++;continue;}
     username=profile.username;
    }
    if(group.channel==='instagram'&&group.igsid&&username&&rows.some(r=>r.instagramIgsid===group.igsid&&!r.fromAddress.startsWith('@')))await x.transaction().execute(async e=>{await setWorkActor(e,user);await sql`UPDATE crm_inbound_messages SET from_address=${'@'+username},updated_at=now() WHERE channel='social' AND channel_detail='instagram' AND instagram_igsid=${group.igsid} AND status='unmatched' AND from_address NOT LIKE '@%'`.execute(e);});
    if((group.channel==='instagram'&&!!username||group.channel==='email'&&group.verified)&&await rescanGroup(x,{group,username,user}))associated++;
   }
   return {associated,remaining:groups.length-associated,lookups:lookups-budget.left,lookupsPending,unchecked};
  }finally{await sql`SELECT pg_advisory_unlock(${RESCAN_LOCK_KEY})`.execute(x);}
 });
}
