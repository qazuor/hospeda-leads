import assert from 'node:assert/strict';
import superjson from 'superjson';
import {db} from '../src/helpers/db';
import {setServerSession} from '../src/helpers/getSetServerSession';
import {get as commercialGet,post as commercialPost} from '../src/endpoints/commercial';
import {get as pipelineGet,post as pipelinePost} from '../src/endpoints/pipeline';
import {handle as historyGet} from '../src/endpoints/lead_journal_GET';

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
 await transition(openLead.id,'main:lost',{reasonId:reason.id,comment:''});
 const blocked=await db.selectFrom('crmAccounts').select(['status','doNotContact','archivedAt']).where('id','=',gated).executeTakeFirstOrThrow();
 assert.equal(blocked.status,'archived');assert.equal(blocked.doNotContact,true);assert(blocked.archivedAt);

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
 await transition(sale.id,'main:won',{reasonId:winReason.id});
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

 console.log('Business state integration: New/review gate, derived active state, multiple open managements, required close reasons, scheduled recontact task, admin-only reopen with preserved closure history, Leandro referral, independent DNC, archive-on-DNC close, client conversion and accompaniment passed.');
}finally{await db.destroy();}
