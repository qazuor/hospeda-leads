import superjson from 'superjson';
import {sql,type Transaction} from 'kysely';
import {z} from 'zod';
import {db} from '../helpers/db';
import type {DB} from '../helpers/schema';
import {getServerUserSession} from '../helpers/getServerUserSession';
import {NotAuthenticatedError} from '../helpers/getSetServerSession';
import {setWorkActor} from '../helpers/workAudit';
import {calendarDay,localDay} from '../helpers/workDates';
import {suggestPriority} from '../helpers/priorityRules';
import {pipelineMutation,priorityRule,type PipelineStage,type PipelineCatalog,type PipelineInsight,type PipelineEvent,type PipelineObjection,type ReactivationRow} from './pipeline.schema';
import {day} from './work.schema';
class Forbidden extends Error {}
class Conflict extends Error {}
const reply=(data:unknown,status=200)=>new Response(superjson.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const fail=(e:unknown)=>reply({error:e instanceof Error?e.message:'No se pudo guardar'},e instanceof NotAuthenticatedError?401:e instanceof Forbidden?403:e instanceof Conflict?409:400);
const query=z.object({leadId:z.string().regex(/^\d+$/).optional(),ids:z.string().regex(/^\d+(,\d+)*$/).optional(),mode:z.enum(['detail','reactivation','config']).default('detail'),from:day.optional(),to:day.optional(),reasonId:z.string().regex(/^\d+$/).optional(),vertical:z.string().max(200).optional(),responsible:z.string().max(320).optional(),handled:z.enum(['yes','no','all']).default('no'),page:z.coerce.number().int().min(1).default(1)});
export async function get(request:Request){
 try{
  const {user}=await getServerUserSession(request);const p=query.parse(Object.fromEntries(new URL(request.url).searchParams));
  if(p.responsible&&user.role!=='admin'&&p.responsible!==user.email)throw new Forbidden('La vista de equipo requiere admin.');
  const [stages,lossReasons,objectionTypes,setting,users,verticals,historicalVerticals]=await Promise.all([
   sql<PipelineStage>`SELECT * FROM crm_stages ORDER BY sort_order,name`.execute(db),sql<PipelineCatalog>`SELECT * FROM crm_loss_reasons ORDER BY name`.execute(db),sql<PipelineCatalog>`SELECT * FROM crm_objection_types ORDER BY name`.execute(db),
   db.selectFrom('appSettings').select('value').where('key','=','crm_priority_rules').executeTakeFirstOrThrow(),db.selectFrom('users').select(['email','displayName']).execute(),db.selectFrom('crmVerticals').select('name').where('active','=',true).execute(),db.selectFrom('leads').select('tipo').distinct().where('tipo','is not',null).execute()
  ]);
  const rules=z.array(priorityRule).parse(JSON.parse(setting.value));
  const ids=p.leadId?[p.leadId]:(p.ids?.split(',')??[]);if(ids.length>100)throw new Error('Máximo 100 oportunidades por consulta.');
  let insights:PipelineInsight[]=[],events:PipelineEvent[]=[],objections:PipelineObjection[]=[];
  if(ids.length){
   const {rows}=await sql<PipelineInsight&{estado:string|null;classification:string;fechaProximaAccion:Date|null;fechaUltimoContacto:Date|null;estimatedCloseDate:Date|null}>`SELECT l.id,l.estado,l.prioridad manual_priority,l.assigned_user_email,l.stage_since,l.pipeline_revision,a.do_not_contact,coalesce(s.classification,'open') classification,
    EXISTS(SELECT 1 FROM crm_tasks t WHERE t.lead_id=l.id AND t.status='pending' AND t.deleted_at IS NULL) pending_followup,l.fecha_proxima_accion,l.fecha_ultimo_contacto,l.estimated_close_date
    FROM leads l JOIN crm_accounts a ON a.id=l.account_id LEFT JOIN crm_stages s ON s.name=l.estado WHERE l.id IN (${sql.join(ids)}) AND l.deleted_at IS NULL`.execute(db);
   insights=rows.map(r=>({...r,suggestion:suggestPriority(rules,{stage:r.estado,classification:r.classification,pending:r.pendingFollowup,nextDay:r.fechaProximaAccion?calendarDay(r.fechaProximaAccion):null,lastContactDay:r.fechaUltimoContacto?calendarDay(r.fechaUltimoContacto):null,closeDay:r.estimatedCloseDate?calendarDay(r.estimatedCloseDate):null},localDay())}));
   if(p.leadId){
    events=(await sql<PipelineEvent>`SELECT * FROM crm_pipeline_events WHERE lead_id=${p.leadId} ORDER BY id DESC LIMIT 200`.execute(db)).rows.map(e=>({...e,recontactDate:e.recontactDate?calendarDay(e.recontactDate):null}));
    objections=(await sql<PipelineObjection>`SELECT * FROM crm_objections WHERE lead_id=${p.leadId} AND deleted_at IS NULL ORDER BY id DESC`.execute(db)).rows;
   }
  }
  let reactivations:ReactivationRow[]=[],total=0;
  if(p.mode==='reactivation'){
   const clauses=[sql`l.deleted_at IS NULL`,sql`s.classification='lost'`,sql`e.recontact_date IS NOT NULL`];
   if(user.role!=='admin')clauses.push(sql`l.assigned_user_email=${user.email}`);
   else if(p.responsible&&p.responsible!=='all')clauses.push(sql`l.assigned_user_email=${p.responsible}`);
   if(p.from)clauses.push(sql`e.recontact_date>=${p.from}::date`);if(p.to)clauses.push(sql`e.recontact_date<=${p.to}::date`);
   if(p.reasonId)clauses.push(sql`e.reason_id=${p.reasonId}`);if(p.vertical)clauses.push(sql`l.tipo=${p.vertical}`);
   if(p.handled==='no')clauses.push(sql`e.task_id IS NULL AND e.related_lead_id IS NULL`);
   if(p.handled==='yes')clauses.push(sql`(e.task_id IS NOT NULL OR e.related_lead_id IS NOT NULL)`);
   const base=sql`FROM leads l JOIN crm_accounts a ON a.id=l.account_id JOIN crm_stages s ON s.name=l.estado JOIN LATERAL (SELECT * FROM crm_pipeline_events WHERE lead_id=l.id AND action='stage' ORDER BY id DESC LIMIT 1) e ON true WHERE ${sql.join(clauses,sql` AND `)}`;
   total=Number((await sql<{n:string}>`SELECT count(*) n ${base}`.execute(db)).rows[0].n);
   reactivations=(await sql<ReactivationRow>`SELECT l.id,l.account_id,l.nombre,l.opportunity_name,l.tipo,l.assigned_user_email,l.estado,l.pipeline_revision,a.do_not_contact,e.id event_id,e.reason_id,e.comment,e.recontact_date,e.task_id ${base} ORDER BY e.recontact_date,l.id LIMIT 50 OFFSET ${(p.page-1)*50}`.execute(db)).rows.map(r=>({...r,recontactDate:calendarDay(r.recontactDate)}));
  }
  const configJournal=user.role==='admin'&&p.mode==='config'?(await sql`SELECT * FROM crm_pipeline_config_journal ORDER BY id DESC LIMIT 100`.execute(db)).rows:[];
  return reply({configJournal,stages:stages.rows,lossReasons:lossReasons.rows,objectionTypes:objectionTypes.rows,rules,insights,events,objections,reactivations,total,page:p.page,users,verticals:[...new Set([...verticals.map(v=>v.name),...historicalVerticals.map(v=>v.tipo!).filter(Boolean)])].sort()});
 }catch(e){return fail(e)}
}
async function log(trx:Transaction<DB>,accountId:string,leadId:string|null,action:string,metadata:unknown){
 await sql`INSERT INTO crm_pipeline_events(account_id,lead_id,action,actor_email,metadata) VALUES(${accountId},${leadId},${action},nullif(current_setting('crm.actor_email',true),''),${JSON.stringify(metadata)}::jsonb)`.execute(trx);
}
export async function post(request:Request){
 try{
  const {user}=await getServerUserSession(request);const p=pipelineMutation.parse(superjson.parse(await request.text()));
  const id=await db.transaction().execute(async trx=>{
   await setWorkActor(trx,user);
   if(p.action==='stage_save'||p.action==='catalog_save'||p.action==='rules_save'){
    if(user.role!=='admin')throw new Forbidden('Solo admin puede configurar catálogos y reglas.');
    if(p.action==='stage_save'){
     const before=(await sql<PipelineStage>`SELECT * FROM crm_stages WHERE name=${p.name} FOR UPDATE`.execute(trx)).rows[0];
     if(before&&before.classification!==p.classification)throw new Error('Clasificación histórica inmutable. Creá otra etapa.');
     await sql`INSERT INTO crm_stages(name,sort_order,active,classification) VALUES(${p.name},${p.sortOrder},${p.active},${p.classification}) ON CONFLICT(name) DO UPDATE SET sort_order=excluded.sort_order,active=excluded.active`.execute(trx);return p.name;
    }
    if(p.action==='catalog_save'){
     const table=p.catalog==='loss'?sql`crm_loss_reasons`:sql`crm_objection_types`;
     let result:string;
     if(p.id){const before=(await sql<PipelineCatalog>`SELECT * FROM ${table} WHERE id=${p.id} FOR UPDATE`.execute(trx)).rows[0];if(!before)throw new Error('Catálogo inexistente');
      // Labels referenced by history cannot be renamed: deactivate and add another.
      if(before.name!==p.name)throw new Error('El nombre conserva la evidencia histórica. Desactivá y agregá otro.');
      await sql`UPDATE ${table} SET active=${p.active} WHERE id=${p.id}`.execute(trx);result=p.id;
     }else result=(await sql<{id:string}>`INSERT INTO ${table}(name,active) VALUES(${p.name},${p.active}) RETURNING id`.execute(trx)).rows[0].id;return result;
    }
    for(const r of p.rules)for(const stage of r.stages)if(!(await sql`SELECT 1 FROM crm_stages WHERE name=${stage}`.execute(trx)).rows.length)throw new Error('Etapa de regla inexistente.');
    await trx.selectFrom('appSettings').select('value').where('key','=','crm_priority_rules').forUpdate().executeTakeFirstOrThrow();
    await trx.updateTable('appSettings').set({value:JSON.stringify(p.rules),updatedAt:new Date()}).where('key','=','crm_priority_rules').execute();return 'rules';
   }
   if(p.action==='contact_policy'){
    if(user.role!=='admin')throw new Forbidden('Solo admin cambia la política de contacto.');
    const before=await trx.selectFrom('crmAccounts').selectAll().where('id','=',p.accountId).forUpdate().executeTakeFirstOrThrow();
    await trx.updateTable('crmAccounts').set({doNotContact:p.blocked,updatedAt:new Date()}).where('id','=',p.accountId).execute();
    await log(trx,p.accountId,null,'contact_policy',{before:before.doNotContact,blocked:p.blocked,reason:p.reason});
    await trx.insertInto('crmCommercialJournal').values({accountId:p.accountId,action:'contact_policy',actorEmail:user.email,actorName:user.displayName,metadata:{before:{doNotContact:before.doNotContact},after:{doNotContact:p.blocked,reason:p.reason}}}).execute();return p.accountId;
   }
   const context=await trx.selectFrom('leads').select('accountId').where('id','=',p.leadId).where('deletedAt','is',null).executeTakeFirstOrThrow();
   const account=await trx.selectFrom('crmAccounts').selectAll().where('id','=',context.accountId).forUpdate().executeTakeFirstOrThrow();
   const lead=await trx.selectFrom('leads').selectAll().where('id','=',p.leadId).where('deletedAt','is',null).forUpdate().executeTakeFirstOrThrow();
   if(user.role!=='admin'&&lead.assignedUserEmail!==user.email)throw new Forbidden('Solo podés gestionar tus oportunidades asignadas.');
   if(lead.pipelineRevision!==p.revision)throw new Conflict('La oportunidad cambió. Cerrá este formulario y volvé a abrirlo para revisar antes de guardar.');
   if(p.action==='objection_save'){
    const type=(await sql<PipelineCatalog>`SELECT * FROM crm_objection_types WHERE id=${p.typeId} FOR SHARE`.execute(trx)).rows[0];
    const before=p.id?(await sql<PipelineObjection>`SELECT * FROM crm_objections WHERE id=${p.id} AND lead_id=${lead.id} AND deleted_at IS NULL FOR UPDATE`.execute(trx)).rows[0]:null;
    if(p.id&&!before)throw new Error('Objeción inexistente');if(before&&before.typeId!==p.typeId)throw new Error('Conservá el tipo original; agregá otra objeción si corresponde.');if(!type||(!type.active&&before?.typeId!==p.typeId))throw new Error('Objeción desactivada');
    let result:string;
    if(p.id){await sql`UPDATE crm_objections SET notes=${p.notes},status=${p.status},deleted_at=${p.deleted?new Date():null},updated_at=now() WHERE id=${p.id}`.execute(trx);result=p.id;}
    else{if(p.deleted)throw new Error('No se puede crear una objeción eliminada');result=(await sql<{id:string}>`INSERT INTO crm_objections(account_id,lead_id,type_id,notes,status) VALUES(${lead.accountId},${lead.id},${p.typeId},${p.notes},${p.status}) RETURNING id`.execute(trx)).rows[0].id;}
    await trx.updateTable('leads').set({updatedAt:new Date()}).where('id','=',lead.id).execute();return result;
   }
   if(p.action==='transition'){
    if(p.stage===lead.estado)throw new Error('Ya está en esta etapa.');
    await sql`SELECT set_config('crm.loss_reason',${p.reasonId??''},true),set_config('crm.loss_comment',${p.comment},true),set_config('crm.recontact',${p.recontactDate??''},true)`.execute(trx);
    await trx.updateTable('leads').set({estado:p.stage,updatedAt:new Date()}).where('id','=',lead.id).execute();return lead.id;
   }
   if(account.doNotContact)throw new Forbidden('Este negocio está marcado como No contactar.');
   const event=(await sql<PipelineEvent>`SELECT * FROM crm_pipeline_events WHERE id=${p.eventId} AND lead_id=${lead.id} AND reason_id IS NOT NULL FOR UPDATE`.execute(trx)).rows[0];
   const stage=(await sql<PipelineStage>`SELECT * FROM crm_stages WHERE name=${lead.estado}`.execute(trx)).rows[0];
   const latest=(await sql<{id:string}>`SELECT id FROM crm_pipeline_events WHERE lead_id=${lead.id} AND action='stage' ORDER BY id DESC LIMIT 1`.execute(trx)).rows[0];
   if(!event||latest?.id!==event.id||stage?.classification!=='lost')throw new Conflict('Este cierre ya no es el actual.');
   if(event.taskId||event.relatedLeadId)throw new Conflict('Este cierre ya generó seguimiento.');
   let target=lead;
   if(p.mode!=='followup'){
    if(!p.stage)throw new Error('Elegí una etapa abierta.');
    const next=(await sql<PipelineStage>`SELECT * FROM crm_stages WHERE name=${p.stage} AND active AND classification='open' FOR SHARE`.execute(trx)).rows[0];if(!next)throw new Error('Elegí una etapa abierta activa.');
    if(p.mode==='reopen')target=await trx.updateTable('leads').set({estado:p.stage,updatedAt:new Date()}).where('id','=',lead.id).returningAll().executeTakeFirstOrThrow();
    else{
     if(!p.opportunityName)throw new Error('Dale un nombre a la nueva oportunidad.');
     target=await trx.insertInto('leads').values({accountId:lead.accountId,nombre:lead.nombre,opportunityName:p.opportunityName,tipo:lead.tipo,subtipo:lead.subtipo,commercialProfile:lead.commercialProfile,assignedUserEmail:lead.assignedUserEmail,estado:p.stage,reactivatedFromId:lead.id}).returningAll().executeTakeFirstOrThrow();
    }
   }
   const task=await trx.insertInto('crmTasks').values({accountId:lead.accountId,leadId:target.id,title:p.title,typeId:'followup',assignedUserEmail:lead.assignedUserEmail,dueDate:p.dueDate,priority:lead.prioridad??'media',description:`Retomar cierre #${event.id}: ${event.comment??''}`}).returning('id').executeTakeFirstOrThrow();
   await sql`UPDATE crm_pipeline_events SET task_id=${task.id},related_lead_id=${target.id} WHERE id=${event.id}`.execute(trx);
   await log(trx,lead.accountId,lead.id,'reactivation',{mode:p.mode,eventId:event.id,taskId:task.id,relatedLeadId:target.id});return target.id;
  });return reply({id});
 }catch(e){return fail(e)}
}
