import {sql,type Kysely,type Transaction} from 'kysely';import {randomUUID} from 'node:crypto';import {z} from 'zod';
import type {DB} from './schema';import type {User} from './User';import {setWorkActor} from './workAudit';
import {CrmForbidden} from './crmPermissions';import {CommunicationConflict} from './communicationService';
import {searchSql} from './searchSql';import {r2Configured,r2Storage,R2Unavailable,type R2Storage} from './r2';
import {SALES_MATERIAL_MAX_COVER_BYTES,SALES_MATERIAL_MAX_UPLOAD_BYTES,contentDisposition,fileExtension,salesMaterialObjectKey,signatureMatches,uploadDeclarationError} from './salesMaterialTypes';
import type {SalesMaterial,SalesMaterialCategory,SalesMaterialList,SalesMaterialMutation,SalesMaterialUpload,SalesMaterialUploadInput,SalesMaterialVersion} from '../endpoints/salesMaterials.schema';
type E=Kysely<DB>|Transaction<DB>;
/** Presigned PUT lifetime (spec 89 §6.3) and GET lifetime (§6.4), in seconds. */
export const UPLOAD_URL_SECONDS=1800,READ_URL_SECONDS=300,MEDIA_READ_URL_SECONDS=21600;
/** Lifetime of a presigned GET: 5 minutes for documents and images, 6 hours for audio and video so playback, pausing and seeking (new range requests) keep working. */
export const readUrlSeconds=({mimeType}:{mimeType:string|null|undefined}):number=>/^(audio|video)\//i.test(mimeType??'')?MEDIA_READ_URL_SECONDS:READ_URL_SECONDS;
/** Raised when something does not exist (404). */
export class SalesMaterialNotFound extends Error{}
const configSchema=z.object({maxUploadBytes:z.number().int().min(1).max(SALES_MATERIAL_MAX_UPLOAD_BYTES),maxEmailAttachmentBytes:z.number().int().min(1),pendingUploadHours:z.number().int().min(1).max(720)});
export type SalesMaterialConfig=z.infer<typeof configSchema>;
const DEFAULT_CONFIG:SalesMaterialConfig={maxUploadBytes:SALES_MATERIAL_MAX_UPLOAD_BYTES,maxEmailAttachmentBytes:10485760,pendingUploadHours:24};
/** Reads `app_settings.crm_sales_material`; a missing or invalid value falls back to the spec defaults. */
export async function salesMaterialConfig(e:E):Promise<SalesMaterialConfig>{
 const row=await e.selectFrom('appSettings').select('value').where('key','=','crm_sales_material').executeTakeFirst();
 if(!row)return DEFAULT_CONFIG;try{return configSchema.parse(JSON.parse(row.value))}catch{return DEFAULT_CONFIG}
}
/** Only admins create, edit, version, archive and manage categories (spec 89 §10). */
export function assertSalesMaterialAdmin(user:Pick<User,'role'>):void{if(user.role!=='admin')throw new CrmForbidden('Solo un administrador puede administrar el material de venta.');}
type MaterialRow=Omit<SalesMaterial,'hasCover'|'coverSource'|'categories'|'currentVersion'|'versions'>&{currentVersion:number|null;coverKey:string|null;coverMime:string|null;coverBytes:number|null;coverMode:'manual'|'auto'|'none'};
type VersionRow=SalesMaterialVersion&{materialId:string;objectKey:string|null};
type UploadRow={id:string;objectKey:string;purpose:'file'|'cover';materialId:string|null;declaredMime:string;declaredBytes:string|number;fileName:string;actorEmail:string;status:'pending'|'deleting'|'completed'|'discarded';expiresAt:Date};
const publicVersion=({objectKey:_key,materialId:_material,...v}:VersionRow):SalesMaterialVersion=>({...v,byteSize:v.byteSize==null?null:Number(v.byteSize)});
/** Most materials one listing returns; beyond it the list says `truncated` and the UI asks for a narrower search. */
export const LIST_LIMIT=500;
/** Lists materials (`categoryIds`: any of them). Sellers see active ones (both kinds) with the current version only; `includeArchived` and older versions are admin-only. */
export async function listSalesMaterials(db:Kysely<DB>,{user,query}:{user:User;query:{search:string;categoryId?:string;categoryIds?:readonly string[];kind?:'deliverable'|'internal';includeArchived:'0'|'1';status?:'archived'}}):Promise<SalesMaterialList>{
 const admin=user.role==='admin';
 const categoryIds=[...new Set([...(query.categoryIds??[]),...(query.categoryId?[query.categoryId]:[])])];
 if((query.includeArchived==='1'||query.status==='archived')&&!admin)throw new CrmForbidden('Solo un administrador ve el material archivado.');
 const found=(await sql<MaterialRow>`SELECT m.* FROM crm_sales_materials m WHERE (${query.status==='archived'} AND m.status='archived' OR ${query.status!=='archived'} AND (${query.includeArchived==='1'} OR m.status='active'))
  AND (${query.kind??null}::text IS NULL OR m.kind=${query.kind??null})
  AND (${categoryIds.length===0} OR EXISTS(SELECT 1 FROM crm_sales_material_category_links l WHERE l.material_id=m.id AND l.category_id=ANY(${categoryIds}::bigint[])))
  AND (${searchSql('m.title',query.search)} OR ${searchSql('m.description',query.search)})
  ORDER BY m.status,m.updated_at DESC,m.id LIMIT ${LIST_LIMIT+1}`.execute(db)).rows;
 const truncated=found.length>LIST_LIMIT,rows=found.slice(0,LIST_LIMIT);
 const ids=rows.map(r=>r.id);
 const [links,versions,categories,config]=await Promise.all([
  ids.length?sql<{materialId:string;id:string;name:string;active:boolean}>`SELECT l.material_id,c.id,c.name,c.active FROM crm_sales_material_category_links l JOIN crm_sales_material_categories c ON c.id=l.category_id WHERE l.material_id=ANY(${ids}::uuid[]) ORDER BY lower(c.name)`.execute(db):Promise.resolve({rows:[]}),
  ids.length?sql<VersionRow>`SELECT v.id,v.material_id,v.version,v.url,v.object_key,v.file_name,v.mime_type,v.byte_size,v.actor_email,v.created_at FROM crm_sales_material_versions v JOIN crm_sales_materials m ON m.id=v.material_id WHERE v.material_id=ANY(${ids}::uuid[]) AND (${admin} OR v.version=m.current_version) ORDER BY v.version DESC`.execute(db):Promise.resolve({rows:[]}),
  sql<SalesMaterialCategory>`SELECT id,name,active FROM crm_sales_material_categories WHERE ${admin} OR active ORDER BY lower(name)`.execute(db),
  salesMaterialConfig(db)
 ]);
 const materials=rows.map(({coverKey,coverMime:_mime,coverBytes:_bytes,coverMode,currentVersion,...m}):SalesMaterial=>{
  const own=versions.rows.filter(v=>v.materialId===m.id).map(publicVersion);
  const current=own.find(v=>v.version===currentVersion)??null;
  return {...m,hasCover:!!coverKey||!!current&&current.mimeType?.startsWith('image/')===true&&(current.byteSize??Infinity)<=SALES_MATERIAL_MAX_COVER_BYTES,coverSource:coverMode==='none'?'none':coverKey?coverMode:null,categories:links.rows.filter(l=>l.materialId===m.id).map(({materialId:_id,...c})=>c),currentVersion:current,...(admin?{versions:own}:{})};
 });
 return {materials,truncated,categories:categories.rows,limits:{maxUploadBytes:config.maxUploadBytes,maxCoverBytes:SALES_MATERIAL_MAX_COVER_BYTES,storageConfigured:r2Configured(),maxEmailAttachmentBytes:config.maxEmailAttachmentBytes}};
}
async function materialFor(e:E,id:string,lock=false){
 const m=(await (lock?sql<MaterialRow>`SELECT * FROM crm_sales_materials WHERE id=${id}::uuid FOR UPDATE`:sql<MaterialRow>`SELECT * FROM crm_sales_materials WHERE id=${id}::uuid`).execute(e)).rows[0];
 if(!m)throw new SalesMaterialNotFound('El material no existe.');return m;
}
const assertRevision=(m:MaterialRow,revision:number)=>{if(m.revision!==revision)throw new CommunicationConflict('La versión cambió. Actualizá antes de continuar.');};
/** Issues a presigned PUT for a new file or cover and records the pending upload (spec 89 §6.3). Admin only. */
export async function createSalesMaterialUpload(db:Kysely<DB>,{input,user,storage}:{input:SalesMaterialUploadInput;user:User;storage?:R2Storage}):Promise<SalesMaterialUpload>{
 assertSalesMaterialAdmin(user);
 const config=await salesMaterialConfig(db);
 const error=uploadDeclarationError({...input,maxUploadBytes:config.maxUploadBytes});if(error)throw new Error(error);
 const existing=(await sql<MaterialRow>`SELECT * FROM crm_sales_materials WHERE id=${input.materialId}::uuid`.execute(db)).rows[0];
 if(existing&&input.purpose==='file'&&existing.source!=='file')throw new Error('Este material es un enlace externo: no admite archivos.');
 if(existing?.status==='archived')throw new Error('Restaurá el material antes de cambiar sus archivos.');
 const uploadId=randomUUID();
 const key=salesMaterialObjectKey({purpose:input.purpose,materialId:input.materialId,version:(existing?.currentVersion??0)+1,uuid:randomUUID(),extension:fileExtension({fileName:input.fileName})});
 const putUrl=await (storage??r2Storage()).presignPut({key,contentType:input.mimeType,byteSize:input.byteSize,expiresIn:UPLOAD_URL_SECONDS});
 const row=(await sql<{expiresAt:Date}>`INSERT INTO crm_sales_material_uploads(id,object_key,purpose,material_id,declared_mime,declared_bytes,file_name,actor_email,expires_at)
  VALUES(${uploadId}::uuid,${key},${input.purpose},${input.materialId}::uuid,${input.mimeType},${input.byteSize},${input.fileName},${user.email},now()+make_interval(hours=>${config.pendingUploadHours}::int)) RETURNING expires_at`.execute(db)).rows[0];
 return {uploadId,putUrl,headers:{'Content-Type':input.mimeType},expiresAt:new Date(Math.min(row.expiresAt.getTime(),Date.now()+UPLOAD_URL_SECONDS*1000))};
}
const normalizeMime=(value:string|null)=>(value??'').split(';')[0].trim().toLowerCase();
/**
 * Checks a pending upload against what R2 stored: owner, purpose, material, expiry, size, Content-Type and the file signature
 * (first 16 bytes). A failed check deletes the object and marks the upload `discarded` (spec 89 §5). Runs outside the write transaction.
 */
