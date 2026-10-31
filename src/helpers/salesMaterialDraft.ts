import {sql,type Kysely,type RawBuilder} from 'kysely';
import type {DB} from './schema';import type {User} from './User';import {setWorkActor} from './workAudit';
import type {CommunicationMutation,Message} from '../endpoints/communication.schema';
import type {MessageMaterial,SalesMaterialShareRevokeInput} from '../endpoints/salesMaterials.schema';
import {CommunicationConflict,CommunicationForbidden,assertAccountContactAllowed,assertMessageTaskContext,communicationContext,communicationJournal,lockCommunication,messageFor,renderFinal,sanitizeEmail,type Executor} from './communicationService';
import {CrmForbidden,assertAccountViewable} from './crmPermissions';
import {insertSalesMaterialShare} from './salesMaterialShareService';
import {salesMaterialConfig} from './salesMaterialService';
import {appendMaterialLink,attachBlockReasons,materialChannelOf,materialShareUrl,megabytesLabel,removeMaterialLink,shareTokenHashesInBody,shareUrlInBody,type MaterialChannel} from './salesMaterialMessage';
import {DRAFT_CHANGED_MESSAGE,MESSAGE_BODY_MAX_LENGTH} from '../endpoints/communication.schema';
import {contentDisposition} from './salesMaterialTypes';
import {r2Storage,type R2Storage} from './r2';
import {UNRESOLVED_MATERIAL_MESSAGE,hasMaterialReferences} from './templateMaterials';

/** Reason recorded when a link leaves a draft before it was ever sent (spec 89 §8.1). */
export const REVOKE_REASONS={removed:'Quitado del borrador',cancelled:'Borrador cancelado',removedFromText:'Quitado del texto'} as const;
/** Presigned GET handed to Brevo for an attachment: one hour (spec 89 §8.3). */
export const ATTACHMENT_URL_SECONDS=3600;
type MaterialAction=Extract<CommunicationMutation,{action:'material_add'|'material_remove'|'material_attach'|'material_retry_without_attachments'}>;
type ShareRow={shareId:string;messageId:string;materialId:string;tokenHash:string;title:string;channel:MaterialChannel;source:'file'|'url';kind:string;status:string;currentVersion:number|null;objectKey:string|null;fileName:string|null;mimeType:string|null;byteSize:string|number|null;preparedVersion:number|null;sentVersion:number|null;attach:boolean;attachedVersion:number|null;createdByEmail:string;createdAt:Date;revokedAt:Date|null;revokedByEmail:string|null;revokeReason:string|null;technicalAccessCount:number;lastTechnicalAccessAt:Date|null};
/** Shares of some messages (and, for the dispatch claim, shares whose token is in the body). Locking takes the share FOR UPDATE and its material FOR SHARE, so an archive waits. */
const shareRows=(e:Executor,messageIds:readonly string[],lock=false,tokenHashes:readonly string[]=[])=>sql<ShareRow>`SELECT s.id AS share_id,s.message_id,s.material_id,s.token_hash,m.title,s.channel,m.source,m.kind,m.status,m.current_version,v.object_key,v.file_name,v.mime_type,v.byte_size,
 s.prepared_version,s.sent_version,s.attach,s.attached_version,s.created_by_email,s.created_at,s.revoked_at,s.revoked_by_email,s.revoke_reason,s.technical_access_count,s.last_technical_access_at
 FROM crm_sales_material_shares s JOIN crm_sales_materials m ON m.id=s.material_id LEFT JOIN crm_sales_material_versions v ON v.material_id=m.id AND v.version=m.current_version
 WHERE s.message_id=ANY(${messageIds}::uuid[]) OR s.token_hash=ANY(${tokenHashes}::text[]) ORDER BY s.created_at,s.id ${lock?sql`FOR UPDATE OF s FOR SHARE OF m`:sql``}`.execute(e);
const availableRow=(r:Pick<ShareRow,'kind'|'status'|'currentVersion'>)=>r.kind==='deliverable'&&r.status==='active'&&r.currentVersion!=null;
const bytes=(r:Pick<ShareRow,'byteSize'>)=>r.byteSize==null?null:Number(r.byteSize);
/**
 * Materials of each message (spec 89 §8.4). A link that never left its draft and was revoked (removed, draft cancelled, deleted from the text)
 * is omitted: it was never sent. Each item says why it cannot be attached, with the email limit and the other attachments of its message.
 */
