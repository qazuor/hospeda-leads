import {seedDncTasks,assertDncCancelled,assertDncUntouched} from './lib/dnc-tasks';
import assert from 'node:assert/strict';
import superjson from 'superjson';
import {sql} from 'kysely';
import {db} from '../src/helpers/db';
import {setServerSession} from '../src/helpers/getSetServerSession';
import {get as commercialGet,post as commercialPost} from '../src/endpoints/commercial';
import {get as pipelineGet,post as pipelinePost} from '../src/endpoints/pipeline';
import {handle as historyGet} from '../src/endpoints/lead_journal_GET';
import {handle as bulkPost} from '../src/endpoints/leads_bulk_POST';

assert.equal(process.env.CRM_TEST_DATABASE,'1','Use a disposable DB');
const stamp=Date.now();
async function identity(email:string,displayName:string,role:'admin'|'user'='admin'){
 const user=await db.insertInto('users').values({email,displayName,role}).returningAll().executeTakeFirstOrThrow();
 const session={id:user.email,createdAt:stamp,lastAccessed:stamp};
 await db.insertInto('sessions').values({id:session.id,userId:user.id,expiresAt:new Date(stamp+3600000)}).execute();
 const response=new Response();await setServerSession(response,session);
 return response.headers.get('set-cookie')!.split(';')[0];
}
const admin=await identity(`state-admin-${stamp}@example.com`,'State admin');
await identity(`leandro-${stamp}@example.com`,'Leandro');
const isolateLeandro=async(keepEmail:string,tag:string|number)=>{// pipeline.ts resolves the referral target by display name and fails unless exactly one user matches; leftovers of earlier runs are renamed for this run only and restored by the returned function.
 const rows=(await sql<{id:string;displayName:string|null;fullName:string|null}>`SELECT id,display_name,full_name FROM users WHERE email<>${keepEmail} AND (lower(trim(display_name))='leandro' OR lower(trim(coalesce(full_name,'')))='leandro')`.execute(db)).rows;
 const hidden=(v:string|null)=>v&&v.trim().toLowerCase()==='leandro'?`${v} (isolated ${tag})`:v;
 for(const r of rows)await sql`UPDATE users SET display_name=${hidden(r.displayName)},full_name=${hidden(r.fullName)} WHERE id=${r.id}`.execute(db);
 assert.equal(Number((await sql<{n:string}>`SELECT count(*) n FROM users WHERE lower(trim(display_name))='leandro' OR lower(trim(coalesce(full_name,'')))='leandro' OR lower(split_part(email,'@',1))='leandro'`.execute(db)).rows[0].n),1,'exactly one Leandro user while the referral runs');
 return async()=>{for(const r of rows)await sql`UPDATE users SET display_name=${r.displayName},full_name=${r.fullName} WHERE id=${r.id}`.execute(db);};
};
const restoreLeandro=await isolateLeandro(`leandro-${stamp}@example.com`,stamp);
const sellerEmail=`state-seller-${stamp}@example.com`;
const seller=await identity(sellerEmail,'State seller','user');
async function call(handler:(r:Request)=>Promise<Response>,url:string,body?:unknown,cookie=admin,status=200){
 const response=await handler(new Request('http://localhost/_api/'+url,{headers:{cookie,...(body?{'content-type':'application/json'}:{})},...(body?{method:'POST',body:superjson.stringify(body)}:{})}));
 const data=superjson.parse<any>(await response.text());assert.equal(response.status,status,data.error);return data;
}
const business=async(name:string,assignedUserEmail=`state-admin-${stamp}@example.com`)=>{
 const result=await call(commercialPost,'commercial',{action:'account_save',nombre:name,assignedUserEmail});
 return result.id as string;
};
const readPipeline=async(leadId:string)=>{
 const result=await call(pipelineGet,'pipeline?leadId='+leadId,undefined,admin);
 return result as {stages:{name:string;classification:string}[];managementReasons:{id:string;managementType:string;outcomeKey:string;reasonKey:string}[];insights:{pipelineRevision:number}[]};
};
const transition=async(leadId:string,stage:string,extra:Record<string,unknown>={},cookie=admin,status=200)=>{
 const data=await readPipeline(leadId);
 return call(pipelinePost,'pipeline',{action:'transition',leadId,revision:data.insights[0].pipelineRevision,stage,...extra},cookie,status);
};
try{
 const dayOf=(v:unknown)=>v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
 const gated=await business('Estado Nuevo '+stamp);
 await call(commercialPost,'commercial',{action:'opportunity_save',accountId:gated,managementType:'main',opportunityName:'No debe iniciar'},admin,400);
 await call(commercialPost,'commercial',{action:'business_status',accountId:gated,status:'reviewed'});
 const openLead=await call(commercialPost,'commercial',{action:'opportunity_save',accountId:gated,managementType:'main',opportunityName:'Presentación'},admin);
 const active=await db.selectFrom('crmAccounts').select(['status','isClient','referredToLeandro','assignedUserEmail']).where('id','=',gated).executeTakeFirstOrThrow();
 assert.equal(active.status,'in_management');

 const originalOwner=active.assignedUserEmail;
 await transition(openLead.id,'main:leandro');
 const referred=await db.selectFrom('crmAccounts').select(['status','referredToLeandro','assignedUserEmail']).where('id','=',gated).executeTakeFirstOrThrow();
 assert.equal(referred.status,'in_management');assert.equal(referred.referredToLeandro,true);assert.match(referred.assignedUserEmail??'',/^leandro-/);
 let detail=await readPipeline(openLead.id);
 await call(pipelinePost,'pipeline',{action:'unrefer',leadId:openLead.id,revision:detail.insights[0].pipelineRevision},admin);
 const restored=await db.selectFrom('crmAccounts').select(['referredToLeandro','assignedUserEmail']).where('id','=',gated).executeTakeFirstOrThrow();
 assert.equal(restored.referredToLeandro,false);assert.equal(restored.assignedUserEmail,originalOwner);

 const reason=(await readPipeline(openLead.id)).managementReasons.find(r=>r.managementType==='main'&&r.outcomeKey==='lost'&&r.reasonKey==='do_not_contact')!;
 // U-35: closing a management with the No contactar reason cancels the business's untouched "Volver a contactar" task.
 const gatedNow=await db.selectFrom('crmAccounts').select('assignedUserEmail').where('id','=',gated).executeTakeFirstOrThrow();
 await db.updateTable('crmAccounts').set({recontactAt:'2027-07-01' as never}).where('id','=',gated).execute();
 const typedTask=await db.insertInto('crmTasks').values({accountId:gated,leadId:null,title:'Volver a contactar',typeId:'followup',purpose:'reactivation',assignedUserEmail:gatedNow.assignedUserEmail,dueDate:'2027-07-01' as never,priority:'media'}).returning('id').executeTakeFirstOrThrow();
 await transition(openLead.id,'main:lost',{reasonId:reason.id,comment:''});
 const typedAfter=await db.selectFrom('crmTasks').select(['status','result']).where('id','=',typedTask.id).executeTakeFirstOrThrow();
 assert.equal(typedAfter.status,'cancelled');assert.match(String(typedAfter.result),/No contactar/);
 const blocked=await db.selectFrom('crmAccounts').select(['status','doNotContact','archivedAt']).where('id','=',gated).executeTakeFirstOrThrow();
 assert.equal(blocked.status,'archived');assert.equal(blocked.doNotContact,true);assert(blocked.archivedAt);

 // D3: a business that becomes No contactar loses ALL its pending tasks (admin policy and the typed No contactar close), as the acting user.
 {const adminEmail=`state-admin-${stamp}@example.com`;
  const mk=async(label:string)=>{const id=await business(`Zz D3 ${label} ${stamp}`,sellerEmail);await call(commercialPost,'commercial',{action:'business_status',accountId:id,status:'reviewed'},admin);
   const lead=await call(commercialPost,'commercial',{action:'opportunity_save',accountId:id,managementType:'main',opportunityName:'Gestión D3'},admin);
   const bystander=await business(`Zz D3 ajeno ${label} ${stamp}`);
   return {id,lead,fx:await seedDncTasks({accountId:id,leadId:lead.id,email:sellerEmail,otherAccountId:bystander})};};
  const policy=await mk('policy');
  await call(pipelinePost,'pipeline',{action:'contact_policy',accountId:policy.id,blocked:true,reason:'Sin permiso'},seller,403);
  await assertDncUntouched(policy.fx,'contact_policy refused to a seller');
  await call(pipelinePost,'pipeline',{action:'contact_policy',accountId:policy.id,blocked:true,reason:'Pidió no ser contactado'},admin);
  await assertDncCancelled(policy.fx,adminEmail,'contact_policy');
  await call(pipelinePost,'pipeline',{action:'contact_policy',accountId:policy.id,blocked:false,reason:'Se levantó el bloqueo'},admin);
  await assertDncCancelled(policy.fx,adminEmail,'lifting the block does not restore tasks');
  const typed=await mk('typed');
  await call(pipelinePost,'pipeline',{action:'transition',leadId:typed.lead.id,revision:(await readPipeline(typed.lead.id)).insights[0].pipelineRevision+5,stage:'main:lost',reasonId:reason.id,comment:''},admin,409);
  await assertDncUntouched(typed.fx,'stale typed No contactar close');
  await transition(typed.lead.id,'main:lost',{reasonId:reason.id,comment:''});
  assert.equal((await db.selectFrom('crmAccounts').select('doNotContact').where('id','=',typed.id).executeTakeFirstOrThrow()).doNotContact,true);
  await assertDncCancelled(typed.fx,adminEmail,'typed No contactar close');}

 const independent=await business('No contactar independiente '+stamp);
 await call(commercialPost,'commercial',{action:'business_status',accountId:independent,status:'reviewed'});
 const protectedLead=await call(commercialPost,'commercial',{action:'opportunity_save',accountId:independent,managementType:'main',opportunityName:'Gestión existente'},admin);
 await call(pipelinePost,'pipeline',{action:'contact_policy',accountId:independent,blocked:true,reason:'Restricción independiente'});
 let state=await db.selectFrom('crmAccounts').select(['status','doNotContact','archivedAt']).where('id','=',independent).executeTakeFirstOrThrow();
 assert.equal(state.status,'in_management');assert.equal(state.doNotContact,true);assert.equal(state.archivedAt,null);
 await transition(protectedLead.id,'main:contacted');
 state=await db.selectFrom('crmAccounts').select(['status','doNotContact','archivedAt']).where('id','=',independent).executeTakeFirstOrThrow();
 assert.equal(state.status,'in_management');assert.equal(state.doNotContact,true);assert.equal(state.archivedAt,null);
 await call(pipelinePost,'pipeline',{action:'contact_policy',accountId:independent,blocked:false,reason:'Se retiró la restricción'});
 await db.updateTable('crmAccounts').set({deletedAt:new Date()}).where('id','=',independent).execute();
 await call(pipelinePost,'pipeline',{action:'contact_policy',accountId:independent,blocked:true,reason:'No debe mutar papelera'},admin,400);

 const wonBusiness=await business('Acompañamiento '+stamp);
 await call(commercialPost,'commercial',{action:'business_status',accountId:wonBusiness,status:'reviewed'});
 const sale=await call(commercialPost,'commercial',{action:'opportunity_save',accountId:wonBusiness,managementType:'main',opportunityName:'Alta comercial'},admin);
 const winReason=(await readPipeline(sale.id)).managementReasons.find(r=>r.managementType==='main'&&r.outcomeKey==='won'&&r.reasonKey==='accepted')!;
 await transition(sale.id,'main:won',{reasonId:winReason.id},admin,400);// Spec 87: a win that marks the business as Cliente requires the agreement.
 await transition(sale.id,'main:won',{reasonId:winReason.id,closing:{agreement:'Plan anual acordado',person:'Titular del negocio',material:'',responsible:'',deliveryDate:null,reviewed:false}});
 state=await db.selectFrom('crmAccounts').select(['isClient','commercialStatus']).where('id','=',wonBusiness).executeTakeFirstOrThrow();
 assert.equal(state.isClient,true);
 const care=await call(commercialPost,'commercial',{action:'opportunity_save',accountId:wonBusiness,managementType:'accompaniment',opportunityName:'Acompañamiento de ficha'},admin);
 const careLead=await db.selectFrom('leads').select(['managementType','estado']).where('id','=',care.id).executeTakeFirstOrThrow();
 assert.equal(careLead.managementType,'accompaniment');assert.equal(careLead.estado,'accompaniment:pending');

 const followupBusiness=await business('Recontacto y reapertura '+stamp,sellerEmail);
 await call(commercialPost,'commercial',{action:'business_status',accountId:followupBusiness,status:'reviewed'});
 const first=await call(commercialPost,'commercial',{action:'opportunity_save',accountId:followupBusiness,managementType:'main',opportunityName:'Primera gestión'},admin);
 const second=await call(commercialPost,'commercial',{action:'opportunity_save',accountId:followupBusiness,managementType:'main',opportunityName:'Segunda gestión'},admin);
 const lostReasons=(await readPipeline(first.id)).managementReasons.filter(r=>r.managementType==='main'&&r.outcomeKey==='lost');
 const noResponse=lostReasons.find(r=>r.reasonKey==='no_response')!;
 const other=lostReasons.find(r=>r.reasonKey==='other')!;
 await transition(first.id,'main:lost',{},seller,400);
 await transition(first.id,'main:lost',{reasonId:other.id},seller,400);
 await transition(first.id,'main:lost',{reasonId:noResponse.id},seller);
 let work=await db.selectFrom('crmAccounts').select(['status','recontactAt']).where('id','=',followupBusiness).executeTakeFirstOrThrow();
 assert.equal(work.status,'in_management');
 await transition(second.id,'main:lost',{reasonId:noResponse.id,recontactDate:'2026-12-15'},seller);
 work=await db.selectFrom('crmAccounts').select(['status','recontactAt']).where('id','=',followupBusiness).executeTakeFirstOrThrow();
 assert.equal(work.status,'recontact');assert(work.recontactAt);
 const reminder=await db.selectFrom('crmTasks').select(['title','purpose','dueDate','assignedUserEmail']).where('leadId','=',second.id).where('status','=','pending').executeTakeFirstOrThrow();
 assert.equal(reminder.title,'Recontactar según lo acordado');assert.equal(reminder.purpose,'reactivation');assert.equal(reminder.dueDate instanceof Date?reminder.dueDate.toISOString().slice(0,10):String(reminder.dueDate),'2026-12-15');assert.equal(reminder.assignedUserEmail,sellerEmail);

 // U-35 review: a lost-management reminder of another person on the same day is never adopted, moved or cancelled by the business task.
 const betoEmail=`state-admin-${stamp}@example.com`;
 await db.updateTable('crmTasks').set({assignedUserEmail:betoEmail}).where('id','=',(await db.selectFrom('crmTasks').select('id').where('leadId','=',second.id).where('status','=','pending').executeTakeFirstOrThrow()).id).execute();
 const ownPending=(accountId:string)=>db.selectFrom('crmTasks').selectAll().where('accountId','=',accountId).where('title','=','Volver a contactar').where('status','=','pending').execute();
 const betoPending=()=>db.selectFrom('crmTasks').select(['id','assignedUserEmail','dueDate','status']).where('leadId','=',second.id).where('title','=','Recontactar según lo acordado').execute();
 await call(commercialPost,'commercial',{action:'business_status',accountId:followupBusiness,status:'recontact',recontactAt:'2026-12-15'},seller);
 assert.equal((await ownPending(followupBusiness)).length,1,'a lead-level reminder on the same day is not adopted: the business task is its own');
 await call(commercialPost,'commercial',{action:'business_status',accountId:followupBusiness,status:'recontact',recontactAt:'2026-12-20'},seller);
 const afterMove=await ownPending(followupBusiness);assert.equal(afterMove.length,1);assert.equal(dayOf(afterMove[0].dueDate),'2026-12-20');
 await call(commercialPost,'commercial',{action:'business_status',accountId:followupBusiness,status:'recontact',recontactAt:'2026-12-15'},seller);
 const backOnD=await ownPending(followupBusiness);assert.equal(backOnD.length,1,'moving back to the day of the other reminder keeps one business task');assert.equal(dayOf(backOnD[0].dueDate),'2026-12-15');assert.equal(backOnD[0].assignedUserEmail,sellerEmail);
 assert.equal((await db.selectFrom('crmTasks').select('id').where('accountId','=',followupBusiness).where('title','=','Volver a contactar').where('status','=','cancelled').execute()).length,0,'nothing was cancelled with a false reason');
 const betoTask=await betoPending();assert.equal(betoTask.length,1);assert.equal(betoTask[0].status,'pending');assert.equal(betoTask[0].assignedUserEmail,betoEmail);
 await call(commercialPost,'commercial',{action:'business_status',accountId:followupBusiness,status:'recontact',recontactAt:null},seller);
 assert.equal((await betoPending())[0].status,'pending','clearing the date cancels only the business task');
 await call(commercialPost,'commercial',{action:'business_status',accountId:followupBusiness,status:'recontact',recontactAt:'2026-12-15'},seller);
 await transition(second.id,'main:contacted',{},seller,403);
 await transition(second.id,'main:contacted',{},admin);
 const reopened=await db.selectFrom('crmAccounts').select('status').where('id','=',followupBusiness).executeTakeFirstOrThrow();
 assert.equal(reopened.status,'in_management');
 const preserved=await db.selectFrom('crmPipelineEvents').select('classification').where('leadId','=',second.id).where('newStage','=','main:lost').execute();
 assert.equal(preserved.length,1);assert.equal(preserved[0].classification,'lost');

 const businessDetail=await call(commercialGet,'commercial?accountId='+gated);
 assert(businessDetail.journal.some((entry:any)=>['business_status_changed','business_state_changed','contact_policy','leandro_referral_changed'].includes(entry.action)),'business state changes appear in business journal');
 assert(businessDetail.journal.some((entry:any)=>entry.metadata?.origin==='direct'),'direct business state change is identified as direct');
 assert(businessDetail.journal.some((entry:any)=>entry.metadata?.origin==='automatic'&&entry.metadata?.cause==='management_change'),'management-derived business state is identified as automatic');
 assert(businessDetail.managementJournal.some((entry:any)=>entry.newStage==='main:leandro'),'management stages appear in business journal');
 const global=await call(historyGet,'lead_journal?accountId='+gated);
 assert(global.rows.some((entry:any)=>entry.source==='business'&&['business_status_changed','business_state_changed','contact_policy','leandro_referral_changed'].includes(entry.action)),'business state changes appear in generic journal');
 assert(global.rows.some((entry:any)=>entry.source==='pipeline'&&entry.action==='pipeline_stage'),'management stage changes appear in generic journal');


 // Review badge transitions update status and clear/cancel an untouched recontact reminder.
 const reviewToggle=await business('Revisión editable '+stamp,sellerEmail);
 await call(commercialPost,'commercial',{action:'business_status',accountId:reviewToggle,status:'reviewed'},seller);
 await call(commercialPost,'commercial',{action:'business_status',accountId:reviewToggle,status:'recontact',recontactAt:'2027-03-15'},seller);
 await call(commercialPost,'commercial',{action:'business_status',accountId:reviewToggle,status:'new',recontactAt:null},seller);
 const toggled=await db.selectFrom('crmAccounts').select(['status','recontactAt']).where('id','=',reviewToggle).executeTakeFirstOrThrow();
 assert.equal(toggled.status,'new');assert.equal(toggled.recontactAt,null);
 assert.equal((await db.selectFrom('crmTasks').select('id').where('accountId','=',reviewToggle).where('title','=','Volver a contactar').where('status','=','cancelled').execute()).length,1);
 await call(commercialPost,'commercial',{action:'business_status',accountId:reviewToggle,status:'new',recontactAt:null},seller,400);
 // U-35 / decision 7A: Recontactar + date schedules "Volver a contactar" for the responsible seller.
 const recontactTasks=(accountId:string,status:string='pending')=>db.selectFrom('crmTasks').selectAll().where('accountId','=',accountId).where('title','=','Volver a contactar').where('status','=',status as 'pending').where('deletedAt','is',null).execute();
 const recontactBusiness=await business('Recontacto tarea '+stamp,sellerEmail);
 await call(commercialPost,'commercial',{action:'business_status',accountId:recontactBusiness,status:'reviewed'},admin);
 assert.equal((await recontactTasks(recontactBusiness)).length,0,'Recontactar without a date creates no task');
 const noDate=await call(commercialPost,'commercial',{action:'business_status',accountId:recontactBusiness,status:'recontact',recontactAt:null},seller);
 assert.equal((await recontactTasks(recontactBusiness)).length,0);assert.equal(noDate.recontactTask,undefined);
 const firstSave=await call(commercialPost,'commercial',{action:'business_status',accountId:recontactBusiness,status:'recontact',recontactAt:'2026-12-15'},seller);
 let tasks=await recontactTasks(recontactBusiness);
 assert.equal(tasks.length,1,'one task is created');assert.equal(firstSave.recontactTask.action,'created');assert.equal(firstSave.recontactTask.id,String(tasks[0].id));
 assert.equal(dayOf(tasks[0].dueDate),'2026-12-15','the task is due on the exact Argentina calendar day');assert.equal(tasks[0].assignedUserEmail,sellerEmail,'assigned to the responsible seller');
 assert.equal(tasks[0].leadId,null);assert.equal(tasks[0].purpose,'reactivation');assert.equal(tasks[0].typeId,'followup');
 const repeat=await call(commercialPost,'commercial',{action:'business_status',accountId:recontactBusiness,status:'recontact',recontactAt:'2026-12-15'},seller);
 assert.equal((await recontactTasks(recontactBusiness)).length,1,'repeating the same save does not duplicate');assert.equal(repeat.recontactTask.id,firstSave.recontactTask.id);
 const moved=await call(commercialPost,'commercial',{action:'business_status',accountId:recontactBusiness,status:'recontact',recontactAt:'2026-12-20'},admin);
 tasks=await recontactTasks(recontactBusiness);
 assert.equal(tasks.length,1,'changing the date moves the task');assert.equal(dayOf(tasks[0].dueDate),'2026-12-20');assert.equal(String(tasks[0].id),firstSave.recontactTask.id);assert.equal(moved.recontactTask.action,'moved');assert.equal(tasks[0].assignedUserEmail,sellerEmail,'an admin saving it keeps the responsible seller as assignee');
 const journal=await db.selectFrom('crmWorkJournal').select(['action','actorEmail']).where('entity','=','crm_tasks').where('entityId','=',String(tasks[0].id) as never).orderBy('id').execute();
 assert.deepEqual(journal.map(j=>j.action),['INSERT','UPDATE']);assert.equal(journal[0].actorEmail,sellerEmail);assert.equal(journal[1].actorEmail,`state-admin-${stamp}@example.com`);
 await call(commercialPost,'commercial',{action:'business_status',accountId:recontactBusiness,status:'recontact',recontactAt:null},seller);
 assert.equal((await recontactTasks(recontactBusiness)).length,0,'clearing the date cancels the untouched task');
 const cancelled=await recontactTasks(recontactBusiness,'cancelled');
 assert.equal(cancelled.length,1);assert.match(String(cancelled[0].result),/se quitó la fecha/);
 await call(commercialPost,'commercial',{action:'business_status',accountId:recontactBusiness,status:'recontact',recontactAt:'2027-01-10'},seller);
 await call(commercialPost,'commercial',{action:'business_status',accountId:recontactBusiness,status:'reviewed'},seller);
 assert.equal((await recontactTasks(recontactBusiness)).length,0,'leaving Recontactar cancels the untouched task');
 assert.match(String((await recontactTasks(recontactBusiness,'cancelled')).at(-1)!.result),/dejó de ser Recontactar/);
 // A task the seller rescheduled is hers: later status changes leave it alone and a new date schedules a separate one.
 await call(commercialPost,'commercial',{action:'business_status',accountId:recontactBusiness,status:'recontact',recontactAt:'2027-02-01'},seller);
 const touched=(await recontactTasks(recontactBusiness))[0];
 await db.updateTable('crmTasks').set({dueDate:'2027-02-05' as never}).where('id','=',touched.id).execute();
 await call(commercialPost,'commercial',{action:'business_status',accountId:recontactBusiness,status:'reviewed'},seller);
 assert.equal((await recontactTasks(recontactBusiness)).length,1,'a rescheduled task is not cancelled by the system');
 // Permission, No contactar and archived.
 const colleague=await identity(`state-colleague-${stamp}@example.com`,'State colleague','user');
 const owned=await business('Recontacto ajeno '+stamp,sellerEmail);
 await call(commercialPost,'commercial',{action:'business_status',accountId:owned,status:'reviewed'},admin);
 await call(commercialPost,'commercial',{action:'business_status',accountId:owned,status:'recontact',recontactAt:'2026-12-15'},colleague,403);
 assert.equal((await recontactTasks(owned)).length,0,'a non-owner seller creates no task');
 const dnc=await business('Recontacto DNC '+stamp,sellerEmail);
 await call(commercialPost,'commercial',{action:'business_status',accountId:dnc,status:'reviewed'},admin);
 await db.updateTable('crmAccounts').set({doNotContact:true}).where('id','=',dnc).execute();
 await call(commercialPost,'commercial',{action:'business_status',accountId:dnc,status:'recontact',recontactAt:'2026-12-15'},admin,400);
 assert.equal((await recontactTasks(dnc)).length,0,'No contactar gets no task');
 const archived=await business('Recontacto archivado '+stamp,sellerEmail);
 await call(commercialPost,'commercial',{action:'business_status',accountId:archived,status:'reviewed'},admin);
 await call(commercialPost,'commercial',{action:'account_archive',accountId:archived,archived:true,reason:'Prueba de archivo'},admin);
 await call(commercialPost,'commercial',{action:'business_status',accountId:archived,status:'recontact',recontactAt:'2026-12-15'},admin,400);
 assert.equal((await recontactTasks(archived)).length,0,'archived gets no task');
 // A unassigned business falls back to the actor.
 const unassigned=await business('Recontacto sin responsable '+stamp);
 await db.updateTable('crmAccounts').set({assignedUserEmail:null}).where('id','=',unassigned).execute();
 await call(commercialPost,'commercial',{action:'business_status',accountId:unassigned,status:'reviewed'},admin);
 await call(commercialPost,'commercial',{action:'business_status',accountId:unassigned,status:'recontact',recontactAt:'2026-12-15'},admin);
 assert.equal((await recontactTasks(unassigned))[0].assignedUserEmail,`state-admin-${stamp}@example.com`);
 // Review fix: without a responsible, the task is still found: a date change moves the same task, archive and No contactar cancel it.
 const unassignedTask=(await recontactTasks(unassigned))[0];
 const unassignedMoved=await call(commercialPost,'commercial',{action:'business_status',accountId:unassigned,status:'recontact',recontactAt:'2026-12-22'},admin);
 assert.equal(unassignedMoved.recontactTask.action,'moved');assert.equal(unassignedMoved.recontactTask.id,String(unassignedTask.id));
 assert.equal((await recontactTasks(unassigned)).length,1,'unassigned: a date change leaves one pending task');
 await call(commercialPost,'commercial',{action:'account_archive',accountId:unassigned,archived:true,reason:'Prueba de archivo'},admin);
 assert.equal((await recontactTasks(unassigned)).length,0,'unassigned: archive cancels the task');
 for(const [label,act] of [['clear',(id:string)=>call(commercialPost,'commercial',{action:'business_status',accountId:id,status:'recontact',recontactAt:null},admin)],['No contactar',(id:string)=>call(pipelinePost,'pipeline',{action:'contact_policy',accountId:id,blocked:true,reason:'Pidió no ser contactado'},admin)]] as const){
  const biz=await business(`Recontacto sin responsable ${label} ${stamp}`);
  await db.updateTable('crmAccounts').set({assignedUserEmail:null}).where('id','=',biz).execute();
  await call(commercialPost,'commercial',{action:'business_status',accountId:biz,status:'reviewed'},admin);
  await call(commercialPost,'commercial',{action:'business_status',accountId:biz,status:'recontact',recontactAt:'2026-12-23'},admin);
  assert.equal((await recontactTasks(biz)).length,1);
  await act(biz);
  assert.equal((await recontactTasks(biz)).length,0,`unassigned: ${label} cancels the task`);
 }


 // U-35 review: A -> B when this feature's task already exists on B; reassigned / timed tasks are never moved or cancelled.
 const twoDays=await business('Recontacto dos fechas '+stamp,sellerEmail);
 await call(commercialPost,'commercial',{action:'business_status',accountId:twoDays,status:'reviewed'},admin);
 await call(commercialPost,'commercial',{action:'business_status',accountId:twoDays,status:'recontact',recontactAt:'2027-03-01'},seller);
 const onB=await db.insertInto('crmTasks').values({accountId:twoDays,leadId:null,title:'Volver a contactar',typeId:'followup',purpose:'reactivation',assignedUserEmail:sellerEmail,dueDate:'2027-03-05' as never,priority:'media'}).returning('id').executeTakeFirstOrThrow();
 const toB=await call(commercialPost,'commercial',{action:'business_status',accountId:twoDays,status:'recontact',recontactAt:'2027-03-05'},seller);
 assert.equal(toB.recontactTask.action,'kept');assert.equal(toB.recontactTask.id,String(onB.id));
 assert.deepEqual((await recontactTasks(twoDays)).map(t=>String(t.id)),[String(onB.id)],'A -> B leaves one pending task');
 assert.match(String((await recontactTasks(twoDays,'cancelled'))[0].result),/cambió a otro día/,'the old day is cancelled with a date-change reason, not "date cleared"');
 for(const [label,patch] of [['timed',{dueAt:new Date('2027-04-01T15:00:00Z')}],['reassigned',{assignedUserEmail:betoEmail}]] as const){
  const biz=await business(`Recontacto ${label} ${stamp}`,sellerEmail);
  await call(commercialPost,'commercial',{action:'business_status',accountId:biz,status:'reviewed'},admin);
  await call(commercialPost,'commercial',{action:'business_status',accountId:biz,status:'recontact',recontactAt:'2027-04-01'},seller);
  const t=(await recontactTasks(biz))[0];
  await db.updateTable('crmTasks').set(patch as never).where('id','=',t.id).execute();
  await call(commercialPost,'commercial',{action:'business_status',accountId:biz,status:'reviewed'},seller);
  assert.equal((await recontactTasks(biz)).length,1,`a ${label} task is never cancelled`);
  await call(commercialPost,'commercial',{action:'business_status',accountId:biz,status:'recontact',recontactAt:'2027-04-09'},seller);
  assert.equal((await recontactTasks(biz)).filter(x=>String(x.id)===String(t.id)).length,1);
  assert.equal(dayOf((await recontactTasks(biz)).find(x=>String(x.id)===String(t.id))!.dueDate),'2027-04-01',`a ${label} task is never moved`);
 }
 // Cleanup when the business stops being workable: only this feature's untouched task is cancelled.
 const dncPaths:[string,(accountId:string)=>Promise<unknown>,RegExp][]=[
  ['archive',accountId=>call(commercialPost,'commercial',{action:'account_archive',accountId,archived:true,reason:'Prueba de archivo'},admin),/se archivó/],
  ['policy',accountId=>call(pipelinePost,'pipeline',{action:'contact_policy',accountId,blocked:true,reason:'Pidió no ser contactado'},admin),/No contactar/]
 ];
 for(const [label,act,reason] of dncPaths){
  const biz=await business(`Recontacto limpieza ${label} ${stamp}`,sellerEmail);
  await call(commercialPost,'commercial',{action:'business_status',accountId:biz,status:'reviewed'},admin);
  await call(commercialPost,'commercial',{action:'business_status',accountId:biz,status:'recontact',recontactAt:'2027-05-10'},seller);
  const other=await db.insertInto('crmTasks').values({accountId:biz,leadId:null,title:'Otra tarea',typeId:'followup',assignedUserEmail:sellerEmail,dueDate:'2027-05-10' as never,priority:'media'}).returning('id').executeTakeFirstOrThrow();
  await act(biz);
  assert.equal((await recontactTasks(biz)).length,0,`${label}: the recontact task is cancelled`);
  assert.match(String((await recontactTasks(biz,'cancelled'))[0].result),reason);
  assert.equal((await db.selectFrom('crmTasks').select('status').where('id','=',other.id).executeTakeFirstOrThrow()).status,label==='policy'?'cancelled':'pending',`${label}: other tasks follow D3 (cancelled when No contactar, untouched when only archived)`);
 }
 // A touched task survives the cleanup.
 const keep=await business('Recontacto limpieza tocada '+stamp,sellerEmail);
 await call(commercialPost,'commercial',{action:'business_status',accountId:keep,status:'reviewed'},admin);
 await call(commercialPost,'commercial',{action:'business_status',accountId:keep,status:'recontact',recontactAt:'2027-05-10'},seller);
 await db.updateTable('crmTasks').set({dueDate:'2027-05-12' as never}).where('accountId','=',keep).where('title','=','Volver a contactar').execute();
 await call(commercialPost,'commercial',{action:'account_archive',accountId:keep,archived:true,reason:'Prueba de archivo'},admin);
 assert.equal((await recontactTasks(keep)).length,1,'a rescheduled task survives the archive cleanup');

 // F1: closing a management keeps the business recontact task in step (decision 7A; owner: with a date only the management task remains).
 const recontactWithManagement=async(label:string,day:string)=>{
  const biz=await business(`Recontacto cierre ${label} ${stamp}`,sellerEmail);
  await call(commercialPost,'commercial',{action:'business_status',accountId:biz,status:'reviewed'},admin);
  await call(commercialPost,'commercial',{action:'business_status',accountId:biz,status:'recontact',recontactAt:day},seller);
  const task=(await recontactTasks(biz))[0];
  const lead=await call(commercialPost,'commercial',{action:'opportunity_save',accountId:biz,managementType:'main',opportunityName:'Gestión '+label},admin);
  const state=await db.selectFrom('crmAccounts').select(['status','recontactAt']).where('id','=',biz).executeTakeFirstOrThrow();
  assert.equal(state.status,'in_management');assert.equal(dayOf(state.recontactAt),day,'opening a management keeps the stored recontact date');
  return {biz,task,lead:lead.id as string};
 };
 const pendingOn=(accountId:string,day:string)=>db.selectFrom('crmTasks').select(['id','title','assignedUserEmail']).where('accountId','=',accountId).where('status','=','pending').where('deletedAt','is',null).where('dueDate','=',day as never).orderBy('id').execute();
 const lostNoResponse=(await readPipeline(first.id)).managementReasons.find(r=>r.managementType==='main'&&r.outcomeKey==='lost'&&r.reasonKey==='no_response')!;
 {
  const {biz,task,lead}=await recontactWithManagement('mueve','2027-06-01');
  await transition(lead,'main:lost',{reasonId:lostNoResponse.id,recontactDate:'2027-06-10'},seller);
  const onDay=await pendingOn(biz,'2027-06-10');
  assert.deepEqual(onDay.map(t=>t.title),['Recontactar según lo acordado'],'closing with a date leaves exactly one pending task that day: the management one');
  assert.equal((await recontactTasks(biz)).length,0,'no business task is created or moved');
  const replaced=await db.selectFrom('crmTasks').select(['status','result']).where('id','=',task.id).executeTakeFirstOrThrow();
  assert.equal(replaced.status,'cancelled');assert.match(String(replaced.result),/cambió a otro día/,'the earlier untouched business task is cancelled as a date change');
  assert.equal(dayOf((await db.selectFrom('crmAccounts').select('recontactAt').where('id','=',biz).executeTakeFirstOrThrow()).recontactAt),'2027-06-10');
 }
 {
  const {biz,task,lead}=await recontactWithManagement('mismo día','2027-06-01');
  await transition(lead,'main:lost',{reasonId:lostNoResponse.id,recontactDate:'2027-06-01'},seller);
  assert.deepEqual((await pendingOn(biz,'2027-06-01')).map(t=>t.title),['Recontactar según lo acordado'],'closing with the stored date leaves exactly one pending task that day: the management one');
  const replaced=await db.selectFrom('crmTasks').select(['status','result']).where('id','=',task.id).executeTakeFirstOrThrow();
  assert.equal(replaced.status,'cancelled');assert.match(String(replaced.result),/la gestión ya tiene su propia tarea de recontacto/,'same day: cancelled with the management reason, not as a date change');
 }
 {
  const {biz,task,lead}=await recontactWithManagement('limpia','2027-06-01');
  await transition(lead,'main:lost',{reasonId:lostNoResponse.id},seller);
  assert.equal((await db.selectFrom('crmAccounts').select('recontactAt').where('id','=',biz).executeTakeFirstOrThrow()).recontactAt,null);
  assert.equal((await recontactTasks(biz)).length,0,'closing without a date cancels the untouched task');
  const cancelled=await db.selectFrom('crmTasks').select(['status','result']).where('id','=',task.id).executeTakeFirstOrThrow();
  assert.equal(cancelled.status,'cancelled');assert.match(String(cancelled.result),/dejó de ser Recontactar/);
 }
 {
  const {biz,task,lead}=await recontactWithManagement('tocada','2027-06-01');
  await db.updateTable('crmTasks').set({dueDate:'2027-06-03' as never}).where('id','=',task.id).execute();
  await transition(lead,'main:lost',{reasonId:lostNoResponse.id},seller);
  const kept=await db.selectFrom('crmTasks').select(['status','dueDate']).where('id','=',task.id).executeTakeFirstOrThrow();
  assert.equal(kept.status,'pending','a rescheduled task survives a close without date');assert.equal(dayOf(kept.dueDate),'2027-06-03');
 }
 {
  const biz=await business('Recontacto cierre nuevo '+stamp,sellerEmail);
  await call(commercialPost,'commercial',{action:'business_status',accountId:biz,status:'reviewed'},admin);
  const lead=await call(commercialPost,'commercial',{action:'opportunity_save',accountId:biz,managementType:'main',opportunityName:'Sin fecha previa'},admin);
  await transition(lead.id,'main:lost',{reasonId:lostNoResponse.id,recontactDate:'2027-06-15'},seller);
  const onDay=await pendingOn(biz,'2027-06-15');
  assert.deepEqual(onDay.map(t=>t.title),['Recontactar según lo acordado'],'closing with a date on a business without a task creates only the management task');
  assert.equal(onDay[0].assignedUserEmail,sellerEmail);
 }
 {// An archived (not No contactar) business keeps its state: the stage guard refuses the close, so no date or task is written (the pipeline.ts archived guard is defense in depth).
  const biz=await business('Recontacto cierre archivado '+stamp,sellerEmail);
  await call(commercialPost,'commercial',{action:'business_status',accountId:biz,status:'reviewed'},admin);
  const lead=await call(commercialPost,'commercial',{action:'opportunity_save',accountId:biz,managementType:'main',opportunityName:'Archivado con fecha'},admin);
  await call(commercialPost,'commercial',{action:'account_archive',accountId:biz,archived:true,reason:'Prueba de archivo'},admin);
  await transition(lead.id,'main:lost',{reasonId:lostNoResponse.id,recontactDate:'2027-06-18'},admin,400);
  const state=await db.selectFrom('crmAccounts').select(['status','recontactAt']).where('id','=',biz).executeTakeFirstOrThrow();
  assert.equal(state.status,'archived','closing never turns an archived business into Recontactar');assert.equal(state.recontactAt,null);
  assert.equal((await recontactTasks(biz)).length,0,'archived: no business task');
 }

 // F1: the untouched task follows the business responsible on every reassignment path; other tasks stay.
 const colleagueEmail=`state-colleague-${stamp}@example.com`;
 const reassignable=async(label:string)=>{
  const biz=await business(`Recontacto reasignado ${label} ${stamp}`,sellerEmail);
  await call(commercialPost,'commercial',{action:'business_status',accountId:biz,status:'reviewed'},admin);
  await call(commercialPost,'commercial',{action:'business_status',accountId:biz,status:'recontact',recontactAt:'2027-07-01'},seller);
  const task=(await recontactTasks(biz))[0];
  const other=await db.insertInto('crmTasks').values({accountId:biz,leadId:null,title:'Otra tarea del vendedor',typeId:'followup',purpose:'reactivation',assignedUserEmail:sellerEmail,dueDate:'2027-07-01' as never,priority:'media'}).returning('id').executeTakeFirstOrThrow();
  return {biz,task,other};
 };
 const assigneeOf=async(id:unknown)=>(await db.selectFrom('crmTasks').select('assignedUserEmail').where('id','=',String(id) as never).executeTakeFirstOrThrow()).assignedUserEmail;
 const reassignPaths:[string,(biz:string)=>Promise<unknown>][]=[
  ['single',biz=>call(commercialPost,'commercial',{action:'account_save',id:biz,nombre:`Recontacto reasignado single ${stamp}`,assignedUserEmail:colleagueEmail},admin)],
  ['bulk',biz=>call(bulkPost,'leads_bulk',{entity:'business',ids:[biz],changes:{assignedUserEmail:colleagueEmail}},admin)]
 ];
 for(const [label,act] of reassignPaths){
  const {biz,task,other}=await reassignable(label);
  const touched=await reassignable(label+' tocada');
  await db.updateTable('crmTasks').set({assignedUserEmail:betoEmail}).where('id','=',touched.task.id).execute();
  await act(biz);if(label==='bulk')await call(bulkPost,'leads_bulk',{entity:'business',ids:[touched.biz],changes:{assignedUserEmail:colleagueEmail}},admin);else await call(commercialPost,'commercial',{action:'account_save',id:touched.biz,nombre:`Recontacto reasignado ${label} tocada ${stamp}`,assignedUserEmail:colleagueEmail},admin);
  assert.equal((await db.selectFrom('crmAccounts').select('assignedUserEmail').where('id','=',biz).executeTakeFirstOrThrow()).assignedUserEmail,colleagueEmail);
  assert.equal(await assigneeOf(task.id),colleagueEmail,`${label}: the untouched recontact task moves to the new responsible`);
  assert.equal(await assigneeOf(other.id),sellerEmail,`${label}: other tasks are not adopted`);
  assert.equal(await assigneeOf(touched.task.id),betoEmail,`${label}: a manually reassigned recontact task is left alone`);
  // The moved task keeps working with the sync: a date change moves it for the new responsible.
  const moved=await call(commercialPost,'commercial',{action:'business_status',accountId:biz,status:'recontact',recontactAt:'2027-07-05'},admin);
  assert.equal(moved.recontactTask.action,'moved');assert.equal(moved.recontactTask.id,String(task.id));
 }
 {// Leandro referral and its reversal also change the business responsible.
  const {biz,task,lead}=await recontactWithManagement('derivación','2027-06-20');
  await transition(lead,'main:leandro');
  const leandroEmail=(await db.selectFrom('crmAccounts').select('assignedUserEmail').where('id','=',biz).executeTakeFirstOrThrow()).assignedUserEmail;
  assert.match(leandroEmail??'',/^leandro-/);
  assert.equal(await assigneeOf(task.id),leandroEmail,'referral moves the untouched recontact task to Leandro');
  const detailNow=await readPipeline(lead);
  await call(pipelinePost,'pipeline',{action:'unrefer',leadId:lead,revision:detailNow.insights[0].pipelineRevision},admin);
  assert.equal(await assigneeOf(task.id),sellerEmail,'undoing the referral moves it back');
 }

 // Owner decisions 21/10: the management recontact reminder belongs to the business responsible, a re-save moves it, and a reassignment carries it.
 {
  const biz=await business('Recontacto dueño del negocio '+stamp,sellerEmail);
  await call(commercialPost,'commercial',{action:'business_status',accountId:biz,status:'reviewed'},admin);
  const lead=await call(commercialPost,'commercial',{action:'opportunity_save',accountId:biz,managementType:'main',opportunityName:'Gestión de otra persona',assignedUserEmail:colleagueEmail},admin);
  assert.equal((await db.selectFrom('leads').select('assignedUserEmail').where('id','=',lead.id).executeTakeFirstOrThrow()).assignedUserEmail,colleagueEmail,'the management is assigned to seller A');
  await transition(lead.id,'main:lost',{reasonId:lostNoResponse.id,recontactDate:'2027-08-01'},admin);
  const closed=await pendingOn(biz,'2027-08-01');
  assert.deepEqual(closed.map(t=>[t.title,t.assignedUserEmail]),[['Recontactar según lo acordado',sellerEmail]],'R1: closing with a date leaves exactly one pending task that day, for the business responsible (seller B)');
  const reminderId=String(closed[0].id);
  const allTasks=async()=>(await db.selectFrom('crmTasks').select('id').where('accountId','=',biz).execute()).length;
  const before=await allTasks();
  const moved=await call(commercialPost,'commercial',{action:'business_status',accountId:biz,status:'recontact',recontactAt:'2027-08-05'},seller);
  assert.deepEqual(moved.recontactTask,{id:reminderId,dueDate:'2027-08-05',action:'moved',title:'Recontactar según lo acordado'},'R2: the re-save moves the management reminder');
  assert.deepEqual((await pendingOn(biz,'2027-08-05')).map(t=>String(t.id)),[reminderId],'R2: exactly one pending task on the new day: the management one');
  assert.equal((await pendingOn(biz,'2027-08-01')).length,0,'R2: nothing left on the old day');
  assert.equal((await recontactTasks(biz)).length,0,'R2: no business «Volver a contactar» is created');assert.equal(await allTasks(),before,'R2: no task is created');
  const same=await call(commercialPost,'commercial',{action:'business_status',accountId:biz,status:'recontact',recontactAt:'2027-08-05'},seller);
  assert.equal(same.recontactTask.action,'kept');assert.equal(same.recontactTask.id,reminderId);
  assert.deepEqual((await pendingOn(biz,'2027-08-05')).map(t=>String(t.id)),[reminderId],'R2: same date leaves it unchanged');assert.equal(await allTasks(),before);
  await call(commercialPost,'commercial',{action:'account_save',id:biz,nombre:'Recontacto dueño del negocio '+stamp,assignedUserEmail:colleagueEmail},admin);
  assert.equal(await assigneeOf(reminderId),colleagueEmail,'R2: a reassignment moves the untouched management reminder to the new responsible');
  const again=await call(commercialPost,'commercial',{action:'business_status',accountId:biz,status:'recontact',recontactAt:'2027-08-09'},admin);
  assert.equal(again.recontactTask.id,reminderId,'the reassigned reminder still follows date changes');
  assert.deepEqual((await pendingOn(biz,'2027-08-09')).map(t=>[String(t.id),t.assignedUserEmail]),[[reminderId,colleagueEmail]]);
 }
 {// A rescheduled management reminder is touched: a re-save leaves it and schedules the business task as before.
  const biz=await business('Recontacto gestión tocada '+stamp,sellerEmail);
  await call(commercialPost,'commercial',{action:'business_status',accountId:biz,status:'reviewed'},admin);
  const lead=await call(commercialPost,'commercial',{action:'opportunity_save',accountId:biz,managementType:'main',opportunityName:'Recordatorio reprogramado'},admin);
  await transition(lead.id,'main:lost',{reasonId:lostNoResponse.id,recontactDate:'2027-08-11'},admin);
  const reminder=(await pendingOn(biz,'2027-08-11'))[0];
  await db.updateTable('crmTasks').set({dueDate:'2027-08-12' as never}).where('id','=',reminder.id).execute();
  const result=await call(commercialPost,'commercial',{action:'business_status',accountId:biz,status:'recontact',recontactAt:'2027-08-20'},seller);
  assert.equal(result.recontactTask.action,'created');assert.equal(result.recontactTask.title,'Volver a contactar');
  assert.equal(dayOf((await db.selectFrom('crmTasks').select('dueDate').where('id','=',reminder.id).executeTakeFirstOrThrow()).dueDate),'2027-08-12','a rescheduled management reminder is left alone');
  await call(commercialPost,'commercial',{action:'account_save',id:biz,nombre:'Recontacto gestión tocada '+stamp,assignedUserEmail:colleagueEmail},admin);
  assert.equal(await assigneeOf(reminder.id),sellerEmail,'a rescheduled management reminder is not reassigned');
 }

 // Owner decision 21/10: leaving Recontactar (another status, date cleared, archived) cancels the untouched management reminder too; a touched one stays.
 {
  const closedWithDate=async(label:string,day:string)=>{
   const biz=await business(`Recontacto salida ${label} ${stamp}`,sellerEmail);
   await call(commercialPost,'commercial',{action:'business_status',accountId:biz,status:'reviewed'},admin);
   const lead=await call(commercialPost,'commercial',{action:'opportunity_save',accountId:biz,managementType:'main',opportunityName:'Salida '+label,assignedUserEmail:colleagueEmail},admin);
   await transition(lead.id,'main:lost',{reasonId:lostNoResponse.id,recontactDate:day},admin);
   const onDay=await pendingOn(biz,day);assert.equal(onDay.length,1);
   return {biz,reminderId:String(onDay[0].id)};
  };
  const stateOf=async(id:string)=>db.selectFrom('crmTasks').select(['status','result','dueDate']).where('id','=',id as never).executeTakeFirstOrThrow();
  const leaves:[string,(biz:string)=>Promise<unknown>,RegExp][]=[
   ['otro estado',biz=>call(commercialPost,'commercial',{action:'business_status',accountId:biz,status:'no_follow_up_scheduled'},seller),/dejó de ser Recontactar/],
   ['sin fecha',biz=>call(commercialPost,'commercial',{action:'business_status',accountId:biz,status:'recontact'},seller),/se quitó la fecha de recontacto/],
   ['archivado',biz=>call(commercialPost,'commercial',{action:'account_archive',accountId:biz,archived:true,reason:'Prueba de archivo'},admin),/se archivó/]
  ];
  for(const [label,leave,reason] of leaves){
   const {biz,reminderId}=await closedWithDate(label,'2027-09-01');
   await leave(biz);
   const cancelled=await stateOf(reminderId);
   assert.equal(cancelled.status,'cancelled',`${label}: the untouched management reminder is cancelled when the business leaves Recontactar`);assert.match(String(cancelled.result),reason,`${label}: same reason as the business task`);
   assert.equal((await pendingOn(biz,'2027-09-01')).length,0,`${label}: nothing pending is left on the old day`);
   const touched=await closedWithDate(label+' tocada','2027-09-02');
   await db.updateTable('crmTasks').set({dueDate:'2027-09-03' as never}).where('id','=',touched.reminderId as never).execute();
   await leave(touched.biz);
   const kept=await stateOf(touched.reminderId);
   assert.equal(kept.status,'pending',`${label}: a rescheduled management reminder stays pending`);assert.equal(dayOf(kept.dueDate),'2027-09-03');
  }
 }

 console.log('Business state integration: New/review gate, derived active state, multiple open managements, required close reasons, scheduled recontact task, admin-only reopen with preserved closure history, Leandro referral, independent DNC, archive-on-DNC close, client conversion and accompaniment passed.');
}finally{await restoreLeandro();await db.destroy();}
