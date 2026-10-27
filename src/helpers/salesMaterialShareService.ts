import {sql,type Kysely} from 'kysely';import {randomUUID} from 'node:crypto';import {z} from 'zod';
import type {DB} from './schema';import type {User} from './User';import {setWorkActor} from './workAudit';
import {CommunicationConflict,CommunicationForbidden,assertAccountContactAllowed,communicationContext,lockCommunication,messageFor} from './communicationService';
import {SALES_MATERIAL_MAX_COVER_BYTES,contentDisposition,salesMaterialFormat,type SalesMaterialFormat} from './salesMaterialTypes';
import {generateShareToken,hashShareToken,isShareTokenFormat,shareTokenMatches} from './salesMaterialShare';
import {SalesMaterialNotFound,READ_URL_SECONDS} from './salesMaterialService';
import type {R2Storage} from './r2';
/** Input of {@link createSalesMaterialShare}. `messageId` ties the share to a draft (spec 89 §8, phase F3). */
export const salesMaterialShareInput=z.object({
 materialId:z.string().uuid(),accountId:z.string().regex(/^[1-9]\d*$/),leadId:z.string().regex(/^[1-9]\d*$/).nullable(),
 contactId:z.string().regex(/^[1-9]\d*$/).nullable(),channel:z.enum(['email','whatsapp']),messageId:z.string().uuid().nullable().default(null)
});
export type SalesMaterialShareInput=z.input<typeof salesMaterialShareInput>;
/** A created share. `token` is shown once (it goes into the message body) and never stored in clear. */
export type CreatedSalesMaterialShare={id:string;token:string;path:string;preparedVersion:number};
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
   if(!contact)throw new Error('La persona no pertenece a este negocio.');
  }
  await assertAccountContactAllowed(e,String(account.id),lead?String(lead.id):null,input.contactId,input.channel);
  if(input.messageId){
   const m=await messageFor(e,input.messageId,user,true);
   if(String(m.accountId)!==String(account.id)||m.channel!==input.channel)throw new CommunicationConflict('El mensaje no corresponde a este negocio o canal.');
   if(m.status!=='draft')throw new CommunicationConflict('El mensaje ya no es un borrador.');
  }
  const material=(await sql<{kind:string;status:string;currentVersion:number|null;title:string}>`SELECT kind,status,current_version,title FROM crm_sales_materials WHERE id=${input.materialId}::uuid FOR SHARE`.execute(e)).rows[0];
  if(!material)throw new SalesMaterialNotFound('El material no existe.');
  if(material.kind!=='deliverable')throw new CommunicationForbidden(`«${material.title}» es material interno: no se manda a clientes.`);
  if(material.status!=='active'||material.currentVersion==null)throw new CommunicationConflict(`«${material.title}» ya no está disponible.`);
  const id=randomUUID(),{token,tokenHash}=generateShareToken();
  await sql`INSERT INTO crm_sales_material_shares(id,token_hash,material_id,account_id,original_account_id,lead_id,contact_id,message_id,channel,prepared_version,created_by_email)
   VALUES(${id}::uuid,${tokenHash},${input.materialId}::uuid,${account.id},${account.id},${lead?lead.id:null},${input.contactId}::bigint,${input.messageId}::uuid,${input.channel},${material.currentVersion},${user.email})`.execute(e);
  return {id,token,path:'/m/'+token,preparedVersion:material.currentVersion};
 });
}
/** What the public page may show of an available share. Never the business, the seller or any internal field (spec 89 §7). */
export type PublicSharedMaterial={
 shareId:string;title:string;description:string;format:SalesMaterialFormat;
 /** External https URL (source `url`), or null for files. */
 externalUrl:string|null;fileName:string|null;mimeType:string|null;byteSize:number|null;objectKey:string|null;
 /** Cover object (admin cover, or the image itself when it is at most 1 MB); null when there is none. */
 cover:{key:string;mime:string}|null;
};
/** Resolution of a token: `unknown` (malformed or not found, identical for both), `revoked`, `unavailable` (archived, internal or without version) or `available`. */
export type PublicShareState={state:'unknown'}|{state:'revoked'}|{state:'unavailable'}|{state:'available';material:PublicSharedMaterial};
type ShareRow={shareId:string;tokenHash:string;revokedAt:Date|null;kind:string;status:string;currentVersion:number|null;title:string;description:string;coverKey:string|null;coverMime:string|null;url:string|null;objectKey:string|null;fileName:string|null;mimeType:string|null;byteSize:string|number|null;version:number|null};
/**
 * Resolves a public token to the CURRENT version of its material (D6). The lookup is by sha256 hash (unique index), followed by a
 * constant-time comparison. A material that became internal is never served, even with a valid token (defence in depth).
 */
export async function resolvePublicShare(db:Kysely<DB>,{token}:{token:string}):Promise<PublicShareState>{
 if(!isShareTokenFormat({token}))return {state:'unknown'};
 const r=(await sql<ShareRow>`SELECT s.id AS share_id,s.token_hash,s.revoked_at,m.kind,m.status,m.current_version,m.title,m.description,m.cover_key,m.cover_mime,v.url,v.object_key,v.file_name,v.mime_type,v.byte_size,v.version
  FROM crm_sales_material_shares s JOIN crm_sales_materials m ON m.id=s.material_id LEFT JOIN crm_sales_material_versions v ON v.material_id=m.id AND v.version=m.current_version
  WHERE s.token_hash=${hashShareToken({token})}`.execute(db)).rows[0];
 if(!r||!shareTokenMatches({token,tokenHash:r.tokenHash}))return {state:'unknown'};
 if(r.revokedAt)return {state:'revoked'};
 if(r.kind!=='deliverable'||r.status!=='active'||r.currentVersion==null||r.version==null||(!r.url&&!r.objectKey))return {state:'unavailable'};
 const byteSize=r.byteSize==null?null:Number(r.byteSize);
 const cover=r.coverKey&&r.coverMime?{key:r.coverKey,mime:r.coverMime}:r.objectKey&&r.mimeType?.startsWith('image/')&&byteSize!=null&&byteSize<=SALES_MATERIAL_MAX_COVER_BYTES?{key:r.objectKey,mime:r.mimeType}:null;
 return {state:'available',material:{shareId:r.shareId,title:r.title,description:r.description,format:salesMaterialFormat({mimeType:r.url?null:r.mimeType}),externalUrl:r.url,fileName:r.fileName,mimeType:r.mimeType,byteSize,objectKey:r.objectKey,cover}};
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
/** Short-lived presigned GET of the shared file (5 minutes). Null for external URLs: the public page never redirects to them (no open redirect). */
export async function publicShareFileLocation({material,disposition,storage}:{material:PublicSharedMaterial;disposition:'inline'|'attachment';storage:R2Storage}):Promise<string|null>{
 if(!material.objectKey)return null;
 return storage.presignGet({key:material.objectKey,expiresIn:READ_URL_SECONDS,disposition:contentDisposition({disposition,fileName:material.fileName}),contentType:material.mimeType??undefined});
}
/** Cover bytes (at most 1 MB) read through our server, so preview crawlers never follow an expiring R2 URL (§7). Null when there is none. */
export async function publicShareCover({material,storage}:{material:PublicSharedMaterial;storage:R2Storage}):Promise<{body:Uint8Array<ArrayBuffer>;contentType:string}|null>{
 if(!material.cover)return null;
 const object=await storage.read({key:material.cover.key,maxBytes:SALES_MATERIAL_MAX_COVER_BYTES});
 return object?{body:object.body,contentType:material.cover.mime}:null;
}
