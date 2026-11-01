import {sql,type Kysely} from 'kysely';import {randomUUID} from 'node:crypto';import {z} from 'zod';
import type {DB} from './schema';import type {User} from './User';import {setWorkActor} from './workAudit';
import {CommunicationConflict,CommunicationForbidden,assertAccountContactAllowed,communicationContext,lockCommunication,messageFor,type Executor} from './communicationService';
import {SALES_MATERIAL_MAX_COVER_BYTES,contentDisposition,externalUrlError,salesMaterialFormat,type SalesMaterialFormat} from './salesMaterialTypes';
import {generateShortShareToken,hashShareToken,normalizeShareSlug,parseShareSegment,shareSlug,shareTokenMatches,shortSharePath} from './salesMaterialShare';
import {SalesMaterialNotFound,readUrlSeconds} from './salesMaterialService';
import type {R2Storage} from './r2';
import {contactChannelOf,materialChannelOf,type MaterialChannel} from './salesMaterialMessage';
/** Input of {@link createSalesMaterialShare}. `messageId` ties the share to a draft (spec 89 §8, phase F3). */
export const salesMaterialShareInput=z.object({
 materialId:z.string().uuid(),accountId:z.string().regex(/^[1-9]\d*$/),leadId:z.string().regex(/^[1-9]\d*$/).nullable(),
 contactId:z.string().regex(/^[1-9]\d*$/).nullable(),channel:z.enum(['email','whatsapp','instagram']),messageId:z.string().uuid().nullable().default(null)
});
export type SalesMaterialShareInput=z.input<typeof salesMaterialShareInput>;
/** A created share. `token` (4 characters, spec 101) is shown once inside `path` (`/m/<slug>-<token>`, it goes into the message body) and never stored in clear. */
export type CreatedSalesMaterialShare={id:string;token:string;path:string;preparedVersion:number};
/** Attempts to find a free short token before giving up (a collision needs the same 4 characters as a live link: rare, but certain over time). */
export const SHARE_TOKEN_ATTEMPTS=8;
/**
 * Creates one share (one token per recipient and message, spec 89 D6) with the same checks as `prepare` (§10): write access to the management
 * or the business, `assertAccountContactAllowed` for the channel and person (trash, archived, No contactar, restrictions, closed management),
 * and a deliverable, active material with a current version. Runs under the communication lock, so a concurrent No contactar waits for it.
 * Phase F2 exposes no endpoint for it: tests use it, and F3 calls it from `material_add`.
 */
export async function createSalesMaterialShare(db:Kysely<DB>,{input:raw,user}:{input:SalesMaterialShareInput;user:User}):Promise<CreatedSalesMaterialShare>{
 const input=salesMaterialShareInput.parse(raw);
 return db.transaction().execute(async e=>{
  await setWorkActor(e,user);
  await lockCommunication(e,async()=>({accountIds:[input.accountId]}));
  const {account,lead}=await communicationContext(e,input.accountId,input.leadId,user,true);
  if(input.contactId){
   const contact=await e.selectFrom('crmContacts').select(['id']).where('id','=',input.contactId).where('accountId','=',account.id).where('deletedAt','is',null).executeTakeFirst();
   if(!contact)throw new CommunicationConflict('La persona no pertenece a este negocio.');
  }
  // Spec 98 §5.2: an Instagram share is checked against the restrictions of `social`, the channel its message is stored with.
  await assertAccountContactAllowed(e,String(account.id),lead?String(lead.id):null,input.contactId,contactChannelOf(input.channel));
  if(input.messageId){
   const m=await messageFor(e,input.messageId,user,true);
   if(String(m.accountId)!==String(account.id)||materialChannelOf(m)!==input.channel)throw new CommunicationConflict('El mensaje no corresponde a este negocio o canal.');
   if(input.leadId&&(m.leadId==null||String(m.leadId)!==input.leadId))throw new CommunicationConflict('El mensaje no corresponde a esta gestión.');
   if(input.contactId&&(m.contactId==null||String(m.contactId)!==input.contactId))throw new CommunicationConflict('El mensaje no corresponde a esta persona.');
   if(m.status!=='draft')throw new CommunicationConflict('El mensaje ya no es un borrador.');
  }
  return insertSalesMaterialShare(e,{materialId:input.materialId,accountId:String(account.id),leadId:lead?String(lead.id):null,contactId:input.contactId,channel:input.channel,messageId:input.messageId,user});
 });
}
/**
 * Inserts one share after checking only the MATERIAL (deliverable, active, with a current version; locked FOR SHARE so an archive waits).
 * Callers run it inside their transaction, under the communication lock, after their own business, person and No contactar checks.
 * Spec 101 D1/D2: the link is `/m/<slug>-<4 characters>`; the slug comes from the title now and is stored with the link, so renaming the
 * material later never breaks it. A token already taken (unique `token_hash`) is skipped with `ON CONFLICT DO NOTHING`, which does not abort
 * the caller's transaction, and a new one is drawn, up to {@link SHARE_TOKEN_ATTEMPTS} times. `generate` is injectable for tests.
 */