export async function verifySalesMaterialUpload(db:Kysely<DB>,{uploadId,purpose,materialId,user,storage}:{uploadId:string;purpose:'file'|'cover';materialId:string;user:User;storage:R2Storage}){
 const u=(await sql<UploadRow>`SELECT * FROM crm_sales_material_uploads WHERE id=${uploadId}::uuid`.execute(db)).rows[0];
 if(!u||u.actorEmail!==user.email)throw new Error('La subida no existe o es de otra persona. Volvé a subir el archivo.');
 if(u.status==='completed')throw new CommunicationConflict('Esa subida ya se usó. Actualizá la página.');
 if(u.status==='discarded'||u.status==='deleting')throw new Error('La subida se descartó. Volvé a subir el archivo.');
 if(u.purpose!==purpose||u.materialId!==materialId)throw new Error('La subida no corresponde a este material.');
 if(new Date(u.expiresAt).getTime()<=Date.now())throw new Error('La subida venció. Volvé a subir el archivo.');
 const config=await salesMaterialConfig(db);const declared=Number(u.declaredBytes);
 const discard=async(message:string):Promise<never>=>{try{await storage.remove({key:u.objectKey})}catch{/* The sweep retries objects it could not delete. */}
  await sql`UPDATE crm_sales_material_uploads SET status='discarded',deleted_at=now() WHERE id=${u.id}::uuid AND status='pending'`.execute(db);throw new Error(message);};
 const head=await storage.head({key:u.objectKey});
 if(!head)return discard('El archivo no llegó al almacenamiento. Volvé a subirlo.');
 const limit=purpose==='cover'?SALES_MATERIAL_MAX_COVER_BYTES:config.maxUploadBytes;
 if(head.size!==declared||head.size>limit)return discard('El tamaño del archivo subido no coincide con el declarado. Volvé a subirlo.');
 if(normalizeMime(head.contentType)!==u.declaredMime)return discard('El tipo del archivo subido no coincide con el declarado. Volvé a subirlo.');
 if(!signatureMatches({mimeType:u.declaredMime,bytes:await storage.readPrefix({key:u.objectKey,bytes:16})}))return discard('El contenido del archivo no corresponde a su tipo. Volvé a subirlo.');
 return {upload:u,size:head.size,etag:head.etag};
}
/** Consumes a pending upload once. The guard `status='pending'` is what keeps the sweep from ever deleting a confirmed object. */
async function completeUpload(e:E,uploadId:string){
 const done=(await sql`UPDATE crm_sales_material_uploads SET status='completed',completed_at=now() WHERE id=${uploadId}::uuid AND status='pending' RETURNING id`.execute(e)).rows[0];
 if(done)return;
 const now=(await sql<{status:string}>`SELECT status FROM crm_sales_material_uploads WHERE id=${uploadId}::uuid`.execute(e)).rows[0];
 if(now?.status==='completed')throw new CommunicationConflict('Esa subida ya se usó. Actualizá la página.');
 throw new Error('La subida venció o se descartó. Volvé a subir el archivo.');
}
type Verified=Awaited<ReturnType<typeof verifySalesMaterialUpload>>;
/**
 * Spec 95: hands the object of an automatic cover that is being dropped or replaced to the abandoned-upload sweep: its completed upload row
 * goes back to `pending` already expired, so the next sweep deletes the object and marks it `discarded`. Runs in the caller's transaction.
 */
