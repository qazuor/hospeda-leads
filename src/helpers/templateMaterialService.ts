import {sql} from 'kysely';
import type {User} from './User';
import type {Message} from '../endpoints/communication.schema';
import {MESSAGE_BODY_MAX_LENGTH} from '../endpoints/communication.schema';
import {CommunicationConflict,CommunicationForbidden,communicationJournal,type Executor} from './communicationService';
import {SalesMaterialNotFound} from './salesMaterialService';
import {insertSalesMaterialShare} from './salesMaterialShareService';
import {materialShareUrl} from './salesMaterialMessage';
import {assertAttachable} from './salesMaterialDraft';
import {dropMaterialReferences,hasMaterialReferences,materialReferenceInTag,materialReferenceReplacement,replaceMaterialReferences,templateMaterialMessage,templateMaterialReferences,type TemplateMaterialProblem,type TemplateMaterialRef,type TemplateMaterialWarning} from './templateMaterials';

/** A template refers to a material that cannot be saved there (missing or internal), or puts a reference where it cannot go. Answered as 400. */
export class TemplateMaterialInvalid extends Error{constructor(message:string){super(message);this.name='TemplateMaterialInvalid';}}
type MaterialState={id:string;title:string;kind:string;status:string;currentVersion:number|null};
/** Why a material cannot go to a client right now (null = it can): missing, internal, or archived / without a version. */
export const templateMaterialProblem=(m:MaterialState|undefined):TemplateMaterialProblem|null=>!m?'missing':m.kind!=='deliverable'?'internal':m.status!=='active'||m.currentVersion==null?'archived':null;
/** `lock` takes the rows FOR SHARE (in id order), so an archive or a change to internal waits until the resolving transaction ends. */
async function materialStates(e:Executor,{materialIds,lock=false}:{materialIds:readonly string[];lock?:boolean}):Promise<Map<string,MaterialState>>{
 if(!materialIds.length)return new Map();
 const rows=(await sql<MaterialState>`SELECT id::text AS id,title,kind,status,current_version FROM crm_sales_materials WHERE id=ANY(${[...new Set(materialIds)]}::uuid[]) ORDER BY id ${lock?sql`FOR SHARE`:sql``}`.execute(e)).rows;
 return new Map(rows.map(r=>[r.id,r]));
}
/** References of each template with title and problem, for the editor chips and the «no disponible» notice and list indicator (spec 89 §9). */
export async function templateMaterialRefs(e:Executor,{templates}:{templates:readonly {id:string;body:string}[]}):Promise<Record<string,TemplateMaterialRef[]>>{
 const refs=templates.map(t=>({id:t.id,refs:templateMaterialReferences({text:t.body})})).filter(t=>t.refs.length);
 const states=await materialStates(e,{materialIds:refs.flatMap(t=>t.refs.map(r=>r.materialId))});
 return Object.fromEntries(refs.map(t=>[t.id,t.refs.map(r=>{const m=states.get(r.materialId);return {materialId:r.materialId,title:m?.title??null,problem:templateMaterialProblem(m)};})]));
}
/**
 * Checked when a template is saved or a version restored (spec 89 §9): references go only in the body of WhatsApp and email templates, and a
 * missing or internal material is refused. An archived one is saved with a warning: restoring it brings the links back, and `prepare` leaves it out meanwhile.
 */
export async function validateTemplateMaterials(e:Executor,{channel,subject,body}:{channel:string;subject:string|null;body:string}):Promise<TemplateMaterialWarning[]>{
 if(subject&&hasMaterialReferences({text:subject}))throw new TemplateMaterialInvalid('El asunto no puede llevar material de venta. Insertalo en el texto del modelo.');
 const refs=templateMaterialReferences({text:body});if(!refs.length)return [];
 if(materialReferenceInTag({html:body}))throw new TemplateMaterialInvalid('El material de venta va en el texto del modelo, no dentro de un enlace ni de otro atributo. Insertalo con «Insertar material de venta».');
 if(channel!=='email'&&channel!=='whatsapp')throw new TemplateMaterialInvalid('Solo los modelos de WhatsApp y email pueden llevar material de venta. Quitalo o cambiá el canal.');
 const states=await materialStates(e,{materialIds:refs.map(r=>r.materialId)}),warnings:TemplateMaterialWarning[]=[];
 for(const ref of refs){
  const m=states.get(ref.materialId),problem=templateMaterialProblem(m);
  if(problem==='missing')throw new TemplateMaterialInvalid('El modelo incluye un material que ya no existe. Quitalo antes de guardar.');
  if(problem==='internal')throw new TemplateMaterialInvalid(`«${m!.title}» es material interno: no se manda a clientes. Quitalo del modelo.`);
  if(problem)warnings.push({materialId:ref.materialId,title:m!.title,problem,message:`Este modelo incluye «${m!.title}», que ya no está disponible. No se va a enviar.`});
 }
 return warnings;
}
/**
 * Resolves the references of a fresh draft at `prepare` / `prepare_general` (spec 89 §9, §10). Each available material gets its own share through
 * `insertSalesMaterialShare`, the same path as `material_add`, after the caller's write access and No contactar checks, so the dispatch claim accepts
 * the link. A missing, internal or archived material is dropped from the text with a reason for the seller (`materialWarnings`). In email,
 * `:attach` also attaches the file when Brevo and the limit allow it; otherwise only the link goes, with a warning. A reused draft has no
 * references left, so this is a no-op for it. Runs inside the communication transaction.
 */