export async function insertSalesMaterialShare(e:Executor,{materialId,accountId,leadId,contactId,channel,messageId,user,generate=generateShortShareToken}:{materialId:string;accountId:string;leadId:string|null;contactId:string|null;channel:MaterialChannel;messageId:string|null;user:User;generate?:()=>{token:string;tokenHash:string}}):Promise<CreatedSalesMaterialShare&{title:string}>{
 const material=(await sql<{kind:string;status:string;currentVersion:number|null;title:string}>`SELECT kind,status,current_version,title FROM crm_sales_materials WHERE id=${materialId}::uuid FOR SHARE`.execute(e)).rows[0];
 if(!material)throw new SalesMaterialNotFound('El material no existe.');
 if(material.kind!=='deliverable')throw new CommunicationForbidden(`«${material.title}» es material interno: no se manda a clientes.`);
 if(material.status!=='active'||material.currentVersion==null)throw new CommunicationConflict(`«${material.title}» ya no está disponible.`);
 const id=randomUUID(),slug=shareSlug({title:material.title});
 for(let attempt=0;attempt<SHARE_TOKEN_ATTEMPTS;attempt++){
  const {token,tokenHash}=generate();
  const inserted=await sql`INSERT INTO crm_sales_material_shares(id,token_hash,public_slug,material_id,account_id,original_account_id,lead_id,contact_id,message_id,channel,prepared_version,created_by_email)
   VALUES(${id}::uuid,${tokenHash},${slug},${materialId}::uuid,${accountId},${accountId},${leadId},${contactId}::bigint,${messageId}::uuid,${channel},${material.currentVersion},${user.email})
   ON CONFLICT (token_hash) DO NOTHING RETURNING id`.execute(e);
  if(inserted.rows.length)return {id,token,path:shortSharePath({slug,token}),preparedVersion:material.currentVersion,title:material.title};
 }
 throw new CommunicationConflict('No se pudo generar el enlace del material. Probá de nuevo.');
}
/** What the public page may show of an available share. Never the business, the seller or any internal field (spec 89 §7). */
export type PublicSharedMaterial={
 shareId:string;title:string;description:string;format:SalesMaterialFormat;
 /** Canonical public path of the link (`/m/<slug>-<token>`, or `/m/<token>` for a legacy link): sub-routes and og:url are built from it, never from the presented URL. */
 path:string;
 /** Spec 101 D3/D4: the admin chose «Abrir directo» for the material (read now, so it also applies to links already sent). */
 openDirect:boolean;
 /** External https URL (source `url`), or null for files. */
 externalUrl:string|null;fileName:string|null;mimeType:string|null;byteSize:number|null;objectKey:string|null;
 /** Cover object (admin cover, or the image itself when it is at most 1 MB); null when there is none. */
 cover:{key:string;mime:string}|null;
};
/** Resolution of a token: `unknown` (malformed or not found, identical for both), `revoked`, `unavailable` (archived, internal or without version) or `available`. */
export type PublicShareState={state:'unknown'}|{state:'revoked'}|{state:'unavailable'}|{state:'available';material:PublicSharedMaterial};
type ShareRow={shareId:string;tokenHash:string;publicSlug:string|null;openDirect:boolean;revokedAt:Date|null;kind:string;status:string;currentVersion:number|null;title:string;description:string;coverKey:string|null;coverMime:string|null;url:string|null;objectKey:string|null;fileName:string|null;mimeType:string|null;byteSize:string|number|null;version:number|null};
/**
 * Resolves the `/m/<segment>` of a public link (`token` is the whole segment) to the CURRENT version of its material (spec 89 D6).
 * - Short links (spec 101): `<slug>-<4 characters>`. The token is looked up by its sha256 and the presented slug must equal the slug stored
 *   with the link, ignoring case and accents (D2). A wrong or missing slug is `unknown`, exactly like a token that does not exist (no oracle).
 * - Legacy links (sent before spec 101): the 43-character token alone, accepted forever; they have no stored slug and never take one.
 * - A 43-character segment may read both ways: both hashes go in one query and it is a single lookup.
 * Then a constant-time comparison. A material that became internal is never served, even with a valid token (defence in depth).
 */
