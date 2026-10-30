import {sql,type Kysely,type Transaction} from 'kysely';
import {z} from 'zod';
import type {DB} from './schema';
import {INSTAGRAM_THREAD_ID,instagramProfilePattern,normalizeInstagramUsername} from './instagramChat';
import {assertBusinessAccess,canModifyBusiness,canModifyManagement} from './crmPermissions';
import {businessStatusLabels,type BusinessStatus} from './businessStatus';

/**
 * Spec 97: server side of the user script on Instagram's chat page. The Hospeda account (§4.5), the learned thread of each username
 * (`crm_instagram_threads`, §5.1), the businesses an Instagram username belongs to (§5.2 `context?instagram=`) and who may report a thread.
 * A thread row is navigation metadata, never evidence of contact: no history entry, «No contactar» does not block it.
 */
type Executor=Kysely<DB>|Transaction<DB>;
type Actor={id:number;email:string;role:'admin'|'user'};

const USERNAME=z.string().regex(/^[a-z0-9._]{1,30}$/),THREAD=z.string().regex(INSTAGRAM_THREAD_ID);
/**
 * Spec 97 §15: a chat header's display name, cleaned the way migration 054's CHECK requires: NFC, format characters (\p{Cf}) dropped, control
 * characters (\p{Cc}) turned into spaces, whitespace collapsed and trimmed, 1–100 characters.
 */
export const instagramDisplayName=z.string().max(400).transform(value=>value.normalize('NFC').replace(/\p{Cf}/gu,'').replace(/\p{Cc}/gu,' ').replace(/\s+/g,' ').trim()).pipe(z.string().min(1).max(100));
/** Review M2: a name that cannot be stored is dropped, never a reason to refuse (or fail) the thread report. */
const optionalDisplayName=z.unknown().transform(value=>{const parsed=instagramDisplayName.safeParse(value);return parsed.success?parsed.data:undefined;});
/** Body of `POST /_api/userscript/instagram/thread`: the proven username, the path's thread id and how it was proven. */
export const instagramThreadInput=z.object({username:USERNAME,threadId:THREAD,proof:z.enum(['header','seller']),displayName:optionalDisplayName}).strict();
/** Body of `POST /_api/userscript/instagram/thread/stale`: the thread a header proof contradicted. */
export const instagramThreadStaleInput=z.object({username:USERNAME,threadId:THREAD}).strict();
export type InstagramThreadProof=z.infer<typeof instagramThreadInput>['proof'];

/** Decision 12.7: the Hospeda Instagram username from `INSTAGRAM_ACCOUNT_USERNAME`, normalized; null when unset or invalid (learning and pasting stay off). */
export function instagramAccountUsername(env:Readonly<Record<string,string|undefined>>=process.env):string|null{return normalizeInstagramUsername(env.INSTAGRAM_ACCOUNT_USERNAME);}

/** The `instagram` query of `context`: a username in any accepted spelling (`@x`, profile URL), normalized; null when invalid. */
export function instagramQueryUsername(value:string|null):string|null{return value&&value.length<=200?normalizeInstagramUsername(value):null;}

const WINDOW_MS=60_000,LIMIT=30,reports=new Map<string,number[]>();
/** Per-token sliding window for thread reports, like `allowBadgeRequest` (process-local, single API process). */
export function allowInstagramThreadReport(tokenId:string,now=Date.now()):boolean{for(const [key,times] of reports)if(!times.some(at=>at>now-WINDOW_MS))reports.delete(key);const recent=(reports.get(tokenId)||[]).filter(at=>at>now-WINDOW_MS);if(recent.length>=LIMIT){reports.set(tokenId,recent);return false;}recent.push(now);reports.set(tokenId,recent);return true;}
export function resetInstagramThreadRateLimits():void{reports.clear();}