async function discardAutoCover(e:E,m:Pick<MaterialRow,'coverKey'|'coverMode'>){
 if(m.coverMode!=='auto'||!m.coverKey)return;
 await sql`UPDATE crm_sales_material_uploads SET status='pending',expires_at=now()-interval '1 second' WHERE object_key=${m.coverKey} AND purpose='cover' AND status='completed'`.execute(e);
}
async function insertVersion(e:E,{materialId,version,source,verified,user}:{materialId:string;version:number;source:{uploadId:string}|{url:string};verified:Verified|null;user:User}){
 if('url' in source){await sql`INSERT INTO crm_sales_material_versions(id,material_id,version,url,actor_email) VALUES(${randomUUID()}::uuid,${materialId}::uuid,${version},${new URL(source.url).href},${user.email})`.execute(e);return;}
 const v=verified!;await completeUpload(e,v.upload.id);
 await sql`INSERT INTO crm_sales_material_versions(id,material_id,version,object_key,file_name,mime_type,byte_size,etag,actor_email) VALUES(${randomUUID()}::uuid,${materialId}::uuid,${version},${v.upload.objectKey},${v.upload.fileName},${v.upload.declaredMime},${v.size},${v.etag},${user.email})`.execute(e);
}
async function assertCategories(e:E,ids:readonly string[],allowedInactive:readonly string[]=[]){
 if(!ids.length)return;
 const found=(await sql<{id:string;active:boolean}>`SELECT id,active FROM crm_sales_material_categories WHERE id=ANY(${[...ids]}::bigint[])`.execute(e)).rows;
 if(found.length!==ids.length)throw new Error('Alguna categoría ya no existe. Actualizá la página.');
 if(found.some(c=>!c.active&&!allowedInactive.includes(String(c.id))))throw new Error('Alguna categoría está desactivada. Elegí otra.');
}
async function replaceCategories(e:E,materialId:string,ids:readonly string[],before:readonly string[]){
 const next=[...ids].sort(),prev=[...before].sort();if(next.join()===prev.join())return;
 await sql`DELETE FROM crm_sales_material_category_links WHERE material_id=${materialId}::uuid`.execute(e);
 if(next.length)await sql`INSERT INTO crm_sales_material_category_links(material_id,category_id) SELECT ${materialId}::uuid,unnest(${next}::bigint[])`.execute(e);
 // The link table has no id column for the audit trigger: journal the whole set once per change.
 await sql`INSERT INTO crm_resource_journal(entity,entity_id,actor_email,action,before_value,after_value) VALUES('crm_sales_material_category_links',${materialId},nullif(current_setting('crm.actor_email',true),''),'UPDATE',${JSON.stringify({categoryIds:prev})}::text::jsonb,${JSON.stringify({categoryIds:next})}::text::jsonb)`.execute(e);
}
const categoryIdsOf=async(e:E,materialId:string)=>(await sql<{categoryId:string}>`SELECT category_id FROM crm_sales_material_category_links WHERE material_id=${materialId}::uuid`.execute(e)).rows.map(r=>String(r.categoryId));
/** Admin mutations (spec 89 §5). Uploads are verified against R2 before the transaction; the transaction re-checks revision and consumes the upload once. */
export async function mutateSalesMaterial(db:Kysely<DB>,{input,user,storage}:{input:SalesMaterialMutation;user:User;storage?:R2Storage}):Promise<{id?:string;ok?:boolean;revision?:number;coverKept?:boolean}>{
 assertSalesMaterialAdmin(user);
 const store=()=>storage??r2Storage();
 if(input.action==='category_create'||input.action==='category_update')return db.transaction().execute(async e=>{
  await setWorkActor(e,user);
  const clash=(await sql`SELECT id FROM crm_sales_material_categories WHERE lower(btrim(name))=lower(btrim(${input.name})) AND (${input.action==='category_update'?input.id:null}::bigint IS NULL OR id<>${input.action==='category_update'?input.id:null}::bigint)`.execute(e)).rows[0];
  if(clash)throw new Error('Ya existe una categoría con ese nombre.');
  if(input.action==='category_create')return {id:String((await sql<{id:string}>`INSERT INTO crm_sales_material_categories(name) VALUES(${input.name}) RETURNING id`.execute(e)).rows[0].id)};
  const row=(await sql`UPDATE crm_sales_material_categories SET name=${input.name},active=${input.active},updated_at=now() WHERE id=${input.id}::bigint RETURNING id`.execute(e)).rows[0];
  if(!row)throw new SalesMaterialNotFound('La categoría no existe.');return {ok:true};
 });
 if(input.action==='create'){
  // A double submit of the same id returns the stored material instead of a duplicate (same idempotency as /_api/resources).
  if((await sql`SELECT id FROM crm_sales_materials WHERE id=${input.id}::uuid`.execute(db)).rows[0])return {id:input.id};
  if((input.source==='file')!==('uploadId' in input.version))throw new Error(input.source==='file'?'Subí el archivo del material.':'Pegá el enlace del material.');
  let verified:Verified|null=null;
  if('uploadId' in input.version)try{verified=await verifySalesMaterialUpload(db,{uploadId:input.version.uploadId,purpose:'file',materialId:input.id,user,storage:store()});}
  catch(error){
   // A concurrent duplicate of this create may have consumed the upload first: answer with the stored material, as the guard above does.
   if(error instanceof CommunicationConflict&&(await sql`SELECT id FROM crm_sales_materials WHERE id=${input.id}::uuid`.execute(db)).rows[0])return {id:input.id};
   throw error;
  }
  return db.transaction().execute(async e=>{
   await setWorkActor(e,user);
   await sql`SELECT pg_advisory_xact_lock(hashtext('crm_sales_materials'),hashtext(${input.id}))`.execute(e);
   if((await sql`SELECT id FROM crm_sales_materials WHERE id=${input.id}::uuid`.execute(e)).rows[0])return {id:input.id};
   await assertCategories(e,input.categoryIds);
   await sql`INSERT INTO crm_sales_materials(id,title,description,kind,source,open_direct,created_by_email) VALUES(${input.id}::uuid,${input.title},${input.description},${input.kind},${input.source},${input.openDirect??false},${user.email})`.execute(e);
   await replaceCategories(e,input.id,input.categoryIds,[]);
   await insertVersion(e,{materialId:input.id,version:1,source:input.version,verified,user});
   await sql`UPDATE crm_sales_materials SET current_version=1 WHERE id=${input.id}::uuid`.execute(e);
   return {id:input.id,revision:1};
  });
 }
 const current=await materialFor(db,input.id);
 let verified:Verified|null=null;
 if(input.action==='version'){
  if(current.status==='archived')throw new Error('Restaurá el material para agregar una versión.');
  if((current.source==='file')!==('uploadId' in input.version))throw new Error(current.source==='file'?'Este material es un archivo: subí un archivo nuevo.':'Este material es un enlace externo: pegá un enlace nuevo.');
  assertRevision(current,input.revision);
  if('uploadId' in input.version)verified=await verifySalesMaterialUpload(db,{uploadId:input.version.uploadId,purpose:'file',materialId:input.id,user,storage:store()});
 }
 if(input.action==='cover'){assertRevision(current,input.revision);if(input.uploadId)verified=await verifySalesMaterialUpload(db,{uploadId:input.uploadId,purpose:'cover',materialId:input.id,user,storage:store()});}
 return db.transaction().execute(async e=>{
  await setWorkActor(e,user);
  const m=await materialFor(e,input.id,true);assertRevision(m,input.revision);
  const next=m.revision+1;
  if(input.action==='update'){
   const before=await categoryIdsOf(e,m.id);await assertCategories(e,input.categoryIds,before);
   await sql`UPDATE crm_sales_materials SET title=${input.title},description=${input.description},kind=${input.kind},open_direct=coalesce(${input.openDirect??null}::boolean,open_direct),revision=${next},updated_at=now() WHERE id=${m.id}::uuid`.execute(e);
   await replaceCategories(e,m.id,input.categoryIds,before);
  }else if(input.action==='version'){
   if(m.status==='archived')throw new Error('Restaurá el material para agregar una versión.');
   const version=(m.currentVersion??0)+1;
   await insertVersion(e,{materialId:m.id,version,source:input.version,verified,user});
   await sql`UPDATE crm_sales_materials SET current_version=${version},revision=${next},updated_at=now() WHERE id=${m.id}::uuid`.execute(e);
   // Spec 95: an automatic cover belongs to the replaced file, so it goes with it (back to «manual without key»: the browser generates a new one).
   // A manual cover and a removal (`none`) stay.
   if(m.coverMode==='auto'){await discardAutoCover(e,m);await sql`UPDATE crm_sales_materials SET cover_key=NULL,cover_mime=NULL,cover_bytes=NULL,cover_mode='manual' WHERE id=${m.id}::uuid`.execute(e);}
  }else if(input.action==='cover'){
   // Spec 95: a manual choice (an uploaded cover or a removal) always wins. An automatic cover arriving after one is not an error: it is
   // kept out (`coverKept`), nothing changes and its upload stays pending, so the sweep deletes it.
   // Spec 102: `replaceRemoved` (the admin asked for it explicitly) lets an automatic cover replace a removal; a manual cover still wins.
   if(input.auto&&(m.coverMode==='none'&&!input.replaceRemoved||m.coverMode==='manual'&&m.coverKey))return {ok:true,revision:m.revision,coverKept:true};
   // The object of a replaced or removed automatic cover is ours to delete; a manual cover's object is never touched.
   if(m.coverMode==='auto')await discardAutoCover(e,m);
   if(verified){await completeUpload(e,verified.upload.id);await sql`UPDATE crm_sales_materials SET cover_key=${verified.upload.objectKey},cover_mime=${verified.upload.declaredMime},cover_bytes=${verified.size},cover_mode=${input.auto?'auto':'manual'},revision=${next},updated_at=now() WHERE id=${m.id}::uuid`.execute(e);}
   // Removing a manual cover keeps its object in R2: this spec never deletes stored material.
   else await sql`UPDATE crm_sales_materials SET cover_key=NULL,cover_mime=NULL,cover_bytes=NULL,cover_mode='none',revision=${next},updated_at=now() WHERE id=${m.id}::uuid`.execute(e);
  }else if(input.action==='archive'){
   if(m.status==='archived')throw new Error('El material ya está archivado.');
   await sql`UPDATE crm_sales_materials SET status='archived',archived_at=now(),archived_by_email=${user.email},revision=${next},updated_at=now() WHERE id=${m.id}::uuid`.execute(e);
  }else{
   if(m.status==='active')throw new Error('El material ya está activo.');
   await sql`UPDATE crm_sales_materials SET status='active',archived_at=NULL,archived_by_email=NULL,revision=${next},updated_at=now() WHERE id=${m.id}::uuid`.execute(e);
  }
  return {ok:true,revision:next};
 });
}
/** Resolves a version for viewing or download (presigned GET: see {@link readUrlSeconds}). Sellers only reach the current version of an active material (spec 89 §5). */
export async function salesMaterialFileLocation(db:Kysely<DB>,{versionId,disposition,user,storage}:{versionId:string;disposition:'inline'|'attachment';user:User;storage?:R2Storage}):Promise<string>{
 const v=(await sql<VersionRow&{status:string;currentVersion:number|null}>`SELECT v.*,m.status,m.current_version FROM crm_sales_material_versions v JOIN crm_sales_materials m ON m.id=v.material_id WHERE v.id=${versionId}::uuid`.execute(db)).rows[0];
 if(!v)throw new SalesMaterialNotFound('La versión no existe.');
 if(user.role!=='admin'&&(v.status!=='active'||v.version!==v.currentVersion))throw new CrmForbidden('Esta versión del material no está disponible.');
 if(v.url)return v.url;
 return (storage??r2Storage()).presignGet({key:v.objectKey!,expiresIn:readUrlSeconds({mimeType:v.mimeType}),disposition:contentDisposition({disposition,fileName:v.fileName}),contentType:v.mimeType??undefined});
}
/** Cover bytes (at most 1 MB) served through our server: the admin cover, or a small image material itself. Null when there is none. */
export async function salesMaterialCover(db:Kysely<DB>,{materialId,user,storage}:{materialId:string;user:User;storage?:R2Storage}):Promise<{body:Uint8Array<ArrayBuffer>;contentType:string}|null>{
 const m=await materialFor(db,materialId);
 if(user.role!=='admin'&&m.status!=='active')throw new CrmForbidden('Este material no está disponible.');
 let key=m.coverKey,mime=m.coverMime;
 if(!key&&m.currentVersion){const v=(await sql<VersionRow>`SELECT * FROM crm_sales_material_versions WHERE material_id=${m.id}::uuid AND version=${m.currentVersion}`.execute(db)).rows[0];if(v?.objectKey&&v.mimeType?.startsWith('image/')&&Number(v.byteSize)<=SALES_MATERIAL_MAX_COVER_BYTES){key=v.objectKey;mime=v.mimeType;}}
 if(!key||!mime)return null;
 const object=await (storage??r2Storage()).read({key,maxBytes:SALES_MATERIAL_MAX_COVER_BYTES});
 return object?{body:object.body,contentType:mime}:null;
}
/** How long a `deleting` claim is respected before another sweep may retry it (a crashed sweep never blocks an upload forever). */
const CLAIM_MINUTES=15;
/**
 * Deletes expired pending uploads from R2 and marks them `discarded` (a 404 counts as deleted).
 * 1) A short transaction takes the advisory lock and claims a batch (`deleting`, FOR UPDATE SKIP LOCKED) and commits.
 * 2) R2 deletes run outside any transaction. 3) Each row is closed with a guarded UPDATE: `discarded` on success, back to `pending` on an R2 failure.
 * Confirmation only completes `pending` rows, so a confirmed upload is never claimed and a claimed one can no longer be confirmed.
 */