export async function resolvePublicShare(db:Kysely<DB>,{token:segment}:{token:string}):Promise<PublicShareState>{
 const {legacy,short}=parseShareSegment({segment});
 const candidates=[...(legacy?[{token:legacy,slug:null}]:[]),...(short?[{token:short.token,slug:normalizeShareSlug({slug:short.slug})}]:[])];
 if(!candidates.length)return {state:'unknown'};
 const rows=(await sql<ShareRow>`SELECT s.id AS share_id,s.token_hash,s.public_slug,s.revoked_at,m.kind,m.status,m.current_version,m.title,m.description,m.cover_key,m.cover_mime,m.open_direct,v.url,v.object_key,v.file_name,v.mime_type,v.byte_size,v.version
  FROM crm_sales_material_shares s JOIN crm_sales_materials m ON m.id=s.material_id LEFT JOIN crm_sales_material_versions v ON v.material_id=m.id AND v.version=m.current_version
  WHERE s.token_hash=ANY(${candidates.map(c=>hashShareToken({token:c.token}))}::text[])`.execute(db)).rows;
 let r:ShareRow|undefined,path='';
 for(const c of candidates){
  const found=rows.find(row=>shareTokenMatches({token:c.token,tokenHash:row.tokenHash})&&(c.slug===null?row.publicSlug==null:row.publicSlug!=null&&row.publicSlug===c.slug));
  if(found){r=found;path=found.publicSlug==null?'/m/'+c.token:shortSharePath({slug:found.publicSlug,token:c.token});break;}
 }
 if(!r)return {state:'unknown'};
 if(r.revokedAt)return {state:'revoked'};
 if(r.kind!=='deliverable'||r.status!=='active'||r.currentVersion==null||r.version==null||(!r.url&&!r.objectKey))return {state:'unavailable'};
 const byteSize=r.byteSize==null?null:Number(r.byteSize);
 const cover=r.coverKey&&r.coverMime?{key:r.coverKey,mime:r.coverMime}:r.objectKey&&r.mimeType?.startsWith('image/')&&byteSize!=null&&byteSize<=SALES_MATERIAL_MAX_COVER_BYTES?{key:r.objectKey,mime:r.mimeType}:null;
 return {state:'available',material:{shareId:r.shareId,path,openDirect:r.openDirect===true,title:r.title,description:r.description,format:salesMaterialFormat({mimeType:r.url?null:r.mimeType}),externalUrl:r.url,fileName:r.fileName,mimeType:r.mimeType,byteSize,objectKey:r.objectKey,cover}};
}
/** Minimum time between two counted technical accesses of one share (spec 89 §7). */
export const TECHNICAL_ACCESS_INTERVAL_MINUTES=10;
/**
 * Technical access record (owner decision §17): bumps `technical_access_count` and `last_technical_access_at` at most once every 10 minutes per share.
 * Callers exclude bots and HEAD. It never touches stages, tasks, responses or message states, and it is never «el cliente lo vio».
 */
export async function recordTechnicalAccess(db:Kysely<DB>,{shareId}:{shareId:string}):Promise<boolean>{
 const r=await sql`UPDATE crm_sales_material_shares SET technical_access_count=technical_access_count+1,last_technical_access_at=now()
  WHERE id=${shareId}::uuid AND revoked_at IS NULL AND (last_technical_access_at IS NULL OR last_technical_access_at<=now()-make_interval(mins=>${TECHNICAL_ACCESS_INTERVAL_MINUTES}::int)) RETURNING id`.execute(db);
 return r.rows.length>0;
}
/**
 * Presigned GET of the shared file: 5 minutes, or 6 hours for audio and video (see {@link readUrlSeconds}). Null for external URLs: the file
 * routes never redirect to them. The only redirect to a third party is «Abrir directo» on the link itself ({@link publicShareDirectLocation}).
 */
export async function publicShareFileLocation({material,disposition,storage}:{material:PublicSharedMaterial;disposition:'inline'|'attachment';storage:R2Storage}):Promise<string|null>{
 if(!material.objectKey)return null;
 return storage.presignGet({key:material.objectKey,expiresIn:readUrlSeconds({mimeType:material.mimeType}),disposition:contentDisposition({disposition,fileName:material.fileName}),contentType:material.mimeType??undefined});
}
/** Cover bytes (at most 1 MB) read through our server, so preview crawlers never follow an expiring R2 URL (§7). Null when there is none. */
export async function publicShareCover({material,storage}:{material:PublicSharedMaterial;storage:R2Storage}):Promise<{body:Uint8Array<ArrayBuffer>;contentType:string}|null>{
 if(!material.cover)return null;
 const object=await storage.read({key:material.cover.key,maxBytes:SALES_MATERIAL_MAX_COVER_BYTES});
 return object?{body:object.body,contentType:material.cover.mime}:null;
}
/**
 * Spec 101 D4 (owner, 31/10/2026; changes the spec 89 rule of never redirecting to third parties): where «Abrir directo» sends a person.
 * A file gets a fresh inline presigned GET; an external link its admin-set destination, only when it is still https without credentials
 * (re-checked here although it is validated on save). Null when the material is not set to open directly or the destination is not acceptable:
 * the caller then shows the page as usual. Callers only get here with a valid token and slug (an `available` share).
 */
export async function publicShareDirectLocation({material,storage}:{material:PublicSharedMaterial;storage:()=>R2Storage}):Promise<string|null>{
 if(!material.openDirect)return null;
 if(material.externalUrl)return externalUrlError({url:material.externalUrl})?null:new URL(material.externalUrl).href;
 return publicShareFileLocation({material,disposition:'inline',storage:storage()});
}