/** The stored thread of `username` for the Hospeda account, or null. */
export async function instagramThreadFor(e:Executor,{viewer,username}:{viewer:string|null;username:string|null}):Promise<string|null>{
 return (await instagramThreadRow(e,{viewer,username}))?.threadId??null;
}
/** The stored thread and display name of `username` for the Hospeda account, or null. */
export async function instagramThreadRow(e:Executor,{viewer,username}:{viewer:string|null;username:string|null}):Promise<{threadId:string;displayName:string|null}|null>{
 if(!viewer||!username)return null;
 return (await sql<{threadId:string;displayName:string|null}>`SELECT thread_id AS "threadId",display_name AS "displayName" FROM crm_instagram_threads WHERE viewer_username=${viewer} AND username=${username}`.execute(e)).rows[0]??null;
}
/**
 * Upserts the thread of `username` for the Hospeda account, keeping who proved it and when. A seller confirmation never replaces a header proof
 * (M4). Display name (§15): a header proof sets it when it reads one (a different name replaces the stored one); a seller proof only fills an
 * empty name of the same thread. A new thread id never inherits the old thread's name.
 */
export async function saveInstagramThread(e:Executor,{viewer,username,threadId,proof,userId,displayName=null}:{viewer:string;username:string;threadId:string;proof:InstagramThreadProof;userId:number;displayName?:string|null}):Promise<void>{
 // Review M2: should the CHECK still refuse a name the schema accepted, the thread is stored without it (never a 500 over a name). Not for a
 // transaction: a failed statement aborts it, so callers inside one pass a schema-cleaned name only.
 try{await upsertInstagramThread(e,{viewer,username,threadId,proof,userId,displayName});}
 catch(error){if(displayName===null||(error as {code?:unknown}).code!=='23514')throw error;await upsertInstagramThread(e,{viewer,username,threadId,proof,userId,displayName:null});}
}
async function upsertInstagramThread(e:Executor,{viewer,username,threadId,proof,userId,displayName}:{viewer:string;username:string;threadId:string;proof:InstagramThreadProof;userId:number;displayName:string|null}):Promise<void>{
 await sql`INSERT INTO crm_instagram_threads AS t(viewer_username,username,thread_id,proof,verified_at,verified_by_user_id,display_name) VALUES(${viewer},${username},${threadId},${proof},now(),${userId},${displayName}) ON CONFLICT (viewer_username,username) DO UPDATE SET
  thread_id=CASE WHEN t.proof='seller' OR excluded.proof='header' THEN excluded.thread_id ELSE t.thread_id END,
  proof=CASE WHEN t.proof='seller' OR excluded.proof='header' THEN excluded.proof ELSE t.proof END,
  verified_at=CASE WHEN t.proof='seller' OR excluded.proof='header' THEN now() ELSE t.verified_at END,
  verified_by_user_id=CASE WHEN t.proof='seller' OR excluded.proof='header' THEN excluded.verified_by_user_id ELSE t.verified_by_user_id END,
  display_name=CASE
   WHEN excluded.proof='header' THEN COALESCE(excluded.display_name,CASE WHEN t.thread_id=excluded.thread_id THEN t.display_name END)
   WHEN t.proof='seller' AND t.thread_id<>excluded.thread_id THEN excluded.display_name
   WHEN t.thread_id=excluded.thread_id THEN COALESCE(t.display_name,excluded.display_name)
   ELSE t.display_name END`.execute(e);
}
/** D2: deletes the row only while it still holds `threadId` (compare-and-delete), so a newer proof is never lost. */
export async function deleteStaleInstagramThread(e:Executor,{viewer,username,threadId}:{viewer:string;username:string;threadId:string}):Promise<boolean>{
 return (await sql`DELETE FROM crm_instagram_threads WHERE viewer_username=${viewer} AND username=${username} AND thread_id=${threadId} RETURNING username`.execute(e)).rows.length>0;
}

type AccountRow={id:string;nombre:string;ciudad:string|null;status:string|null;assignedUserEmail:string|null;doNotContact:boolean;archivedAt:Date|null;ownerName:string|null;perfilInstagram:string|null};
/** Every business outside the trash and not merged whose `perfil_instagram` normalizes to `username` (the webhook's rule), unfiltered by access. */
export async function businessesWithInstagram(e:Executor,{username}:{username:string}):Promise<AccountRow[]>{
 const rows=(await sql<AccountRow>`SELECT a.id::text AS id,a.nombre,a.ciudad,a.status,a.assigned_user_email AS "assignedUserEmail",a.do_not_contact AS "doNotContact",a.archived_at AS "archivedAt",u.display_name AS "ownerName",a.perfil_instagram AS "perfilInstagram" FROM crm_accounts a LEFT JOIN users u ON u.email=a.assigned_user_email WHERE a.deleted_at IS NULL AND a.merged_into_id IS NULL AND a.perfil_instagram ~* ${instagramProfilePattern(username)} ORDER BY a.nombre`.execute(e)).rows;
 // M2: no LIMIT before the exact rule. The SQL pattern already keeps only values naming `username` as a whole handle or path segment.
 return rows.filter(row=>normalizeInstagramUsername(row.perfilInstagram)===username).slice(0,10);
}
export {instagramProfilePattern} from './instagramChat';

