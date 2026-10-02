import {sql,type Kysely,type Transaction} from 'kysely';import {createHash,randomUUID} from 'node:crypto';
import type {DB} from './schema';import type {User} from './User';import {setWorkActor} from './workAudit';
import {communicationConfig,CommunicationForbidden,CommunicationConflict} from './communicationService';
import type {ResourceMutation,ResourceDocument} from '../endpoints/resources.schema';
type E=Kysely<DB>|Transaction<DB>;
export async function documentFor(e:E,id:string,user:User,write=false){const d=(await sql<ResourceDocument>`SELECT * FROM crm_documents WHERE id=${id}::uuid AND deleted_at IS NULL`.execute(e)).rows[0];if(!d)throw new Error('Documento inexistente');
 if(user.role==='admin'||d.ownerEmail===user.email)return d;
 const account=d.accountId?await e.selectFrom('crmAccounts').selectAll().where('id','=',d.accountId).executeTakeFirst():null;
 const lead=d.leadId?await e.selectFrom('leads').selectAll().where('id','=',d.leadId).executeTakeFirst():null;
 if(!write&&((d.library&&d.status==='approved')||account?.assignedUserEmail===user.email||lead?.assignedUserEmail===user.email))return d;
 throw new CommunicationForbidden('No tenés acceso a este documento');}
async function validateContext(e:E,user:User,accountId:string|null,leadId:string|null,activityId:string|null){if(!accountId){if(leadId||activityId)throw new Error('Seleccioná negocio');return;}
 const a=await e.selectFrom('crmAccounts').selectAll().where('id','=',accountId).where('mergedIntoId','is',null).executeTakeFirstOrThrow();let owner=a.assignedUserEmail===user.email;
 if(leadId){const l=await e.selectFrom('leads').selectAll().where('id','=',leadId).where('accountId','=',accountId).where('deletedAt','is',null).executeTakeFirstOrThrow();owner ||=l.assignedUserEmail===user.email;}
 if(activityId){const act=await e.selectFrom('crmActivities').selectAll().where('id','=',activityId).where('accountId','=',accountId).where('deletedAt','is',null).executeTakeFirstOrThrow();if(leadId&&act.leadId!==leadId)throw new Error('La actividad no corresponde a la oportunidad');}
 if(user.role!=='admin'&&!owner)throw new CommunicationForbidden('Negocio ajeno');}
