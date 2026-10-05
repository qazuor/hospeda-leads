import {createHash,randomUUID} from 'node:crypto';
import {sql,type Transaction,type Kysely,type Insertable} from 'kysely';
import {z} from 'zod';
import type {DB,Leads} from './schema';
import {classificationErrors} from './accountClassification';
import {businessImportFields,legacyBusinessFields,accountExtraFields,businessFields,importFields,normalizeField,matchAccounts,dataFieldLabels} from './dataNormalization';
import {qualityMutation,type QualityMutation,type ReviewRow,type ImportResult} from '../endpoints/dataQuality.schema';
import {setWorkActor} from './workAudit';
import {writeLeadJournal} from './writeLeadJournal';
import type {User} from './User';
export class QualityForbidden extends Error{}
export class QualityConflict extends Error{}
export class QualityValidation extends Error{}
const json=(v:unknown)=>JSON.parse(JSON.stringify(v));
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export async function qualityConfig(database:Kysely<DB>){const row=await database.selectFrom('appSettings').select('value').where('key','=','crm_data_quality').executeTakeFirstOrThrow();return z.object({maxRows:z.number().int().min(1).max(250),maxFileBytes:z.number().int().min(100).max(2097152)}).parse(JSON.parse(row.value));}
const activeAccounts=(database:Kysely<DB>)=>database.selectFrom('crmAccounts').selectAll().where('mergedIntoId','is',null).orderBy('id').execute();
function validDate(value:string){
 const m=value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);const day=m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:value;
 return /^\d{4}-\d{2}-\d{2}$/.test(day)&&!Number.isNaN(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day?day:null;
}
export async function reviewRows(database:Kysely<DB>,values:Record<string,string>[],mode:'business'|'opportunity'='opportunity'):Promise<ReviewRow[]>{
 const accounts=await activeAccounts(database);
 const users=await database.selectFrom('users').select(['email','displayName']).execute();
 const rows=await Promise.all(values.map(async(row,index)=>{
  const errors:string[]=[],warnings:string[]=[];
  if(!row.nombre?.trim())errors.push('Nombre obligatorio');
  if(mode==='business'){
   const unsupported=Object.keys(row).filter(f=>row[f].trim()&&!(businessImportFields as readonly string[]).includes(f));
   if(unsupported.length)errors.push('Solo negocios: quitá los campos de venta '+unsupported.join(', '));
   errors.push(...await classificationErrors(database,row.tipo?.trim()||null,row.subtipo?.trim()||null));
  }else if(accountExtraFields.some(f=>!['tipo','subtipo'].includes(f)&&row[f]?.trim()))errors.push('Los datos de relevamiento requieren el modo Solo negocios.');
  for(const [field,value] of Object.entries(row)){
   if(!value.trim())continue;
   const n=normalizeField(field,value);
   if(n.validity==='invalid')errors.push(dataFieldLabels[field]+': '+n.observations);
   if(n.validity==='ambiguous')warnings.push(dataFieldLabels[field]+': '+n.observations);
   if(field==='verifiedOn'&&(!validDate(value.trim())||value.trim()>new Date().toISOString().slice(0,10)))errors.push('Fecha de verificación inválida o futura: usar AAAA-MM-DD.');
   if(field==='verificationUrls'&&value.split(/\s+/).some(url=>!/^https?:\/\//.test(url)||!z.string().url().safeParse(url).success))errors.push('URLs de verificación: usar URLs HTTP(S) separadas por espacios o líneas.');
   if(field.startsWith('fecha')&&!validDate(value.trim()))errors.push(dataFieldLabels[field]+': usar AAAA-MM-DD o DD/MM/AAAA válido');
   if(field==='prioridad'&&!['alta','media','baja'].includes(value.trim()))errors.push('Prioridad inválida');
   if(field==='clientePotencialRecurrente'&&!['true','false','si','sí','no','1','0','yes'].includes(value.trim().toLowerCase()))errors.push('Booleano inválido');
   if(field==='asignadoA'&&!users.some(u=>u.email===value.trim())&&users.filter(u=>u.displayName===value.trim()).length!==1)errors.push('Responsable inexistente o ambiguo');
  }
  return {index,values:row,errors,warnings,matches:matchAccounts(row,accounts),withinBatch:[] as number[]};
 }));
 for(const row of rows)for(const other of rows){if(other.index>=row.index)break;const matches=matchAccounts(row.values,[{id:String(other.index),nombre:other.values.nombre??'',ciudad:other.values.ciudad??null,telefono:other.values.telefono??null,email:other.values.email??null,sitioWeb:other.values.sitioWeb??null,direccion:other.values.direccion??null,whatsapp:other.values.whatsapp??null,perfilInstagram:other.values.perfilInstagram??null,perfilFacebook:other.values.perfilFacebook??null,updatedAt:new Date(0)}]);if(matches.length){row.withinBatch.push(other.index);other.withinBatch.push(row.index);}}
 return rows;
}
async function evidence(trx:Transaction<DB>,accountId:string,fields:Record<string,string>,user:User,source:{source:string;sourceUrl?:string|null;obtainedAt?:string|null},batchId:string|null,leadId:string|null=null){
 for(const [field,value] of Object.entries(fields)){
  if(!value.trim())continue;const n=normalizeField(field,value);
  await trx.insertInto('crmDataEvidence').values({accountId,originalAccountId:accountId,leadId:(leadId?(legacyBusinessFields as readonly string[]).includes(field):(businessFields as readonly string[]).includes(field))?null:leadId,field,originalValue:value,normalizedValue:n.normalized,source:source.source,sourceUrl:source.sourceUrl??null,obtainedAt:source.obtainedAt??null,verifiedAt:null,validity:n.validity,observations:n.observations,batchId,actorEmail:user.email}).execute();
 }
}
async function snapshot(database:Kysely<DB>,sourceId:string,destinationId:string){
 const accounts=await database.selectFrom('crmAccounts').selectAll().where('id','in',[sourceId,destinationId]).orderBy('id').execute();
 const relations:Record<string,unknown[] >={};
 for(const table of ['leads','crmContacts','crmTasks','crmActivities','crmDataEvidence','crmCommercialJournal','leadJournal','crmWorkJournal'] as const)relations[table]=await database.selectFrom(table).selectAll().where('accountId','in',[sourceId,destinationId]).orderBy('id').execute();
 // These tables are intentionally queried using SQL: generated schema predates phase 3.
 for(const table of ['crm_pipeline_events','crm_objections','crm_messages','crm_contact_restrictions','crm_sequence_runs','crm_documents','crm_document_links'])relations[table]=(await sql`SELECT * FROM ${sql.table(table)} WHERE account_id IN (${sourceId}::bigint,${destinationId}::bigint) ORDER BY id`.execute(database)).rows;
 const documentIds=(relations.crm_documents as Array<{id:string}>).map(d=>d.id);
 if(documentIds.length)relations.crmDocumentVersions=(await sql`SELECT to_jsonb(v)-'file_data' AS metadata FROM crm_document_versions v WHERE document_id IN (${sql.join(documentIds.map(id=>sql`${id}::uuid`))}) ORDER BY id`.execute(database)).rows;
 const leads=relations.leads as Array<{id:string}>;
 if(leads.length){relations.leadNotes=await database.selectFrom('leadNotes').selectAll().where('leadId','in',leads.map(l=>l.id)).orderBy('id').execute();relations.emailOutbox=await database.selectFrom('emailOutbox').selectAll().where('leadId','in',leads.map(l=>l.id)).orderBy('id').execute();}
 return {accounts,relations};
}
export async function mergePreview(database:Kysely<DB>,sourceId:string,destinationId:string){
 if(sourceId===destinationId)throw new QualityValidation('Elegí dos negocios distintos');
 const data=await snapshot(database,sourceId,destinationId);
 const source=data.accounts.find(a=>String(a.id)===sourceId),destination=data.accounts.find(a=>String(a.id)===destinationId);
 if(!source||!destination||source.mergedIntoId||destination.mergedIntoId)throw new QualityConflict('El negocio ya fue fusionado o no existe.');
 const dates=[source.clientSince,destination.clientSince].filter((d):d is Date=>!!d).sort((a,b)=>a.getTime()-b.getTime());
 return {source,destination,token:digest(data),counts:Object.fromEntries(Object.entries(data.relations).map(([k,v])=>[k,v.length])),policy:{doNotContact:source.doNotContact||destination.doNotContact,commercialStatus:source.commercialStatus==='client'||destination.commercialStatus==='client'?'client':'prospect',clientSince:dates[0]?.toISOString()??null},snapshot:data};
}
export async function mutateQuality(database:Kysely<DB>,raw:QualityMutation,user:User,policy?:{businessCreateOnly:true}){
 const input=qualityMutation.parse(raw);
 if(policy&&(input.action!=='import_preview'&&input.action!=='import_confirm'))throw new QualityForbidden('La clave solo permite importar negocios.');
 if(policy&&input.action==='import_preview'&&(input.mode!=='business'||input.rows.length>30||input.rows.some(r=>r.asignadoA?.trim())))throw new QualityForbidden('Solo negocios sin asignación, hasta 30 filas.');
 if(policy&&input.action==='import_confirm'&&input.decisions.some(d=>d.action==='update'))throw new QualityForbidden('La clave no permite actualizar negocios.');
 if(input.action.startsWith('merge')&&user.role!=='admin')throw new QualityForbidden('Solo admin puede fusionar negocios.');
 if(input.action==='merge_preview'){const {snapshot:_,...preview}=await mergePreview(database,input.sourceId,input.destinationId);return preview;}
 return database.transaction().execute(async trx=>{
  await setWorkActor(trx,user);
  if(input.action==='import_preview'){
   if(input.obtainedAt&&new Date(input.obtainedAt)>new Date())throw new QualityValidation('Fecha de obtención futura.');
   const config=await qualityConfig(trx);if(input.rows.length>config.maxRows||Buffer.byteLength(JSON.stringify(input.rows))>config.maxFileBytes)throw new QualityValidation('El lote supera los límites configurados.');
   if(user.role!=='admin'&&input.rows.some(r=>r.asignadoA?.trim()))throw new QualityForbidden('Solo admin importa responsables.');
   const values=input.rows.map(r=>Object.fromEntries(importFields.filter(f=>f in r).map(f=>[f,r[f]!])));
   const canonical=values.map(r=>Object.fromEntries(Object.entries(r).filter(([,v])=>v.trim())));
   const fingerprint=digest(input.mode==='business'?{mode:input.mode,rows:canonical}:canonical);const batchId=randomUUID();
   await trx.insertInto('crmImportBatches').values({id:batchId,fingerprint,ownerEmail:user.email,mode:input.mode,source:input.source,sourceUrl:input.sourceUrl??null,obtainedAt:input.obtainedAt??null,rows:json(values)}).onConflict(oc=>oc.column('fingerprint').doNothing()).execute();
   const batch=await trx.selectFrom('crmImportBatches').selectAll().where('fingerprint','=',fingerprint).executeTakeFirstOrThrow();
   if(batch.ownerEmail!==user.email&&user.role!=='admin')throw new QualityConflict('Ese archivo ya tiene un lote. Pedí al administrador revisar el lote existente.');
   return {batchId:batch.id,status:batch.status,mode:batch.mode,source:batch.source,sourceUrl:batch.sourceUrl,rows:await reviewRows(trx,values,batch.mode),result:batch.result??undefined};
  }
  if(input.action==='import_confirm'){
   const batch=await trx.selectFrom('crmImportBatches').selectAll().where('id','=',input.batchId).forUpdate().executeTakeFirstOrThrow();
   if(policy&&(batch.mode!=='business'||batch.ownerEmail!==user.email))throw new QualityForbidden('Lote no autorizado para esta clave.');
   if(batch.ownerEmail!==user.email&&user.role!=='admin')throw new QualityForbidden('Lote de otro usuario.');
   if(batch.status==='completed')return batch.result;
   // Bounded manual imports serialize against writers to recheck duplicates and previews safely.
   await sql`LOCK TABLE crm_accounts, leads IN SHARE ROW EXCLUSIVE MODE`.execute(trx);
   const values=z.array(z.record(z.string())).parse(batch.rows);const review=await reviewRows(trx,values,batch.mode);
   if(policy&&(values.length>30||values.some(r=>r.asignadoA?.trim())))throw new QualityForbidden('Solo negocios sin asignación, hasta 30 filas.');
   if(input.decisions.length!==review.length||new Set(input.decisions.map(d=>d.index)).size!==review.length||input.decisions.some(d=>d.index>=review.length))throw new QualityValidation('Revisá todas las filas una sola vez.');
   const result:ImportResult={batchId:batch.id,imported:0,updated:0,skipped:0,errors:0,details:[]};
   const selectedTargets=new Set<string>();
   for(const row of review){
    const d=input.decisions.find(d=>d.index===row.index)!;
    if(d.action==='skip'){result.skipped++;result.details.push({index:row.index,action:'skip'});continue;}
    if(policy&&(row.matches.length||row.withinBatch.length))throw new QualityConflict(`Fila ${row.index+1}: coincidencia detectada; omití la fila.`);
    if(row.errors.length)throw new QualityValidation(`Fila ${row.index+1}: ${row.errors.join('; ')}`);
    if((row.warnings.length||row.matches.length||row.withinBatch.length)&&!d.acknowledge)throw new QualityValidation(`Fila ${row.index+1}: confirmá coincidencias y datos ambiguos.`);
    const fields=Object.fromEntries(Object.entries(row.values).filter(([,v])=>v.trim()));
    if(user.role!=='admin'&&fields.asignadoA)throw new QualityForbidden('Solo admin importa responsables.');
    if(d.action==='create'&&batch.mode==='business'){
     const assigned=fields.asignadoA?await trx.selectFrom('users').select('email').where(eb=>eb.or([eb('email','=',fields.asignadoA.trim()),eb('displayName','=',fields.asignadoA.trim())])).executeTakeFirstOrThrow():null;
     const data=Object.fromEntries(Object.entries(fields).filter(([f])=>(businessFields as readonly string[]).includes(f)));
     const account=await trx.insertInto('crmAccounts').values({...data,nombre:fields.nombre,assignedUserEmail:assigned?.email??null}).returningAll().executeTakeFirstOrThrow();
     await evidence(trx,String(account.id),data,user,{source:batch.source,sourceUrl:batch.sourceUrl,obtainedAt:batch.obtainedAt?.toISOString()},batch.id);
     await trx.insertInto('crmCommercialJournal').values({accountId:String(account.id),action:'account_created',actorEmail:user.email,actorName:user.displayName,metadata:json({after:account,batchId:batch.id,source:batch.source})}).execute();
     result.imported++;result.details.push({index:row.index,action:'create',id:String(account.id),accountId:String(account.id),entity:'business'});
    }else if(d.action==='create'){
     const data:Insertable<Leads>={nombre:fields.nombre,creadoPor:user.displayName,quienCargo:user.displayName};
     for(const [f,v] of Object.entries(fields)){
      if(f==='asignadoA'){const u=await trx.selectFrom('users').select('email').where('email','=',v.trim()).executeTakeFirst()??await trx.selectFrom('users').select('email').where('displayName','=',v.trim()).executeTakeFirstOrThrow();data.assignedUserEmail=u.email;data.asignadoA=v;}
      else if(f.startsWith('fecha'))Object.assign(data,{[f]:new Date(validDate(v.trim())!+'T12:00:00Z')});
      else if(f==='clientePotencialRecurrente')data.clientePotencialRecurrente=['true','si','sí','1','yes'].includes(v.trim().toLowerCase());
      else Object.assign(data,{[f]:v});
     }
     const lead=await trx.insertInto('leads').values(data).returningAll().executeTakeFirstOrThrow();
     await evidence(trx,String(lead.accountId),fields,user,{source:batch.source,sourceUrl:batch.sourceUrl,obtainedAt:batch.obtainedAt?.toISOString()},batch.id,String(lead.id));
     await writeLeadJournal(trx,{leadId:lead.id,leadName:lead.nombre,actor:user,action:'created',metadata:{batchId:batch.id,source:batch.source}});
     result.imported++;result.details.push({index:row.index,action:'create',id:String(lead.id),accountId:String(lead.accountId),entity:'opportunity'});
    }else{
     if(!d.targetId||!d.revision)throw new QualityValidation('Elegí negocio destino para actualizar.');
     if(!row.matches.some(m=>m.id===d.targetId))throw new QualityConflict('El destino ya no coincide con la fila. Revisá el preview.');
     if(selectedTargets.has(d.targetId))throw new QualityValidation('Dos filas actualizan el mismo negocio: unificá las filas primero.');selectedTargets.add(d.targetId);
     const account=await trx.selectFrom('crmAccounts').selectAll().where('id','=',d.targetId).where('mergedIntoId','is',null).forUpdate().executeTakeFirstOrThrow();
     if(account.updatedAt.toISOString()!==d.revision)throw new QualityConflict(`Fila ${row.index+1}: el destino cambió. Generá el preview nuevamente.`);
     if(user.role!=='admin'&&account.assignedUserEmail!==user.email)throw new QualityForbidden('Solo podés actualizar tus negocios asignados.');
     const unsupported=Object.keys(fields).filter(f=>!(businessFields as readonly string[]).includes(f));
     if(unsupported.length)throw new QualityValidation(`Fila ${row.index+1}: actualizar negocio solo acepta datos generales; quitá ${unsupported.map(f=>dataFieldLabels[f]||f).join(', ')} del mapeo o creá/omití la fila.`);
     const classification=await classificationErrors(trx,fields.tipo??account.tipo,fields.subtipo??account.subtipo,account);
     if(classification.length)throw new QualityValidation(classification.join(' '));
     const after=await trx.updateTable('crmAccounts').set({...fields,updatedAt:new Date()}).where('id','=',d.targetId).returningAll().executeTakeFirstOrThrow();
     await evidence(trx,d.targetId,fields,user,{source:batch.source,sourceUrl:batch.sourceUrl,obtainedAt:batch.obtainedAt?.toISOString()},batch.id);
     await trx.insertInto('crmCommercialJournal').values({accountId:d.targetId,action:'import_updated',actorEmail:user.email,actorName:user.displayName,metadata:json({before:account,after,batchId:batch.id})}).execute();
     result.updated++;result.details.push({index:row.index,action:'update',id:d.targetId});
    }
   }
   await trx.updateTable('crmImportBatches').set({status:'completed',completedAt:new Date(),result:json(result),decisions:json(input.decisions)}).where('id','=',batch.id).execute();
   return result;
  }
  if(input.action==='merge_confirm'){
   // Freeze all affected relationships, including legacy writers and JSON contact references.
   await sql`LOCK TABLE crm_accounts,leads,crm_contacts,crm_tasks,crm_activities,crm_objections,crm_pipeline_events,crm_data_evidence,crm_commercial_journal,lead_journal,crm_work_journal,lead_notes,email_outbox,crm_messages,crm_contact_restrictions,crm_sequence_runs,crm_documents,crm_document_links,crm_document_versions IN SHARE ROW EXCLUSIVE MODE`.execute(trx);
   const p=await mergePreview(trx,input.sourceId,input.destinationId);
   if(p.token!==input.token)throw new QualityConflict('Cambió el negocio o sus relaciones. Revisá un nuevo preview antes de fusionar.');
   if(businessFields.some(f=>!input.selections[f]))throw new QualityValidation('Elegí el valor de cada campo.');
   const fields=Object.fromEntries(businessFields.map(f=>[f,p[input.selections[f]!][f]]));
   if(!String(fields.nombre??'').trim())throw new QualityValidation('Nombre obligatorio');
   await sql`SET CONSTRAINTS ALL DEFERRED`.execute(trx);
   const sourceHasPrimary=await trx.selectFrom('crmContacts').select('id').where('accountId','=',input.sourceId).where('isPrimary','=',true).where('deletedAt','is',null).executeTakeFirst();
   const destHasPrimary=await trx.selectFrom('crmContacts').select('id').where('accountId','=',input.destinationId).where('isPrimary','=',true).where('deletedAt','is',null).executeTakeFirst();
   if(sourceHasPrimary&&destHasPrimary)await trx.updateTable('crmContacts').set({isPrimary:false,updatedAt:new Date()}).where('id','=',sourceHasPrimary.id).execute();
   await trx.updateTable('crmContacts').set({accountId:input.destinationId,updatedAt:new Date()}).where('accountId','=',input.sourceId).execute();
   await trx.updateTable('leads').set({accountId:input.destinationId,...Object.fromEntries(legacyBusinessFields.map(f=>[f,p.destination[f]])),updatedAt:new Date()}).where('accountId','=',input.sourceId).execute();
   for(const table of ['crmTasks','crmActivities','crmDataEvidence'] as const)await trx.updateTable(table).set({accountId:input.destinationId}).where('accountId','=',input.sourceId).execute();
   for(const table of ['crm_objections','crm_pipeline_events','crm_messages','crm_contact_restrictions','crm_sequence_runs','crm_documents','crm_document_links'])await sql`UPDATE ${sql.table(table)} SET account_id=${input.destinationId}::bigint WHERE account_id=${input.sourceId}::bigint`.execute(trx);
   const after=await trx.updateTable('crmAccounts').set({...fields,doNotContact:p.policy.doNotContact,commercialStatus:p.policy.commercialStatus as 'client'|'prospect',clientSince:p.policy.clientSince,updatedAt:new Date()}).where('id','=',input.destinationId).returningAll().executeTakeFirstOrThrow();
   await trx.insertInto('crmAccountMerges').values({sourceId:input.sourceId,destinationId:input.destinationId,actorEmail:user.email,reason:input.reason,snapshot:json(p.snapshot),selections:json(input.selections)}).execute();
   await trx.insertInto('crmCommercialJournal').values({accountId:input.destinationId,action:'account_merged',actorEmail:user.email,actorName:user.displayName,metadata:json({sourceId:input.sourceId,reason:input.reason,before:p.destination,after})}).execute();
   await trx.updateTable('crmAccounts').set({mergedIntoId:input.destinationId,mergedAt:new Date(),updatedAt:new Date()}).where('id','=',input.sourceId).execute();
   await sql`SET CONSTRAINTS ALL IMMEDIATE`.execute(trx);
   return {id:input.destinationId};
  }
  const account=await trx.selectFrom('crmAccounts').selectAll().where('id','=',input.accountId).where('mergedIntoId','is',null).forUpdate().executeTakeFirstOrThrow();
  if(user.role!=='admin'&&account.assignedUserEmail!==user.email)throw new QualityForbidden('Solo podés verificar datos de tus negocios asignados.');
  if(input.contactId&&input.leadId)throw new QualityValidation('Elegí un único alcance.');
  const contact=input.contactId?await trx.selectFrom('crmContacts').selectAll().where('id','=',input.contactId).where('accountId','=',input.accountId).where('deletedAt','is',null).executeTakeFirstOrThrow():null;
  const lead=input.leadId?await trx.selectFrom('leads').selectAll().where('id','=',input.leadId).where('accountId','=',input.accountId).executeTakeFirstOrThrow():null;
  const entity=contact??lead??account;
  const allowed=contact?['name','phone','email','position','preferredChannel']:lead?importFields:businessFields;
  if(!(allowed as readonly string[]).includes(input.field))throw new QualityValidation('Campo fuera del alcance.');
  if(entity.updatedAt.toISOString()!==input.revision)throw new QualityConflict('El dato cambió. Actualizá y revisá nuevamente.');
  for(const date of [input.obtainedAt,input.verifiedAt])if(date&&new Date(date)>new Date())throw new QualityValidation('No se permite una fecha futura.');
  const value=String(entity[input.field as keyof typeof entity]??'')||null,n=normalizeField(input.field,value);
  await trx.insertInto('crmDataEvidence').values({accountId:input.accountId,originalAccountId:input.accountId,contactId:input.contactId??null,leadId:input.leadId??null,field:input.field,originalValue:value,normalizedValue:n.normalized,source:input.source,sourceUrl:input.sourceUrl??null,obtainedAt:input.obtainedAt??null,verifiedAt:input.verifiedAt??null,validity:input.validity,observations:input.observations,actorEmail:user.email}).execute();
  return {id:input.accountId};
 });
}