export async function resolveTemplateMaterials<T extends Message&{freshDraft?:true}>(e:Executor,{message:prepared,user}:{message:T;user:User}):Promise<Omit<T,'freshDraft'>&{materialWarnings:TemplateMaterialWarning[]}>{
 // Only the draft this call just inserted: a reused draft or the replay of an existing id is returned as it is (its references, if any, were
 // never resolved there and dispatch refuses them; resolving now would neither bump the revision nor refresh the reviewed html/text).
 const {freshDraft,...message}=prepared;
 const refs=freshDraft&&message.status==='draft'&&(message.channel==='email'||message.channel==='whatsapp')?templateMaterialReferences({text:message.body}):[];
 if(!refs.length)return {...message,materialWarnings:[]};
 const channel=message.channel as 'email'|'whatsapp',states=await materialStates(e,{materialIds:refs.map(r=>r.materialId),lock:true});
 const warnings:TemplateMaterialWarning[]=[],links=new Map<string,string>(),shares:{shareId:string;materialId:string;title:string;version:number;attach:boolean}[]=[];
 for(const ref of refs){
  const m=states.get(ref.materialId),problem=templateMaterialProblem(m);
  if(problem){warnings.push({materialId:ref.materialId,title:m?.title??null,problem,message:templateMaterialMessage({title:m?.title??null,problem})});continue;}
  // The share insert checks the material again (FOR SHARE): a change it sees (archive, internal, deleted) leaves the material out with a warning
  // instead of failing the whole prepare.
  let share:Awaited<ReturnType<typeof insertSalesMaterialShare>>;
  try{share=await insertSalesMaterialShare(e,{materialId:ref.materialId,accountId:String(message.accountId),leadId:message.leadId==null?null:String(message.leadId),contactId:message.contactId==null?null:String(message.contactId),channel,messageId:message.id,user});}
  catch(error){
   const late:TemplateMaterialProblem|null=error instanceof SalesMaterialNotFound?'missing':error instanceof CommunicationForbidden?'internal':error instanceof CommunicationConflict?'archived':null;
   if(!late)throw error;
   const title=late==='missing'?null:m?.title??null;warnings.push({materialId:ref.materialId,title,problem:late,message:templateMaterialMessage({title,problem:late})});continue;
  }
  links.set(ref.materialId,materialReferenceReplacement({channel,title:share.title,url:materialShareUrl({path:share.path})}));
  const item={shareId:share.id,materialId:ref.materialId,title:share.title,version:share.preparedVersion,attach:false};shares.push(item);
  if(channel!=='email'||!ref.attach)continue;
  try{await assertAttachable(e,message,share.id);await sql`UPDATE crm_sales_material_shares SET attach=true WHERE id=${share.id}::uuid`.execute(e);item.attach=true;}
  catch(error){if(!(error instanceof CommunicationConflict))throw error;warnings.push({materialId:ref.materialId,title:share.title,problem:'attach',message:`«${share.title}» va solo como enlace: ${error.message}`});}
 }
 const dropped=new Set(warnings.filter(w=>w.problem!=='attach').map(w=>w.materialId));
 const body=replaceMaterialReferences({text:dropMaterialReferences({text:message.body,channel,materialIds:dropped}),replace:ref=>links.get(ref.materialId)??''});
 if(body.length>MESSAGE_BODY_MAX_LENGTH)throw new CommunicationConflict(`Con los enlaces del material, el mensaje supera los ${MESSAGE_BODY_MAX_LENGTH.toLocaleString('es-AR')} caracteres. Acortá el modelo.`);
 const saved=(await sql<Message>`UPDATE crm_messages SET body=${body},updated_at=now() WHERE id=${message.id}::uuid RETURNING *`.execute(e)).rows[0]!;
 await communicationJournal(e,{accountId:String(message.accountId),leadId:message.leadId==null?null:String(message.leadId),entityType:'interaction',entityId:message.id,action:'template_materials_resolved',actor:user,after:{shares,skipped:warnings.map(({materialId,problem,title})=>({materialId,problem,title}))}});
 return {...message,...saved,materialWarnings:warnings};
}