export async function sweepAbandonedSalesMaterialUploads(db:Kysely<DB>,{storage,limit=200}:{storage?:R2Storage;limit?:number}={}):Promise<{locked:boolean;discarded:number;failed:number}>{
 const store=storage??r2Storage();
 const claimed=await db.transaction().execute(async e=>{
  const ok=(await sql<{ok:boolean}>`SELECT pg_try_advisory_xact_lock(hashtext('crm_sales_material_upload_sweep')) AS ok`.execute(e)).rows[0].ok;
  if(!ok)return null;
  return (await sql<{id:string;objectKey:string}>`UPDATE crm_sales_material_uploads SET status='deleting',claimed_at=now() WHERE id IN (
    SELECT id FROM crm_sales_material_uploads WHERE (status='pending' AND expires_at<now()) OR (status='deleting' AND claimed_at<now()-make_interval(mins=>${CLAIM_MINUTES}::int))
    ORDER BY expires_at LIMIT ${limit} FOR UPDATE SKIP LOCKED) RETURNING id,object_key`.execute(e)).rows;
 });
 if(!claimed)return {locked:false,discarded:0,failed:0};
 let discarded=0,failed=0;
 for(const r of claimed){
  try{await store.remove({key:r.objectKey})}
  catch(error){
   // Back to pending (still expired): the next sweep retries it.
   await sql`UPDATE crm_sales_material_uploads SET status='pending',claimed_at=NULL WHERE id=${r.id}::uuid AND status='deleting'`.execute(db);
   if(!(error instanceof R2Unavailable))throw error;
   failed++;continue;
  }
  await sql`UPDATE crm_sales_material_uploads SET status='discarded',deleted_at=now() WHERE id=${r.id}::uuid AND status='deleting'`.execute(db);discarded++;
 }
 return {locked:true,discarded,failed};
}
/** Every 6 hours (and once a minute after start) sweeps abandoned uploads. Without R2 configuration it does nothing. Returns a stop function. */
export function scheduleSalesMaterialUploadSweep({db,intervalMs=6*60*60*1000,firstRunMs=60000,log=console.log}:{db:Kysely<DB>;intervalMs?:number;firstRunMs?:number;log?:(message:string)=>void}):()=>void{
 const run=async()=>{if(!r2Configured())return;try{const r=await sweepAbandonedSalesMaterialUploads(db);if(r.discarded||r.failed)log(`Sales material sweep: ${r.discarded} discarded, ${r.failed} failed`);}catch(error){log(`Sales material sweep failed: ${error instanceof Error?error.message:String(error)}`);}};
 const first=setTimeout(()=>void run(),firstRunMs);first.unref?.();
 const timer=setInterval(()=>void run(),intervalMs);timer.unref?.();
 return ()=>{clearTimeout(first);clearInterval(timer);};
}