export async function messageMaterials(e:Executor,{messageIds}:{messageIds:readonly string[]}):Promise<Record<string,MessageMaterial[]>>{
 if(!messageIds.length)return {};
 const rows=(await shareRows(e,messageIds)).rows.filter(r=>!r.revokedAt||r.sentVersion!=null);
 const {maxEmailAttachmentBytes}=await salesMaterialConfig(e);
 const out:Record<string,MessageMaterial[]>={};
 for(const id of new Set(rows.map(r=>String(r.messageId)))){
  const own=rows.filter(r=>String(r.messageId)===id);
  const reasons=attachBlockReasons({channel:own[0]!.channel,limitBytes:maxEmailAttachmentBytes,items:own.filter(r=>!r.revokedAt).map(r=>({id:r.shareId,source:r.source,fileName:r.fileName,byteSize:bytes(r),attach:r.attach}))});
  out[id]=own.map(r=>({shareId:r.shareId,messageId:id,materialId:r.materialId,title:r.title,channel:r.channel,source:r.source,fileName:r.fileName,byteSize:bytes(r),available:availableRow(r),preparedVersion:r.preparedVersion,sentVersion:r.sentVersion,attach:r.attach,attachedVersion:r.attachedVersion,attachBlockedReason:r.revokedAt?'El enlace fue revocado.':!availableRow(r)?'El material ya no está disponible.':reasons[r.shareId]??null,createdByEmail:r.createdByEmail,createdAt:r.createdAt,revokedAt:r.revokedAt,revokedByEmail:r.revokedByEmail,revokeReason:r.revokeReason,technicalAccessCount:r.technicalAccessCount,lastTechnicalAccessAt:r.lastTechnicalAccessAt}));
 }
 return out;
}
/** A message row plus its materials (the shape `prepare`, `prepare_general` and the material actions return). */
export async function withMaterials<T extends {id:string}>(e:Executor,message:T):Promise<T&{materials:MessageMaterial[]}>{return {...message,materials:(await messageMaterials(e,{messageIds:[message.id]}))[message.id]??[]};}
async function revokeShares(e:Executor,{where,reason,user}:{where:RawBuilder<unknown>;reason:string;user:User}){
 return (await sql<{id:string;materialId:string}>`UPDATE crm_sales_material_shares SET revoked_at=now(),revoked_by_email=${user.email},revoke_reason=${reason} WHERE revoked_at IS NULL AND ${where} RETURNING id,material_id`.execute(e)).rows;
}
/** Revokes every live link of a draft that is being cancelled or discarded: the link never left (spec 89 §8.1). */
export async function revokeDraftShares(e:Executor,{message,user}:{message:Pick<Message,'id'|'accountId'|'leadId'>;user:User}):Promise<void>{
 const revoked=await revokeShares(e,{where:sql`message_id=${message.id}::uuid AND sent_version IS NULL`,reason:REVOKE_REASONS.cancelled,user});
 if(revoked.length)await communicationJournal(e,{accountId:String(message.accountId),leadId:message.leadId,entityType:'interaction',entityId:message.id,action:'material_links_revoked',actor:user,after:{reason:REVOKE_REASONS.cancelled,shareIds:revoked.map(r=>r.id)}});
}
/**
 * A draft of the user (or any draft for an admin) with the expected revision. Adding or attaching also needs the channel to be contactable and write
 * access unless it is a delegated draft (as `prepare`). `reducing` (removing a link) only needs ownership and read access: it lowers exposure, so it stays
 * allowed under No contactar or on an archived business. Spec 98: an Instagram attempt carries material too (`materialChannelOf`); a «Red social»
 * log or Hospeda's echo does not. The contact check keeps the message channel (`social` for Instagram), as `prepare` does.
 */
async function draftFor(e:Executor,input:{id:string;revision:number;taskId?:string},user:User,reducing=false):Promise<{m:Message;channel:MaterialChannel}>{
 const m=await messageFor(e,input.id,user,true);await assertMessageTaskContext(e,m,input.taskId,user);
 if(m.status!=='draft'||m.revision!==input.revision)throw new CommunicationConflict(DRAFT_CHANGED_MESSAGE);
 const channel=materialChannelOf(m);if(!channel)throw new CommunicationConflict('Este canal no lleva material de venta.');
 if(reducing)return {m,channel};
 await assertAccountContactAllowed(e,String(m.accountId),m.leadId==null?null:String(m.leadId),m.contactId==null?null:String(m.contactId),m.channel);
 if(!m.delegatedTaskId)await communicationContext(e,String(m.accountId),m.leadId==null?null:String(m.leadId),user,true);
 return {m,channel};
}
/**
 * Saves a new body like `edit` does: same length cap, sanitized for email. Email and Instagram refresh their final html/text only if the draft had
 * them (they mean «reviewed»; D6 A keeps Instagram as before). WhatsApp stores the final text equal to the body, as `edit` does (spec 101 §6.2).
 */