async function insertVersion(e:E,documentId:string,version:number,v:Extract<ResourceMutation,{action:'version'}>['version'],user:User){
 if(!!v.url===!!v.fileData)throw new Error('Elegí archivo o vínculo');if(v.expiresOn&&(!Number.isFinite(Date.parse(v.expiresOn))||new Date(v.expiresOn).toISOString().slice(0,10)!==v.expiresOn))throw new Error('Vencimiento inválido');
 let url:string|null=null,data:string|null=null,mime:string|null=null,name:string|null=null,size:number|null=null,sha:string|null=null;
 if(v.url){const u=new URL(v.url);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw new Error('Solo vínculos HTTP(S) sin credenciales');url=u.href;}
 else {if(!v.fileName||!v.mimeType||!/^[A-Za-z0-9+/]*={0,2}$/.test(v.fileData!))throw new Error('Archivo inválido');const b=Buffer.from(v.fileData!,'base64');if(b.toString('base64')!==v.fileData)throw new Error('Codificación inválida');size=b.length;const cfg=await communicationConfig(e);if(size<1||size>cfg.maxDocumentBytes)throw new Error('Archivo excede el límite');
  mime=v.mimeType;const ext=v.fileName.split('.').at(-1)?.toLowerCase();const valid=mime==='application/pdf'&&b.subarray(0,5).toString()==='%PDF-'&&ext==='pdf'||mime==='image/png'&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&ext==='png'||mime==='image/jpeg'&&b[0]===255&&b[1]===216&&['jpg','jpeg'].includes(ext??'')||mime==='text/plain'&&ext==='txt'&&!b.includes(0)&&new TextDecoder('utf-8',{fatal:true}).decode(b)!=='';
  if(!valid)throw new Error('El contenido no coincide con PDF, PNG, JPEG o TXT');name=v.fileName.replace(/[^\p{L}\p{N}._ -]/gu,'_');data=v.fileData!;sha=createHash('sha256').update(b).digest('hex');
 }
 return (await sql`INSERT INTO crm_document_versions(id,document_id,version,url,file_data,file_name,mime_type,byte_size,sha256,expires_on,actor_email) VALUES(${randomUUID()}::uuid,${documentId}::uuid,${version},${url},${data},${name},${mime},${size},${sha},${v.expiresOn??null}::date,${user.email}) RETURNING id`.execute(e)).rows[0];
}
export async function mutateResource(db:Kysely<DB>,input:ResourceMutation,user:User){return db.transaction().execute(async e=>{
 await setWorkActor(e,user);await sql`LOCK TABLE crm_accounts,leads,crm_documents IN SHARE ROW EXCLUSIVE MODE`.execute(e);
 if(input.action==='category'){if(user.role!=='admin')throw new CommunicationForbidden('Solo admin configura categorías');if(input.id)await sql`UPDATE crm_document_categories SET name=${input.name},active=${input.active} WHERE id=${input.id}`.execute(e);else await sql`INSERT INTO crm_document_categories(name,active) VALUES(${input.name},${input.active})`.execute(e);return {ok:true};}
 if(input.action==='create'){
  const existing=(await sql`SELECT id FROM crm_documents WHERE id=${input.id}::uuid`.execute(e)).rows[0];if(existing){await documentFor(e,input.id,user,true);return {id:input.id};}
  await validateContext(e,user,input.accountId,input.leadId,input.activityId);
  if(input.categoryId&&!(await sql`SELECT id FROM crm_document_categories WHERE id=${input.categoryId} AND active`.execute(e)).rows.length)throw new Error('Categoría inactiva');
  await sql`INSERT INTO crm_documents(id,title,type,owner_email,account_id,original_account_id,lead_id,activity_id,library,category_id) VALUES(${input.id}::uuid,${input.title},${input.type},${user.email},${input.accountId},${input.accountId},${input.leadId},${input.activityId},${input.library},${input.categoryId})`.execute(e);
  await insertVersion(e,input.id,1,input.version,user);return {id:input.id};
 }
 const d=await documentFor(e,input.id,user,input.action!=='link');
 if(input.action==='link'){if(d.status!=='approved'||!d.library)throw new Error('Solo recursos aprobados de la biblioteca');await validateContext(e,user,input.accountId,input.leadId,input.activityId);await sql`INSERT INTO crm_document_links(document_id,account_id,original_account_id,lead_id,activity_id,actor_email) VALUES(${d.id}::uuid,${input.accountId},${input.accountId},${input.leadId},${input.activityId},${user.email}) ON CONFLICT DO NOTHING`.execute(e);return {ok:true};}
 const n=Number((await sql<{n:string}>`SELECT max(version) AS n FROM crm_document_versions WHERE document_id=${d.id}::uuid`.execute(e)).rows[0].n);if(n!==input.revision)throw new CommunicationConflict('La versión cambió. Actualizá antes de continuar.');
 if(input.action==='version'){await insertVersion(e,d.id,n+1,input.version,user);await sql`UPDATE crm_documents SET status='draft',approved_by=NULL,approved_at=NULL,updated_at=now() WHERE id=${d.id}::uuid`.execute(e);return {ok:true};}
 if(input.action==='delete'){await sql`UPDATE crm_documents SET deleted_at=now(),updated_at=now() WHERE id=${d.id}::uuid`.execute(e);return {ok:true};}
 if(input.status==='approved'&&user.role!=='admin')throw new CommunicationForbidden('Solo admin aprueba recursos');
 if(input.status==='approved')await sql`UPDATE crm_document_versions SET approved_by=${user.email},approved_at=now() WHERE document_id=${d.id}::uuid AND version=${n}`.execute(e);
 await sql`UPDATE crm_documents SET status=${input.status},approved_by=${input.status==='approved'?user.email:null},approved_at=${input.status==='approved'?new Date():null},updated_at=now() WHERE id=${d.id}::uuid`.execute(e);return {ok:true};
 });}
