import {templateCompatibility} from './messageTemplatePolicy';
import {assertAccountReadable,assertLeadAccess} from './crmPermissions';
import {localDay} from './workDates';
import {calendarDay} from './workDates';
import {createHash} from 'node:crypto';
import {sql,type Kysely,type Transaction} from 'kysely';
import {z} from 'zod';
import type {DB} from './schema';
import type {User} from './User';
import type {Message,CommunicationMutation} from '../endpoints/communication.schema';
import {normalizeField} from './dataNormalization';
import {resolveCommercialContact} from './commercialContact';
import {renderMessageTemplate,renderMessageTemplateHtml,htmlToPlainText} from './renderMessageTemplate';
import {htmlToWhatsApp} from './templateChannelFormatting';
import {buildHospedaEmailHtml,buildHospedaEmailText} from './hospedaEmailLayout';
import {setWorkActor} from './workAudit';
import {writeLeadJournal} from './writeLeadJournal';
type Executor=Kysely<DB>|Transaction<DB>;
export class CommunicationForbidden extends Error{}
export class CommunicationConflict extends Error{}
export const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const json=(v:unknown)=>JSON.stringify(v);
export async function lockCommunication(e:Executor){await sql`LOCK TABLE crm_accounts,leads,crm_contact_restrictions,crm_sequence_runs,crm_messages IN SHARE ROW EXCLUSIVE MODE`.execute(e);}
export async function communicationConfig(e:Executor){const r=await e.selectFrom('appSettings').select('value').where('key','=','crm_communication').executeTakeFirstOrThrow();return z.object({recentContactHours:z.number().int().min(1).max(720),maxDocumentBytes:z.number().int().min(1).max(2097152)}).parse(JSON.parse(r.value));}
export async function leadFor(e:Executor,id:string,user:User,write=true){const l=await e.selectFrom('leads').selectAll().where('id','=',id).where('deletedAt','is',null).executeTakeFirstOrThrow();const a=await e.selectFrom('crmAccounts').selectAll().where('id','=',l.accountId).where('mergedIntoId','is',null).executeTakeFirstOrThrow();assertAccountReadable(user,a);if(write)await assertLeadAccess(e,String(l.id),user,true);return {lead:l,account:a};}
export async function assertContactAllowed(e:Executor,leadId:string,contactId:string|null,channel:string){const l=await e.selectFrom('leads').selectAll().where('id','=',leadId).where('deletedAt','is',null).executeTakeFirstOrThrow();const a=await e.selectFrom('crmAccounts').selectAll().where('id','=',l.accountId).where('mergedIntoId','is',null).executeTakeFirstOrThrow();await resolveCommercialContact(e,l,contactId);if(a.doNotContact)throw new CommunicationForbidden('El negocio tiene una restricción de no contactar.');const r=await sql<{reason:string}>`SELECT reason FROM crm_contact_restrictions WHERE account_id=${l.accountId} AND lifted_at IS NULL AND channel IN (${channel},'all') AND ((contact_id=${contactId}::bigint AND ${contactId}::bigint IS NOT NULL) OR (contact_id IS NULL AND lead_id=${leadId}::bigint)) LIMIT 1`.execute(e);if(r.rows.length)throw new CommunicationForbidden('No contactar: '+r.rows[0].reason);}
export async function messageFor(e:Executor,id:string,user:User,lock=false){const r=await sql<Message>`SELECT * FROM crm_messages WHERE id=${id}::uuid ${lock?sql`FOR UPDATE`:sql``}`.execute(e);const m=r.rows[0];if(!m)throw new Error('Mensaje inexistente');if(user.role!=='admin'&&m.ownerEmail!==user.email)throw new CommunicationForbidden('Borrador de otro usuario.');if(!m.leadId)throw new Error('La gestión ya no existe');await leadFor(e,m.leadId,user);return m;}
async function prepare(e:Executor,input:Extract<CommunicationMutation,{action:'prepare'}>,user:User,runId:string|null=null,index:number|null=null,taskId:string|null=null){
 const existing=(await sql<Message>`SELECT * FROM crm_messages WHERE id=${input.id}::uuid`.execute(e)).rows[0];if(existing){await messageFor(e,input.id,user);return existing;}
 const {lead}=await leadFor(e,input.leadId,user);await assertContactAllowed(e,input.leadId,input.contactId,input.channel);
 const c=await resolveCommercialContact(e,lead,input.contactId);const recipient=(input.channel==='email'?c.email:c.phone)?.trim();if(!recipient)throw new Error('El contacto no tiene este canal');
 const t=input.templateId?await e.selectFrom('messageTemplates').selectAll().where('id','=',input.templateId).where('active','=',true).executeTakeFirstOrThrow():null;
 const incompatibility=t?templateCompatibility(t,{channel:input.channel,vertical:lead.tipo,commercialProfile:lead.commercialProfile}):null;
 if(incompatibility)throw new Error(incompatibility);
 if(!runId){const reusable=(await sql<Message>`SELECT * FROM crm_messages WHERE lead_id=${lead.id} AND contact_id IS NOT DISTINCT FROM ${c.contactId}::bigint AND channel=${input.channel} AND recipient=${recipient} AND owner_email=${user.email} AND status='draft' AND run_id IS NULL AND (template_snapshot->>'id') IS NOT DISTINCT FROM ${input.templateId}::text ORDER BY updated_at DESC LIMIT 1 FOR UPDATE`.execute(e)).rows[0];if(reusable)return reusable;}
 const ctx={name:lead.nombre,contact:c.name,contact_name:c.name,city:lead.ciudad,type:lead.tipo,subtype:lead.subtipo,phone:c.phone,email:c.email,website:lead.sitioWeb,sender:user.fullName?.trim()||user.displayName,sender_short:user.displayName};
 const rendered=t?renderMessageTemplateHtml(t.body,ctx):'<p></p>';
 const body=input.channel==='whatsapp'?htmlToWhatsApp(rendered).normalize('NFC'):rendered;
 const subject=t?renderMessageTemplate(t.subject??'',ctx):'';
 const snapshot=t?{...t,version:digest({body:t.body,subject:t.subject,updatedAt:t.updatedAt}),context:ctx}:null;
 return (await sql<Message>`INSERT INTO crm_messages(id,account_id,original_account_id,lead_id,contact_id,channel,recipient,recipient_name,subject,body,template_snapshot,owner_email,run_id,step_index,task_id) VALUES(${input.id}::uuid,${lead.accountId},${lead.accountId},${lead.id},${c.contactId},${input.channel},${recipient},${c.name??''},${subject},${body},${json(snapshot)}::text::jsonb,${user.email},${runId}::uuid,${index},${taskId}) RETURNING *`.execute(e)).rows[0];
}
export async function renderFinal(e:Executor,m:Message,user:User){const {lead}=await leadFor(e,m.leadId!,user);const sender=user.fullName?.trim()||user.displayName;return {htmlBody:buildHospedaEmailHtml({bodyHtml:m.body,senderName:sender,subject:m.subject,vertical:lead.tipo,commercialProfile:lead.commercialProfile,logoUrl:(process.env.PUBLIC_APP_URL??'http://localhost:3001').replace(/\/$/,'')+'/hospeda-logo.jpg'}),textBody:buildHospedaEmailText({bodyText:htmlToPlainText(m.body),senderName:sender})};}
async function activity(e:Executor,m:Message,user:User,result:string){
 const {lead}=await leadFor(e,m.leadId!,user);
 const current=(await sql<{activityId:string|null;status:string}>`SELECT activity_id,status FROM crm_messages WHERE id=${m.id}::uuid`.execute(e)).rows[0];
 const existingId=current?.activityId??m.activityId;
 if(existingId){const providerResult=result.startsWith('Email aceptado')||result==='Rechazo de Brevo';if(!(providerResult&&['replied','rejected'].includes(current?.status??'')))await e.updateTable('crmActivities').set({result,updatedAt:new Date()}).where('id','=',existingId).execute();return existingId;}
 const a=await e.insertInto('crmActivities').values({accountId:lead.accountId,leadId:lead.id,typeId:m.channel==='whatsapp'?'other':'message',title:m.channel==='whatsapp'?'Comunicación WhatsApp':'Comunicación email',channel:m.channel,result,occurredAt:new Date(),contactIds:m.contactId?[m.contactId]:[],participants:m.recipientName,actorEmail:user.email,notes:'Snapshot de mensaje #'+m.id}).returning('id').executeTakeFirstOrThrow();
 await sql`UPDATE crm_messages SET activity_id=${a.id} WHERE id=${m.id}::uuid`.execute(e);
 await writeLeadJournal(e as Transaction<DB>,{leadId:lead.id,leadName:lead.nombre,actor:user,action:'contact_logged',metadata:{activityId:a.id,messageId:m.id,channel:m.channel,result,template:m.templateSnapshot?.name??null}});return a.id;
}
export async function mutateCommunication(db:Kysely<DB>,input:CommunicationMutation,user:User){
 if(input.action==='dispatch')return dispatch(db,input,user);
 return db.transaction().execute(async e=>{
 await setWorkActor(e,user);
 // Serialize against fusion and concurrent restrictions/sequence starts.
 await lockCommunication(e);
 if(input.action==='prepare')return prepare(e,input,user);
 if(input.action==='cancel_draft'){
  const m=await messageFor(e,input.id,user,true);if(m.status!=='draft'||m.revision!==input.revision)throw new CommunicationConflict('El borrador cambió o ya fue utilizado.');
  if(m.runId)throw new Error('Este borrador pertenece a un seguimiento. Cancelá o pausá el seguimiento para conservar sus pasos.');
  return (await sql<Message>`UPDATE crm_messages SET status='cancelled',revision=revision+1,updated_at=now() WHERE id=${m.id}::uuid RETURNING *`.execute(e)).rows[0];
 }
 if(input.action==='edit'){
  const m=await messageFor(e,input.id,user,true);if(m.status!=='draft'||m.revision!==input.revision)throw new CommunicationConflict('El borrador cambió o ya fue utilizado.');
  await assertContactAllowed(e,m.leadId!,m.contactId,m.channel);
  const updated={...m,subject:input.subject.trim(),body:input.body};if(m.channel==='email'&&!updated.subject)throw new Error('Asunto obligatorio');if(!input.body.trim())throw new Error('Mensaje vacío');
  // Content is sanitized separately before preview and sending.
  const body=m.channel==='email'?sanitizeEmail(input.body):input.body;
  const final=await renderFinal(e,{...updated,body},user);
  return (await sql<Message>`UPDATE crm_messages SET subject=${updated.subject},body=${body},html_body=${m.channel==='email'?final.htmlBody:null},text_body=${m.channel==='email'?final.textBody:body},revision=revision+1,updated_at=now() WHERE id=${m.id}::uuid RETURNING *`.execute(e)).rows[0];
 }
 if(input.action==='outcome'){
  const m=await messageFor(e,input.id,user,true);
  if(input.event==='manual_sent'&&(m.channel!=='whatsapp'||!['whatsapp_opened','manual_sent'].includes(m.status)))throw new Error('Primero abrí WhatsApp');
  if(input.event!=='manual_sent'&&['draft','cancelled'].includes(m.status))throw new Error('El mensaje todavía no fue utilizado');
  if(input.event==='manual_sent')await assertContactAllowed(e,m.leadId!,m.contactId,m.channel);
  const status=input.event==='replied'?'replied':input.event==='rejected'?'rejected':'manual_sent';
  await sql`UPDATE crm_messages SET status=${status},last_interaction_at=now(),last_actor_email=${user.email},revision=revision+1,updated_at=now() WHERE id=${m.id}::uuid`.execute(e);
  const aid=await activity(e,m,user,input.event==='replied'?'Respuesta registrada manualmente':input.event==='rejected'?'Rechazo registrado manualmente':'Envío confirmado manualmente');
  await e.updateTable('crmActivities').set({typeId:'message',notes:input.notes,updatedAt:new Date()}).where('id','=',aid).execute();
  if(input.event!=='manual_sent')await sql`SELECT crm_stop_sequences(${m.leadId}::bigint,${input.event==='replied'?'Respuesta registrada':'Rechazo registrado'})`.execute(e);
  if(m.taskId&&input.event==='manual_sent')await e.updateTable('crmTasks').set({status:'completed',completedAt:new Date(),result:'Envío confirmado manualmente',updatedAt:new Date()}).where('id','=',m.taskId).where('status','=','pending').execute();
  await finishRuns(e);return {message:(await sql<Message>`SELECT * FROM crm_messages WHERE id=${m.id}::uuid`.execute(e)).rows[0]};
 }
 if(input.action==='restrict'){
  const {lead}=await leadFor(e,input.leadId,user);await resolveCommercialContact(e,lead,input.contactId);
  await sql`INSERT INTO crm_contact_restrictions(account_id,lead_id,contact_id,channel,reason,actor_email) VALUES(${lead.accountId},${lead.id},${input.contactId},${input.channel},${input.reason},${user.email})`.execute(e);
  const runs=(await sql<{leadId:string}>`SELECT DISTINCT lead_id FROM crm_sequence_runs r WHERE account_id=${lead.accountId} AND (contact_id=${input.contactId}::bigint OR (contact_id IS NULL AND lead_id=${lead.id})) AND status IN ('active','paused')`.execute(e)).rows;
  for(const r of runs)await sql`SELECT crm_stop_sequences(${r.leadId}::bigint,'Restricción de contacto')`.execute(e);
  return {ok:true};
 }
 if(input.action==='lift'){
  if(user.role!=='admin')throw new CommunicationForbidden('Solo admin puede levantar una restricción');
  await sql`UPDATE crm_contact_restrictions SET lifted_at=now(),lifted_by=${user.email},lift_reason=${input.reason} WHERE id=${input.id} AND lifted_at IS NULL`.execute(e);return {ok:true};
 }
 if(input.action==='sequence_save'){
  if(user.role!=='admin')throw new CommunicationForbidden('Solo admin configura secuencias');
  for(const s of input.steps){const t=await e.selectFrom('messageTemplates').selectAll().where('id','=',s.templateId).where('active','=',true).executeTakeFirstOrThrow();if(t.channel!==s.channel)throw new Error('Canal incompatible');}
  if(input.id)await sql`UPDATE crm_sequences SET name=${input.name},scope=${input.scope},steps=${json(input.steps)}::text::jsonb,active=${input.active},updated_at=now() WHERE id=${input.id}`.execute(e);
  else await sql`INSERT INTO crm_sequences(name,scope,steps,active,owner_email) VALUES(${input.name},${input.scope},${json(input.steps)}::text::jsonb,${input.active},${user.email})`.execute(e);return {ok:true};
 }
 if(input.action==='sequence_start'){
  const existing=(await sql<{id:string;ownerEmail:string}>`SELECT * FROM crm_sequence_runs WHERE id=${input.id}::uuid`.execute(e)).rows[0];if(existing){if(existing.ownerEmail!==user.email&&user.role!=='admin')throw new CommunicationForbidden('Ejecución ajena');return existing;}
  const {lead,account}=await leadFor(e,input.leadId,user);
  const stage=(await sql<{classification:string}>`SELECT classification FROM crm_stages WHERE name=${lead.estado??''}`.execute(e)).rows[0];if(stage?.classification!=='open')throw new Error('La gestión debe estar abierta');
  const seq=(await sql<{id:string;name:string;scope:string;steps:any[]}>`SELECT * FROM crm_sequences WHERE id=${input.sequenceId} AND active`.execute(e)).rows[0];if(!seq)throw new Error('Secuencia inactiva');
  if((await sql`SELECT id FROM crm_sequence_runs WHERE lead_id=${lead.id} AND coalesce(contact_id,0)=coalesce(${input.contactId}::bigint,0) AND status IN ('active','paused')`.execute(e)).rows.length)throw new CommunicationConflict('Ya hay una secuencia activa para este contacto');
  for(const s of seq.steps)await assertContactAllowed(e,lead.id,input.contactId,s.channel);
  await sql`INSERT INTO crm_sequence_runs(id,account_id,original_account_id,lead_id,contact_id,sequence_id,snapshot,owner_email) VALUES(${input.id}::uuid,${lead.accountId},${lead.accountId},${lead.id},${input.contactId},${seq.id},${json(seq)}::text::jsonb,${user.email})`.execute(e);
  let days=0;for(const [i,s] of seq.steps.entries()){
   days+=s.waitDays;
   const due=(await sql<{day:string}>`SELECT to_char((now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date+${days}::integer,'YYYY-MM-DD') AS day`.execute(e)).rows[0].day;
   const task=await e.insertInto('crmTasks').values({accountId:lead.accountId,leadId:lead.id,title:seq.name+' · Paso '+(i+1),description:'Secuencia asistida: preparar y revisar el borrador. Nunca envía automáticamente.',typeId:'followup',dueDate:due,assignedUserEmail:lead.assignedUserEmail??user.email,contactIds:input.contactId?[input.contactId]:[]}).returning('id').executeTakeFirstOrThrow();
   const mid=digest(input.id+':'+i).slice(0,32).replace(/^(........)(....)(....)(....)(............)$/,'$1-$2-$3-$4-$5');
   await prepare(e,{action:'prepare',id:mid,leadId:lead.id,contactId:input.contactId,channel:s.channel,templateId:s.templateId},user,input.id,i,task.id);
  }return {id:input.id};
 }
 const run=(await sql<{id:string;leadId:string;ownerEmail:string;status:string}>`SELECT * FROM crm_sequence_runs WHERE id=${input.id}::uuid FOR UPDATE`.execute(e)).rows[0];if(!run)throw new Error('Secuencia inexistente');await leadFor(e,run.leadId,user);if(!['active','paused'].includes(run.status))throw new CommunicationConflict('Ejecución finalizada');
 if(input.state==='active'){for(const m of (await sql<Message>`SELECT * FROM crm_messages WHERE run_id=${run.id}::uuid AND status='draft'`.execute(e)).rows)await assertContactAllowed(e,m.leadId!,m.contactId,m.channel);}
 await sql`UPDATE crm_sequence_runs SET status=${input.state},reason=${input.reason},updated_at=now() WHERE id=${run.id}::uuid`.execute(e);
 if(input.state==='active'){
  if(!input.resumeDate)throw new Error('Elegí la fecha del próximo paso para reanudar.');
  if(input.resumeDate<localDay())throw new Error('La fecha para reanudar no puede estar vencida.');
  await sql`WITH remaining AS (SELECT t.id,t.due_date,min(t.due_date) OVER () first_day FROM crm_tasks t JOIN crm_messages m ON m.task_id=t.id WHERE m.run_id=${run.id}::uuid AND m.status='draft' AND t.result='Secuencia pausada' AND t.status='cancelled') UPDATE crm_tasks t SET due_date=${input.resumeDate}::date+(r.due_date-r.first_day),due_at=NULL FROM remaining r WHERE t.id=r.id`.execute(e);
 }
 if(input.state==='active')await sql`UPDATE crm_tasks SET status='pending',result=NULL,updated_at=now() WHERE result='Secuencia pausada' AND status='cancelled' AND id IN (SELECT task_id FROM crm_messages WHERE run_id=${run.id}::uuid AND status='draft')`.execute(e);
 else await sql`UPDATE crm_tasks SET status='cancelled',result=${input.state==='paused'?'Secuencia pausada':'Secuencia cancelada'},updated_at=now() WHERE status='pending' AND id IN (SELECT task_id FROM crm_messages WHERE run_id=${run.id}::uuid)`.execute(e);
 if(input.state==='cancelled')await sql`UPDATE crm_messages SET status='cancelled',updated_at=now() WHERE run_id=${run.id}::uuid AND status='draft'`.execute(e);
 return {ok:true};
 });
}
// Allow only formatting supported by the editor; strip all other attributes/tags.
export function sanitizeEmail(source:string){return source.replace(/<(script|style|iframe|object)[\s\S]*?<\/\1\s*>/gi,'').replace(/<\/?([a-z0-9]+)\b[^>]*>/gi,(tag,name)=>{const n=String(name).toLowerCase();if(!['p','br','strong','b','em','i','s','u','ul','ol','li','blockquote','h1','h2','h3','hr','a'].includes(n))return '';if(tag.startsWith('</'))return '</'+n+'>';if(n==='a'){const match=tag.match(/href\s*=\s*["']([^"']*)["']/i);let href='';try{const u=new URL(match?.[1]??'');if(['https:','http:','mailto:'].includes(u.protocol))href=u.href.replaceAll('"','&quot;');}catch{}return href?'<a href="'+href+'">':'<a>'; }return '<'+n+'>';});}
async function finishRuns(e:Executor){await sql`UPDATE crm_sequence_runs r SET status='completed',reason='Todos los pasos utilizados',updated_at=now() WHERE status='active' AND NOT EXISTS(SELECT 1 FROM crm_messages m WHERE m.run_id=r.id AND m.status IN ('draft','submitting','unknown','whatsapp_opened','failed'))`.execute(e);}
async function dispatch(database:Kysely<DB>,input:Extract<CommunicationMutation,{action:'dispatch'}>,user:User){
 const claimed=await database.transaction().execute(async e=>{
  await setWorkActor(e,user);await lockCommunication(e);
  const m=await messageFor(e,input.id,user,true);
  if(m.status!=='draft'){if(['submitting','unknown'].includes(m.status))throw new CommunicationConflict('Envío en curso o resultado incierto. No se reenvía: reconciliá con Brevo.');return {message:m,replay:true};}
  if(m.revision!==input.revision||!m.body.trim()||(m.channel==='email'&&(!m.htmlBody||!m.subject)))throw new CommunicationConflict('Guardá y revisá la vista previa final antes de enviar');
  await assertContactAllowed(e,m.leadId!,m.contactId,m.channel);
  const currentLead=(await leadFor(e,m.leadId!,user)).lead;const currentContact=await resolveCommercialContact(e,currentLead,m.contactId);if((m.channel==='email'?currentContact.email:currentContact.phone)?.trim()!==m.recipient)throw new CommunicationConflict('Cambió el canal del contacto. Prepará un nuevo borrador.');
  if(m.channel==='email'&&!z.string().email().safeParse(m.recipient).success)throw new Error('Email inválido');
  if(m.runId){if((await sql`SELECT id FROM crm_messages WHERE run_id=${m.runId}::uuid AND step_index<${m.stepIndex} AND status NOT IN ('manual_sent','accepted','delivery_confirmed')`.execute(e)).rows.length)throw new Error('Completá los pasos anteriores antes de continuar');const r=(await sql<{status:string}>`SELECT status FROM crm_sequence_runs WHERE id=${m.runId}::uuid`.execute(e)).rows[0];if(r?.status!=='active')throw new CommunicationForbidden('La secuencia está pausada o detenida');const task=await e.selectFrom('crmTasks').selectAll().where('id','=',m.taskId!).executeTakeFirstOrThrow();const today=(await sql<{day:string}>`SELECT to_char((now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,'YYYY-MM-DD') AS day`.execute(e)).rows[0].day;if(task.deletedAt||task.status!=='pending')throw new CommunicationConflict('La tarea del paso ya no está pendiente');if(calendarDay(task.dueDate)>today||(task.dueAt&&new Date(task.dueAt)>new Date()))throw new Error('El paso todavía está en espera');}
  if(m.channel==='whatsapp'){
   const normalized=normalizeField('telefono',m.recipient);const phone=normalized.normalized?.replace(/\D/g,'')??'';if(normalized.validity!=='valid'||phone.length<10||phone.length>15)throw new Error('Revisá el teléfono con código de país');
   await sql`UPDATE crm_messages SET status='whatsapp_opened',last_interaction_at=now(),last_actor_email=${user.email},revision=revision+1,updated_at=now() WHERE id=${m.id}::uuid`.execute(e);await activity(e,m,user,'WhatsApp abierto · envío no confirmado');return {message:{...m,status:'whatsapp_opened'},replay:false};
  }
  if(!process.env.BREVO_API_KEY)throw new Error('BREVO_API_KEY no configurada');
  const settings=await e.selectFrom('appSettings').selectAll().where('key','in',['brevo_sender_name','brevo_sender_email','brevo_reply_to_email']).execute();const cfg=Object.fromEntries(settings.map(s=>[s.key,s.value]));const su=await e.selectFrom('users').select('senderEmail').where('id','=',user.id).executeTakeFirstOrThrow();const senderEmail=su.senderEmail?.trim()||cfg.brevo_sender_email;if(!senderEmail)throw new Error('Remitente Brevo no configurado');
  const out=await e.insertInto('emailOutbox').values({leadId:m.leadId,templateId:m.templateSnapshot?.id??null,recipientEmail:m.recipient,recipientName:m.recipientName||null,senderEmail,senderName:su.senderEmail?user.displayName:cfg.brevo_sender_name||'Hospeda',replyToEmail:su.senderEmail||cfg.brevo_reply_to_email||null,subject:m.subject,htmlBody:m.htmlBody!,textBody:m.textBody!,status:'submitting',attempts:1,requestedByUserId:user.id,requestedByEmail:user.email,requestedByName:user.displayName}).returningAll().executeTakeFirstOrThrow();
  await sql`UPDATE email_outbox SET request_key=${m.id}::uuid WHERE id=${out.id}`.execute(e);
  await sql`UPDATE crm_messages SET status='submitting',outbox_id=${out.id},last_interaction_at=now(),last_actor_email=${user.email},revision=revision+1,updated_at=now() WHERE id=${m.id}::uuid`.execute(e);
  return {message:{...m,outboxId:out.id},outbox:out,replay:false};
 });
 const m=claimed.message;
 if(claimed.replay)return {message:m};
 if(m.channel==='whatsapp'){const url=new URL('https://wa.me/'+normalizeField('telefono',m.recipient).normalized!.replace(/\D/g,''));url.searchParams.set('text',m.body);return {message:m,url:url.toString()};}
 const out=claimed.outbox!;let accepted=false;
 try{
  const r=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',signal:AbortSignal.timeout(20000),headers:{'api-key':process.env.BREVO_API_KEY!,'Content-Type':'application/json',accept:'application/json'},body:JSON.stringify({sender:{email:out.senderEmail,name:out.senderName},to:[{email:m.recipient,...(m.recipientName?{name:m.recipientName}:{})}],...(out.replyToEmail?{replyTo:{email:out.replyToEmail}}:{}),subject:m.subject,htmlContent:m.htmlBody,textContent:m.textBody,tags:['hospeda-'+m.id],headers:{'X-Mailin-custom':'hospeda_outbox:'+out.id}})});
  if(!r.ok){const reason=(await r.text()).slice(0,2000);await database.transaction().execute(async e=>{await lockCommunication(e);await setWorkActor(e,user);await sql`UPDATE email_outbox SET status='error',last_error=${reason},updated_at=now() WHERE id=${out.id}`.execute(e);await sql`UPDATE crm_messages SET status=CASE WHEN status IN ('replied','rejected') THEN status ELSE 'failed' END,updated_at=now() WHERE id=${m.id}::uuid`.execute(e);await activity(e,m,user,'Rechazo de Brevo');});return {message:(await sql<Message>`SELECT * FROM crm_messages WHERE id=${m.id}::uuid`.execute(database)).rows[0],error:'Brevo rechazó el envío'};}
  accepted=true;const data=await r.json() as {messageId?:string};const messageId=data.messageId??null;
  await database.transaction().execute(async e=>{await lockCommunication(e);await setWorkActor(e,user);await sql`UPDATE email_outbox SET status='accepted',message_id=${messageId},sent_at=now(),updated_at=now() WHERE id=${out.id}`.execute(e);await sql`UPDATE crm_messages SET status=CASE WHEN status IN ('replied','rejected') THEN status ELSE 'accepted' END,updated_at=now() WHERE id=${m.id}::uuid`.execute(e);await activity(e,m,user,'Email aceptado por proveedor · entrega no confirmada');if(m.taskId)await e.updateTable('crmTasks').set({status:'completed',completedAt:new Date(),result:'Aceptado por proveedor',updatedAt:new Date()}).where('id','=',m.taskId).where('status','=','pending').execute();await reconcileEvents(e,out.id);await finishRuns(e);});
  return {message:(await sql<Message>`SELECT * FROM crm_messages WHERE id=${m.id}::uuid`.execute(database)).rows[0]};
 }catch(error){
  // Never turn a post-acceptance error into permission to resend. A crashed process also leaves submitting.
  try{await sql`UPDATE email_outbox SET status='unknown',last_error=${accepted?'Proveedor aceptó; reconciliar resultado':String(error).slice(0,1000)},updated_at=now() WHERE id=${out.id} AND status='submitting'`.execute(database);await sql`UPDATE crm_messages SET status='unknown',updated_at=now() WHERE id=${m.id}::uuid AND status='submitting'`.execute(database);}catch{}
  throw new CommunicationConflict('Resultado incierto. No se reenvía este mensaje: revisar los logs y eventos de Brevo.');
 }
}
export async function reconcileEvents(e:Executor,outboxId:string){
 const out=await e.selectFrom('emailOutbox').selectAll().where('id','=',outboxId).executeTakeFirstOrThrow();
 await sql`UPDATE crm_email_events SET outbox_id=${outboxId} WHERE outbox_id IS NULL AND trim(both '<>' from message_id)=trim(both '<>' from ${out.messageId??''}) AND lower(recipient)=lower(${out.recipientEmail})`.execute(e);
 const events=(await sql<{event:string;occurredAt:Date}>`SELECT event,occurred_at FROM crm_email_events WHERE outbox_id=${outboxId} ORDER BY occurred_at,event`.execute(e)).rows;
 const terminal=events.filter(v=>['delivered','hard_bounce','soft_bounce','blocked','invalid_email','error'].includes(v.event)).at(-1);
 if(terminal){const status=terminal.event==='delivered'?'delivery_confirmed':'failed';await sql`UPDATE email_outbox SET status=${status},updated_at=now() WHERE id=${outboxId}`.execute(e);await sql`UPDATE crm_messages SET status=${status},updated_at=now() WHERE outbox_id=${outboxId} AND status NOT IN ('replied','rejected')`.execute(e);}
 const message=(await sql<Message>`SELECT * FROM crm_messages WHERE outbox_id=${outboxId}`.execute(e)).rows[0];
 if(message&&!message.activityId&&terminal&&message.leadId){const lead=await e.selectFrom('leads').selectAll().where('id','=',message.leadId).where('deletedAt','is',null).executeTakeFirst();if(lead){const a=await e.insertInto('crmActivities').values({accountId:lead.accountId,leadId:lead.id,typeId:'message',title:'Evento email reconciliado',channel:'email',result:terminal.event==='delivered'?'Entrega confirmada por Brevo':'Rebote/fallo: '+terminal.event,occurredAt:terminal.occurredAt,contactIds:message.contactId?[message.contactId]:[],participants:message.recipientName,actorEmail:'brevo-webhook',notes:'Snapshot de mensaje #'+message.id}).returning('id').executeTakeFirstOrThrow();await sql`UPDATE crm_messages SET activity_id=${a.id} WHERE id=${message.id}::uuid`.execute(e);}}
 if(message?.activityId&&terminal&&!['replied','rejected'].includes(message.status))await e.updateTable('crmActivities').set({result:terminal.event==='delivered'?'Entrega confirmada por Brevo':'Rebote/fallo: '+terminal.event,updatedAt:new Date()}).where('id','=',message.activityId).execute();
}