async function saveBody(e:Executor,m:Message,body:string,user:User):Promise<Message>{
 if(hasMaterialReferences({text:body}))throw new CommunicationConflict(UNRESOLVED_MATERIAL_MESSAGE);
 if(body.length>MESSAGE_BODY_MAX_LENGTH)throw new CommunicationConflict(`Con el enlace, el mensaje supera los ${MESSAGE_BODY_MAX_LENGTH.toLocaleString('es-AR')} caracteres. Acortá el texto antes de agregar material.`);
 const clean=m.channel==='email'?sanitizeEmail(body):body;
 const final=m.channel==='email'&&m.htmlBody?await renderFinal(e,{...m,body:clean},user):null;
 return (await sql<Message>`UPDATE crm_messages SET body=${clean},html_body=${final?final.htmlBody:m.htmlBody},text_body=${m.channel==='whatsapp'?(clean.trim()?clean:null):m.textBody==null?null:m.channel==='email'?final?.textBody??m.textBody:clean},revision=revision+1,updated_at=now() WHERE id=${m.id}::uuid RETURNING *`.execute(e)).rows[0]!;
}
/** Refuses (409) attaching that share of the draft: WhatsApp/Instagram, external link, Brevo extension, size or the sum of the attachments (spec 89 §8.3). */
export async function assertAttachable(e:Executor,m:Message,shareId:string){
 const rows=(await shareRows(e,[m.id])).rows.filter(r=>!r.revokedAt);const {maxEmailAttachmentBytes}=await salesMaterialConfig(e);
 const channel=materialChannelOf(m);if(!channel)throw new CommunicationConflict('Este canal no lleva material de venta.');
 const reason=attachBlockReasons({channel,limitBytes:maxEmailAttachmentBytes,items:rows.map(r=>({id:r.shareId,source:r.source,fileName:r.fileName,byteSize:bytes(r),attach:r.shareId===shareId?false:r.attach}))})[shareId];
 if(reason)throw new CommunicationConflict(reason);
}
async function liveShare(e:Executor,m:Message,shareId:string){
 const share=(await shareRows(e,[m.id],true)).rows.find(r=>r.shareId===shareId&&!r.revokedAt);
 if(!share)throw new CommunicationConflict('Ese material ya no está en el mensaje.');return share;
}
/** `material_add`, `material_remove`, `material_attach` and «Reintentar sin adjuntos» (spec 89 §8.1, §8.3). Runs inside the communication transaction. */
export async function mutateDraftMaterial(e:Executor,input:MaterialAction,user:User):Promise<{message:Message&{materials:MessageMaterial[]};materials:MessageMaterial[]}>{
 const done=async(message:Message)=>{const withList=await withMaterials(e,message);return {message:withList,materials:withList.materials};};
 if(input.action==='material_retry_without_attachments')return done(await retryWithoutAttachments(e,input,user));
 const {m,channel}=await draftFor(e,input,user,input.action==='material_remove'),journal=(action:string,after:unknown)=>communicationJournal(e,{accountId:String(m.accountId),leadId:m.leadId,entityType:'interaction',entityId:m.id,action,actor:user,after});
 if(input.action==='material_add'){
  const active=(await shareRows(e,[m.id])).rows.find(r=>r.materialId===input.materialId&&!r.revokedAt);
  if(active)throw new CommunicationConflict(`«${active.title}» ya está en el mensaje.`);
  const share=await insertSalesMaterialShare(e,{materialId:input.materialId,accountId:String(m.accountId),leadId:m.leadId==null?null:String(m.leadId),contactId:m.contactId==null?null:String(m.contactId),channel,messageId:m.id,user});
  if(input.attach){await assertAttachable(e,m,share.id);await sql`UPDATE crm_sales_material_shares SET attach=true WHERE id=${share.id}::uuid`.execute(e);}
  const saved=await saveBody(e,m,appendMaterialLink({channel,body:m.body,title:share.title,url:materialShareUrl({path:share.path})}),user);
  await journal('material_added',{shareId:share.id,materialId:input.materialId,title:share.title,version:share.preparedVersion,attach:input.attach});
  return done(saved);
 }
 const share=await liveShare(e,m,input.shareId);
 if(input.action==='material_attach'){
  if(input.attach)await assertAttachable(e,m,share.shareId);
  await sql`UPDATE crm_sales_material_shares SET attach=${input.attach} WHERE id=${share.shareId}::uuid`.execute(e);
  const saved=(await sql<Message>`UPDATE crm_messages SET revision=revision+1,updated_at=now() WHERE id=${m.id}::uuid RETURNING *`.execute(e)).rows[0]!;
  await journal('material_attach_changed',{shareId:share.shareId,materialId:share.materialId,attach:input.attach});
  return done(saved);
 }
 await revokeShares(e,{where:sql`id=${share.shareId}::uuid`,reason:REVOKE_REASONS.removed,user});
 const url=shareUrlInBody({body:m.body,tokenHash:share.tokenHash});
 const saved=url?await saveBody(e,m,removeMaterialLink({channel,body:m.body,url,title:share.title}),user):(await sql<Message>`UPDATE crm_messages SET revision=revision+1,updated_at=now() WHERE id=${m.id}::uuid RETURNING *`.execute(e)).rows[0]!;
 await journal('material_removed',{shareId:share.shareId,materialId:share.materialId,title:share.title,reason:REVOKE_REASONS.removed});
 return done(saved);
}
/**
 * «Reintentar sin adjuntos» (spec 89 §8.3): after Brevo refused an email (outbox `error`), a NEW draft with the same subject and body, whose live links
 * move to it without attachments. Links revoked meanwhile (for example from «Comunicación») stay on the failed message and are stripped from the copied
 * text; the copy then needs a new review («Guardar y ver contenido final»). The new draft keeps the owner, the task (`task_id`, completed when the retry
 * is accepted) and the delegation (`delegated_task_id`, so a delegate retries from her task, like `prepare`). Nothing is sent automatically. Idempotent on the new id.
 */