/**
 * Spec 96 rule for «can contact» (§5.2): the business is modifiable by the user, or the user can modify one of its open managements. «No contactar»
 * is ignored on purpose when `ignoreDoNotContact` (a thread report is not contact); the contact paths keep their own server checks.
 */
export async function canContactBusiness(e:Executor,{account,user,ignoreDoNotContact=false}:{account:Pick<AccountRow,'id'|'assignedUserEmail'|'archivedAt'|'doNotContact'>;user:Actor;ignoreDoNotContact?:boolean}):Promise<boolean>{
 const access={assignedUserEmail:account.assignedUserEmail,archivedAt:account.archivedAt,doNotContact:ignoreDoNotContact?false:account.doNotContact};
 if(canModifyBusiness(user,access))return true;
 const leads=(await sql<{assignedUserEmail:string|null}>`SELECT l.assigned_user_email AS "assignedUserEmail" FROM leads l JOIN crm_stages s ON s.name=l.estado WHERE l.account_id=${account.id}::bigint AND l.deleted_at IS NULL AND s.classification='open'`.execute(e)).rows;
 return leads.some(lead=>canModifyManagement(user,lead,access));
}

/** Whether the user can see at least one business with that Instagram and contact it (thread report permission, §5.2). */
export async function canReportInstagramThread(e:Executor,{username,user}:{username:string;user:Actor}):Promise<boolean>{
 for(const account of await businessesWithInstagram(e,{username})){
  try{await assertBusinessAccess(e,account.id,user,false,false);}catch{continue;}
  if(await canContactBusiness(e,{account,user,ignoreDoNotContact:true}))return true;
 }
 return false;
}

/** A business as the Instagram panel shows it: the WhatsApp `Match` shape (without WhatsApp-only fields) plus `canContact`. */
export type InstagramMatch={accountId:string;code:string;name:string;city:string|null;status:string|null;statusLabel:string|null;assignedUserName:string|null;doNotContact:boolean;restrictionActive:boolean;archived:boolean;canContact:boolean;leads:{id:string;name:string;stage:string}[];url:string};

/** `context?instagram=`: visible businesses become matches, the rest only count in `hiddenMatches` (never says which). */
export async function instagramContextMatches(e:Executor,{username,user,origin}:{username:string;user:Actor;origin:string}):Promise<{matches:InstagramMatch[];hiddenMatches:number}>{
 const matches:InstagramMatch[]=[];let hiddenMatches=0;
 for(const a of await businessesWithInstagram(e,{username})){
  try{await assertBusinessAccess(e,a.id,user,false,false);}catch{hiddenMatches++;continue;}
  const leads=(await sql<{id:string;name:string;stage:string}>`SELECT l.id::text AS id,l.nombre AS name,l.estado AS stage FROM leads l JOIN crm_stages s ON s.name=l.estado WHERE l.account_id=${a.id}::bigint AND l.deleted_at IS NULL AND s.classification='open' ORDER BY l.id LIMIT 10`.execute(e)).rows;
  const restriction=await sql`SELECT 1 FROM crm_contact_restrictions WHERE account_id=${a.id}::bigint AND lifted_at IS NULL AND channel IN ('social','all') AND contact_id IS NULL AND lead_id IS NULL LIMIT 1`.execute(e);
  matches.push({accountId:a.id,code:'H'+a.id,name:a.nombre,city:a.ciudad,status:a.status,statusLabel:a.status?businessStatusLabels[a.status as BusinessStatus]??null:null,assignedUserName:a.ownerName,doNotContact:a.doNotContact,restrictionActive:!!restriction.rows.length,archived:!!a.archivedAt,canContact:await canContactBusiness(e,{account:a,user}),leads,url:`${origin}/accounts/${a.id}`});
 }
 return {matches,hiddenMatches};
}
