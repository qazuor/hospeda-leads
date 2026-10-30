import {sql,type Kysely,type Transaction} from 'kysely';
import type {DB} from './schema';
import {normalizeInstagramUsername} from './instagramChat';
import {assertAccountViewable} from './crmPermissions';
import {businessStatusLabels,type BusinessStatus} from './businessStatus';
import {stageLabel} from './crmLabels';
import {managementTypeLabels} from './businessManagement';
import {instagramProfilePattern} from './userscriptInstagram';

/**
 * Spec 97 §15 (owner, 29/10/2026, option 1): badges in Instagram's conversation list. Its rows show only a display name, so the user script
 * marks a row only when its name matches exactly one learned thread. Names shared by two learned threads of the account are left out here
 * (review M1) and the client also skips a name shown on two rows. This returns the learned threads of the
 * Hospeda account that have a display name and belong to businesses the user can see, each with the spec 86 badge data (WhatsApp's shape, with
 * Instagram's restriction channels). A thread whose businesses are all hidden is left out: the list never says a hidden business exists.
 */
type Executor=Kysely<DB>|Transaction<DB>;
type Actor={id:number;email:string;role:'admin'|'user'};

/** Spec 86's single badge without WhatsApp-only fields. */
export type InstagramInboxBusiness={accountId:string;code:string;name:string;city:string|null;statusLabel:string|null;assignedUserName:string|null;doNotContact:boolean;restricted:boolean;openManagement:{stageLabel:string;typeLabel:string|null}|null};
export type InstagramInboxBadge={kind:'single'}&InstagramInboxBusiness|{kind:'multiple';businesses:{accountId:string;code:string;name:string;statusLabel:string|null}[]};
export type InstagramInboxThread={username:string;displayName:string;badge:InstagramInboxBadge};

/**
 * The name key shared with the user script's `normalizeDisplayName`: only case and spacing are ignored (decision §15, exact match). Accents
 * count and ñ ≠ n; format characters are dropped.
 */
export const normalizeInboxDisplayName=(text:string)=>text.normalize('NFC').replace(/\p{Cf}/gu,'').replace(/\p{Cc}/gu,' ').toLowerCase().replace(/\s+/g,' ').trim();

/** At most this many learned threads per response (most recently proven first): the list shows far fewer rows. */
export const INSTAGRAM_INBOX_LIMIT=500;

type AccountRow={id:string;name:string;city:string|null;status:string|null;doNotContact:boolean;assignedUserEmail:string|null;archivedAt:Date|null;ownerName:string|null;perfilInstagram:string|null};

/** The learned, named threads of `viewer` whose businesses `user` can see, with their badge data; most recently proven first. */
export async function instagramInboxThreads(e:Executor,{viewer,user}:{viewer:string;user:Actor}):Promise<InstagramInboxThread[]>{
 // Review M1: ambiguity is decided over every named thread of the account, before the visibility filter and the limit, so a shared name is
 // never badged because its twin is hidden or older, and the answer does not reveal which twin exists.
 const named=(await sql<{username:string;displayName:string}>`SELECT username,display_name AS "displayName" FROM crm_instagram_threads WHERE viewer_username=${viewer} AND display_name IS NOT NULL ORDER BY verified_at DESC, username`.execute(e)).rows;
 const counts=new Map<string,number>();for(const row of named){const key=normalizeInboxDisplayName(row.displayName);counts.set(key,(counts.get(key)??0)+1);}
 const threads=named.filter(row=>counts.get(normalizeInboxDisplayName(row.displayName))===1).slice(0,INSTAGRAM_INBOX_LIMIT);
 if(!threads.length)return [];
 const patterns=threads.map(thread=>instagramProfilePattern(thread.username));
 const accounts=(await sql<AccountRow>`SELECT a.id::text AS id,a.nombre AS name,a.ciudad AS city,a.status,a.do_not_contact AS "doNotContact",a.assigned_user_email AS "assignedUserEmail",a.archived_at AS "archivedAt",u.display_name AS "ownerName",a.perfil_instagram AS "perfilInstagram" FROM crm_accounts a LEFT JOIN users u ON u.email=a.assigned_user_email WHERE a.deleted_at IS NULL AND a.merged_into_id IS NULL AND a.perfil_instagram ~* ANY(${patterns}::text[]) ORDER BY a.id`.execute(e)).rows;
 const visible=accounts.filter(row=>{try{assertAccountViewable(user,{assignedUserEmail:row.assignedUserEmail,archivedAt:row.archivedAt,deletedAt:null,mergedIntoId:null});return true;}catch{return false;}});
 const byUsername=new Map<string,AccountRow[]>();
 for(const row of visible){const username=normalizeInstagramUsername(row.perfilInstagram);if(username)byUsername.set(username,[...(byUsername.get(username)??[]),row]);}
 const ids=[...new Set(visible.map(row=>row.id))];
 const [leads,restrictions]=ids.length?await Promise.all([
  sql<{accountId:string;stage:string;type:string|null}>`SELECT l.account_id::text AS "accountId",l.estado AS stage,l.management_type AS type FROM leads l JOIN crm_stages s ON s.name=l.estado WHERE l.account_id=ANY(${ids}::bigint[]) AND l.deleted_at IS NULL AND s.classification='open' ORDER BY l.id`.execute(e),
  sql<{accountId:string}>`SELECT DISTINCT account_id::text AS "accountId" FROM crm_contact_restrictions WHERE account_id=ANY(${ids}::bigint[]) AND lifted_at IS NULL AND channel IN ('social','all') AND contact_id IS NULL AND lead_id IS NULL`.execute(e),
 ]):[null,null];
 const statusLabel=(status:string|null)=>status?businessStatusLabels[status as BusinessStatus]??null:null;
 const result:InstagramInboxThread[]=[];
 for(const thread of threads){
  const rows=byUsername.get(thread.username)??[];if(!rows.length)continue;
  if(rows.length>1){result.push({username:thread.username,displayName:thread.displayName,badge:{kind:'multiple',businesses:rows.slice(0,10).map(row=>({accountId:row.id,code:`H${row.id}`,name:row.name,statusLabel:statusLabel(row.status)}))}});continue;}
  const row=rows[0]!,lead=leads?.rows.find(item=>item.accountId===row.id);
  result.push({username:thread.username,displayName:thread.displayName,badge:{kind:'single',accountId:row.id,code:`H${row.id}`,name:row.name,city:row.city,statusLabel:statusLabel(row.status),assignedUserName:row.ownerName,doNotContact:row.doNotContact,restricted:restrictions?.rows.some(item=>item.accountId===row.id)??false,openManagement:lead?{stageLabel:stageLabel(lead.stage),typeLabel:lead.type?managementTypeLabels[lead.type as keyof typeof managementTypeLabels]??lead.type:null}:null}});
 }
 return result;
}