async function retryWithoutAttachments(e:Executor,input:Extract<MaterialAction,{action:'material_retry_without_attachments'}>,user:User):Promise<Message>{
 const existing=(await sql<Message>`SELECT * FROM crm_messages WHERE id=${input.id}::uuid`.execute(e)).rows[0];if(existing){await messageFor(e,input.id,user);return existing;}
 const m=await messageFor(e,input.messageId,user,true);await assertMessageTaskContext(e,m,input.taskId,user);
 const outbox=m.outboxId?(await sql<{status:string}>`SELECT status FROM email_outbox WHERE id=${m.outboxId}`.execute(e)).rows[0]:null;
 if(m.channel!=='email'||m.status!=='failed'||outbox?.status!=='error')throw new CommunicationConflict('Solo un email que Brevo rechazó se puede reintentar sin adjuntos.');
 const rows=(await shareRows(e,[m.id],true)).rows,shares=rows.filter(r=>!r.revokedAt);
 if(!rows.some(r=>r.attach&&r.sentVersion!=null))throw new CommunicationConflict('Este email no tenía adjuntos.');
 await assertAccountContactAllowed(e,String(m.accountId),m.leadId==null?null:String(m.leadId),m.contactId==null?null:String(m.contactId),'email');
 if(!m.delegatedTaskId)await communicationContext(e,String(m.accountId),m.leadId==null?null:String(m.leadId),user,true);
 let body=m.body;
 for(const r of rows.filter(r=>r.revokedAt)){const url=shareUrlInBody({body,tokenHash:r.tokenHash});if(url)body=removeMaterialLink({channel:'email',body,url,title:r.title});}
 const stripped=body!==m.body;
 const created=(await sql<Message>`INSERT INTO crm_messages(id,account_id,original_account_id,lead_id,contact_id,channel,recipient,recipient_name,subject,body,html_body,text_body,template_snapshot,owner_email,purpose,other_purpose,task_id,delegated_task_id)
  SELECT ${input.id}::uuid,account_id,original_account_id,lead_id,contact_id,channel,recipient,recipient_name,subject,${body},CASE WHEN ${stripped} THEN NULL ELSE html_body END,CASE WHEN ${stripped} THEN NULL ELSE text_body END,template_snapshot,owner_email,purpose,other_purpose,task_id,delegated_task_id FROM crm_messages WHERE id=${m.id}::uuid RETURNING *`.execute(e)).rows[0]!;
 await sql`UPDATE crm_sales_material_shares SET message_id=${created.id}::uuid,attach=false,sent_version=NULL,attached_version=NULL WHERE message_id=${m.id}::uuid AND revoked_at IS NULL`.execute(e);
 await communicationJournal(e,{accountId:String(m.accountId),leadId:m.leadId,entityType:'interaction',entityId:created.id,action:'draft_retry_without_attachments',actor:user,after:{fromMessageId:m.id,shareIds:shares.map(r=>r.shareId),strippedRevokedLinks:rows.filter(r=>r.revokedAt).map(r=>r.shareId),...(m.delegatedTaskId?{delegatedTaskId:String(m.delegatedTaskId)}:{})}});
 return created;
}
/** What `dispatch` records and sends for the materials of a draft. */
export type ClaimedMaterials={journal:{materialId:string;version:number;attach:boolean}[];attachments:{url:string;name:string}[]};
/**
 * Inside the dispatch claim (spec 89 §8.1, §11). Every `/m/<token>` in the body is looked up by its hash, whatever message it belongs to: an unknown
 * token, a token of another message or business, or a revoked link gives 409 and nothing is sent. A live link of this draft the seller deleted from the
 * text is revoked («Quitado del texto») and not recorded as sent. A kept link needs its material deliverable and active (the material row is locked
 * FOR SHARE, so a concurrent archive waits). Then `sent_version` is fixed and, for email, every attached file gets a one-hour presigned GET for Brevo,
 * re-checked against the Brevo extensions and the attachment limit.
 */
