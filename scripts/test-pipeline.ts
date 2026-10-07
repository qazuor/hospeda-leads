import assert from 'node:assert/strict';
import superjson from 'superjson';
import {sql} from 'kysely';
import {db} from '../src/helpers/db';
import {setServerSession} from '../src/helpers/getSetServerSession';
import {get,post} from '../src/endpoints/pipeline';
import {handle as quick} from '../src/endpoints/leads_quick_POST';
import {handle as list} from '../src/endpoints/leads_GET';
import type {PipelineData} from '../src/endpoints/pipeline.schema';
assert.equal(process.env.CRM_TEST_DATABASE,'1','Use disposable DB');const stamp=Date.now();
async function identity(role:'admin'|'user'){
 const user=await db.insertInto('users').values({email:`pipeline-${role}-${stamp}-${Math.random()}@example.com`,displayName:'Pipeline '+role,role}).returningAll().executeTakeFirstOrThrow();
 const session={id:user.email,createdAt:Date.now(),lastAccessed:Date.now()};await db.insertInto('sessions').values({id:session.id,userId:user.id,expiresAt:new Date(Date.now()+3600000)}).execute();const response=new Response();await setServerSession(response,session);return {user,cookie:response.headers.get('set-cookie')!.split(';')[0]};
}
const admin=await identity('admin'),user=await identity('user'),other=await identity('user');
const request=(body:unknown,cookie=user.cookie)=>new Request('http://localhost/_api/pipeline',{method:'POST',headers:{cookie},body:superjson.stringify(body)});
async function mutate(body:unknown,cookie=user.cookie,status=200){const r=await post(request(body,cookie));const value=superjson.parse<{id:string;error?:string}>(await r.text());assert.equal(r.status,status,value.error);return value.id;}
async function read(params='',cookie=user.cookie,status=200){const r=await get(new Request('http://localhost/_api/pipeline?'+params,{headers:{cookie}}));const d=superjson.parse<PipelineData&{error?:string}>(await r.text());assert.equal(r.status,status,d.error);return d;}
let accountId:string|undefined;
try{
 assert.equal((await get(new Request('http://localhost/_api/pipeline'))).status,401);
 const a=await db.insertInto('crmAccounts').values({nombre:'Pipeline fixtures '+stamp,assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();accountId=a.id;
 const l=await db.insertInto('leads').values({nombre:a.nombre,accountId:a.id,estado:'Cargado',tipo:'Alojamiento',prioridad:'baja',assignedUserEmail:user.user.email,opportunityName:'Plan inicial'}).returningAll().executeTakeFirstOrThrow();
 const lead=()=>db.selectFrom('leads').selectAll().where('id','=',l.id).executeTakeFirstOrThrow();
 const d=await read('leadId='+l.id);const reason=d.lossReasons.find(r=>r.active)!;
 await mutate({action:'stage_save',name:'Etapa test '+stamp,sortOrder:5,active:true,classification:'open'},user.cookie,403);
 await mutate({action:'rules_save',rules:d.rules},user.cookie,403);
 await mutate({action:'catalog_save',catalog:'loss',name:'Motivo test '+stamp,active:true},user.cookie,403);
 await mutate({action:'contact_policy',accountId:a.id,blocked:true,reason:'No autorizado'},user.cookie,403);
 await read('mode=reactivation&responsible=all',user.cookie,403);
 const revision=(await lead()).pipelineRevision;
 await mutate({action:'transition',leadId:l.id,revision,stage:'En tratativas'},other.cookie,403);
 await mutate({action:'transition',leadId:l.id,revision:revision+20,stage:'En tratativas'},user.cookie,409);
 await mutate({action:'transition',leadId:l.id,revision,stage:'Perdida'},user.cookie,400);
 assert.equal((await quick(request({id:l.id,field:'estado',value:'Perdida'}))).status,400);
 assert.equal((await quick(request({id:l.id,field:'estado',value:'En tratativas'},other.cookie))).status,403);
 await mutate({action:'transition',leadId:l.id,revision,stage:'Perdida',reasonId:reason.id,comment:'Retomar más adelante',recontactDate:'2026-10-01'});
 let row=await lead();assert.equal(row.estado,'Perdida');assert.equal(row.prioridad,'baja');
 assert.equal((await db.selectFrom('crmAccounts').select('commercialStatus').where('id','=',a.id).executeTakeFirstOrThrow()).commercialStatus,'prospect');
 let closed=await read('leadId='+l.id);const event=closed.events.find(e=>e.reasonId)!;assert.equal(event.comment,'Retomar más adelante');assert.equal(event.recontactDate,'2026-10-01');assert.equal(closed.insights[0].suggestion.priority,null);
 const queue=await read('mode=reactivation&reasonId='+reason.id+'&vertical=Alojamiento&from=2026-10-01&to=2026-10-01');assert(queue.reactivations.some(r=>r.id===l.id));
 assert(!(await read('mode=reactivation&from=2026-10-02')).reactivations.some(r=>r.id===l.id));
 await mutate({action:'contact_policy',accountId:a.id,blocked:true,reason:'Solicitó no contactar'},admin.cookie);
 const base={action:'reactivate',leadId:l.id,eventId:event.id,revision:(await lead()).pipelineRevision,mode:'reopen',stage:'En tratativas',dueDate:'2026-10-03',title:'Retomar conversación'};
 await mutate(base,user.cookie,403);await mutate(base,admin.cookie,403);
 await mutate({action:'contact_policy',accountId:a.id,blocked:false,reason:'Nuevo consentimiento'},admin.cookie);
 await mutate({...base,revision:(await lead()).pipelineRevision});
 row=await lead();assert.equal(row.estado,'En tratativas');assert.equal(row.prioridad,'baja');
 closed=await read('leadId='+l.id);assert(closed.events.some(e=>e.id===event.id&&e.reasonId===reason.id));assert(closed.events.some(e=>e.action==='reactivation'));
 assert.equal((await db.selectFrom('crmTasks').selectAll().where('leadId','=',l.id).where('status','=','pending').execute()).length,1);
 assert(!(await read('mode=reactivation')).reactivations.some(r=>r.id===l.id));
 await mutate({...base,revision:row.pipelineRevision},user.cookie,409);
 const listResponse=await list(new Request('http://localhost/_api/leads?idExact='+l.id,{headers:{cookie:user.cookie}}));const listed=superjson.parse<{rows:{estado:string}[]}>(await listResponse.text());assert.equal(listed.rows[0].estado,'En tratativas');
 const objectionType=d.objectionTypes.find(t=>t.active)!;
 const objection=await mutate({action:'objection_save',leadId:l.id,revision:(await lead()).pipelineRevision,typeId:objectionType.id,notes:'Debe consultar con su socio',status:'open'});
 assert.equal((await lead()).estado,'En tratativas');
 await mutate({action:'objection_save',leadId:l.id,revision:(await lead()).pipelineRevision,id:objection,typeId:objectionType.id,notes:'Aclarado',status:'resolved'});
 await mutate({action:'objection_save',leadId:l.id,revision:(await lead()).pipelineRevision,id:objection,typeId:objectionType.id,notes:'Aclarado',status:'resolved',deleted:true});
 assert.equal((await read('leadId='+l.id)).objections.length,0);
 const foreign=await db.insertInto('leads').values({nombre:a.nombre,accountId:a.id,estado:'Cargado',assignedUserEmail:other.user.email}).returningAll().executeTakeFirstOrThrow();
 await mutate({action:'objection_save',leadId:foreign.id,revision:foreign.pipelineRevision,id:objection,typeId:objectionType.id,status:'open'},admin.cookie,400);
 // Second close, explicit new opportunity: old lost state and relationship survive.
 await mutate({action:'transition',leadId:l.id,revision:(await lead()).pipelineRevision,stage:'Perdida',reasonId:reason.id,recontactDate:'2026-10-04'});
 const second=(await read('leadId='+l.id)).events.find(e=>e.action==='stage')!;
 const newId=await mutate({...base,eventId:second.id,revision:(await lead()).pipelineRevision,mode:'new',stage:'Cargado',opportunityName:'Nueva temporada'});
 const linked=await db.selectFrom('leads').selectAll().where('id','=',newId).executeTakeFirstOrThrow();assert.equal(linked.reactivatedFromId,l.id);assert.equal(linked.accountId,a.id);assert.equal(linked.assignedUserEmail,user.user.email);assert.equal((await lead()).estado,'Perdida');
 assert.equal((await read('leadId='+l.id)).events.filter(e=>e.reasonId).length,2);
 // Third close on linked opportunity, followup without reopening.
 await mutate({action:'transition',leadId:newId,revision:linked.pipelineRevision,stage:'Perdida',reasonId:reason.id,recontactDate:'2026-10-05'});
 const linkedClosed=await read('leadId='+newId);await mutate({...base,leadId:newId,eventId:linkedClosed.events[0].id,revision:linkedClosed.insights[0].pipelineRevision,mode:'followup'});
 assert.equal((await db.selectFrom('leads').select('estado').where('id','=',newId).executeTakeFirstOrThrow()).estado,'Perdida');
 const stageName='Desactivada '+stamp;await mutate({action:'stage_save',name:stageName,sortOrder:500,active:false,classification:'open'},admin.cookie);
 await mutate({action:'transition',leadId:foreign.id,revision:foreign.pipelineRevision,stage:stageName},admin.cookie,400);
 await mutate({action:'stage_save',name:'Cargado',sortOrder:0,active:true,classification:'won'},admin.cookie,400);
 const inactiveReason=await mutate({action:'catalog_save',catalog:'loss',name:'Desactivado '+stamp,active:false},admin.cookie);
 await mutate({action:'transition',leadId:foreign.id,revision:foreign.pipelineRevision,stage:'Perdida',reasonId:inactiveReason},admin.cookie,400);
 const policy=(await sql<{n:string}>`SELECT count(*) n FROM crm_pipeline_events WHERE account_id=${a.id} AND action='contact_policy'`.execute(db)).rows[0];assert.equal(Number(policy.n),2);
 assert((await read('mode=config',admin.cookie)).configJournal.some(j=>j.actorEmail===admin.user.email));
 console.log('Pipeline integration: loss reason, queue filters, ownership, optimistic conflicts, legacy guards, blocked contact, reopen/new/followup, history, objections and catalogs passed');
}finally{
 if(accountId){await sql`DELETE FROM crm_pipeline_events WHERE account_id=${accountId}`.execute(db);await db.deleteFrom('leads').where('accountId','=',accountId).execute();}
 await db.destroy();
}