export async function claimDraftMaterials(e:Executor,{message:m,user,storage}:{message:Message;user:User;storage?:R2Storage}):Promise<ClaimedMaterials>{
 if([m.body,m.htmlBody??'',m.textBody??''].some(text=>hasMaterialReferences({text})))throw new CommunicationConflict(UNRESOLVED_MATERIAL_MESSAGE);
 const inBody=shareTokenHashesInBody({body:m.body});
 const rows=(await shareRows(e,[m.id],true,[...inBody])).rows;
 if(!rows.length&&!inBody.size)return {journal:[],attachments:[]};
 const known=new Set(rows.map(r=>r.tokenHash));
 if([...inBody].some(h=>!known.has(h)))throw new CommunicationConflict('El mensaje tiene un enlace de material que no se reconoce. Quitalo y agregá el material desde «Agregar material de venta».');
 const foreign=rows.find(r=>inBody.has(r.tokenHash)&&String(r.messageId??'')!==String(m.id));
 if(foreign)throw new CommunicationConflict(`El enlace de «${foreign.title}» pertenece a otro mensaje. Quitalo y agregá el material desde «Agregar material de venta».`);
 const own=rows.filter(r=>String(r.messageId)===String(m.id));
 const revokedInText=own.find(r=>r.revokedAt&&inBody.has(r.tokenHash));
 if(revokedInText)throw new CommunicationConflict(`El enlace de «${revokedInText.title}» fue revocado. Quitalo del mensaje.`);
 const live=own.filter(r=>!r.revokedAt),kept=live.filter(r=>inBody.has(r.tokenHash)),dropped=live.filter(r=>!inBody.has(r.tokenHash));
 const unavailable=kept.find(r=>!availableRow(r));
 if(unavailable)throw new CommunicationConflict(`El material «${unavailable.title}» ya no está disponible. Quitalo del mensaje.`);
 const attached=m.channel==='email'?kept.filter(r=>r.attach):[];
 const {maxEmailAttachmentBytes}=await salesMaterialConfig(e);
 const reasons=attachBlockReasons({channel:'email',limitBytes:maxEmailAttachmentBytes,items:attached.map(r=>({id:r.shareId,source:r.source,fileName:r.fileName,byteSize:bytes(r),attach:false}))});
 const blocked=attached.find(r=>reasons[r.shareId]||!r.objectKey);
 if(blocked)throw new CommunicationConflict(`No se puede adjuntar «${blocked.title}»: ${reasons[blocked.shareId]??'Es un enlace externo: va solo el enlace.'} Destildá «Adjuntar el archivo».`);
 if(attached.reduce((sum,r)=>sum+(bytes(r)??0),0)>maxEmailAttachmentBytes)throw new CommunicationConflict(`Los adjuntos superan el límite de email (${megabytesLabel({bytes:maxEmailAttachmentBytes})}). Destildá alguno.`);
 if(dropped.length){
  await revokeShares(e,{where:sql`id=ANY(${dropped.map(r=>r.shareId)}::uuid[])`,reason:REVOKE_REASONS.removedFromText,user});
  await communicationJournal(e,{accountId:String(m.accountId),leadId:m.leadId,entityType:'interaction',entityId:m.id,action:'material_links_revoked',actor:user,after:{reason:REVOKE_REASONS.removedFromText,shareIds:dropped.map(r=>r.shareId)}});
 }
 if(kept.length)await sql`UPDATE crm_sales_material_shares s SET sent_version=m.current_version,attach=CASE WHEN ${m.channel==='email'} THEN s.attach ELSE false END FROM crm_sales_materials m WHERE m.id=s.material_id AND s.id=ANY(${kept.map(r=>r.shareId)}::uuid[])`.execute(e);
 const store=attached.length?storage??r2Storage():null;
 const attachments=await Promise.all(attached.map(async r=>({url:await store!.presignGet({key:r.objectKey!,expiresIn:ATTACHMENT_URL_SECONDS,disposition:contentDisposition({disposition:'attachment',fileName:r.fileName}),contentType:r.mimeType??undefined}),name:r.fileName!.trim()})));
 return {journal:kept.map(r=>({materialId:r.materialId,version:r.currentVersion!,attach:m.channel==='email'&&r.attach})),attachments};
}
/** After Brevo accepted the email: what was attached is the version sent (spec 89 §8.3). */
export async function markAttachedVersions(e:Executor,{messageId}:{messageId:string}):Promise<void>{
 await sql`UPDATE crm_sales_material_shares SET attached_version=sent_version WHERE message_id=${messageId}::uuid AND attach AND revoked_at IS NULL AND sent_version IS NOT NULL`.execute(e);
}
/**
 * «Revocar enlace» (spec 89 §10): read access to the business plus being an admin, the author of the send, the responsible of the business or the
 * responsible of the management. Revoking lowers exposure, so No contactar and archived (for whoever can still see it) do not block it.
 * A link still in a draft is removed from the draft instead. Revoking twice is a no-op. No contactar never revokes on its own; it only blocks new sends.
 */
export async function revokeSalesMaterialShare(db:Kysely<DB>,{input,user}:{input:SalesMaterialShareRevokeInput;user:User}):Promise<{ok:true}>{
 return db.transaction().execute(async e=>{
  await setWorkActor(e,user);
  await lockCommunication(e,async e=>({accountIds:(await sql<{accountId:string}>`SELECT account_id FROM crm_sales_material_shares WHERE id=${input.shareId}::uuid`.execute(e)).rows.map(r=>r.accountId)}));
  const share=(await sql<{id:string;accountId:string;leadId:string|null;messageId:string|null;createdByEmail:string;revokedAt:Date|null;materialId:string}>`SELECT id,account_id,lead_id,message_id,created_by_email,revoked_at,material_id FROM crm_sales_material_shares WHERE id=${input.shareId}::uuid FOR UPDATE`.execute(e)).rows[0];
  if(!share)throw new CommunicationConflict('El enlace no existe.');
  const account=await e.selectFrom('crmAccounts').selectAll().where('id','=',share.accountId).executeTakeFirstOrThrow();
  assertAccountViewable(user,account);
  const leadOwner=share.leadId?(await sql<{assignedUserEmail:string|null}>`SELECT assigned_user_email FROM leads WHERE id=${share.leadId}`.execute(e)).rows[0]?.assignedUserEmail??null:null;
  if(user.role!=='admin'&&share.createdByEmail!==user.email&&account.assignedUserEmail!==user.email&&leadOwner!==user.email)throw new CrmForbidden('Solo quien mandó el enlace, el responsable del negocio o de la gestión, o un administrador, puede revocarlo.');
  const message=share.messageId?(await sql<{status:string}>`SELECT status FROM crm_messages WHERE id=${share.messageId}::uuid`.execute(e)).rows[0]:null;
  if(message?.status==='draft')throw new CommunicationConflict('Este enlace está en un borrador: quitalo desde el mensaje.');
  if(share.revokedAt)return {ok:true};
  await revokeShares(e,{where:sql`id=${share.id}::uuid`,reason:input.reason,user});
  await communicationJournal(e,{accountId:String(share.accountId),leadId:share.leadId==null?null:String(share.leadId),entityType:share.messageId?'interaction':'business',entityId:share.messageId??String(share.accountId),action:'material_link_revoked',actor:user,after:{shareId:share.id,materialId:share.materialId,reason:input.reason}});
  return {ok:true};
 });
}
