import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {sql} from 'kysely';
import superjson from 'superjson';
import {db} from '../src/helpers/db';
import {setServerSession} from '../src/helpers/getSetServerSession';
import {get} from '../src/endpoints/commercial';
import {post as pipelinePost} from '../src/endpoints/pipeline';
assert.equal(process.env.CRM_TEST_DATABASE,'1','Use a disposable database');
const stamp=randomUUID();
async function session(role:'admin'|'user',tag=''){
 const u=await db.insertInto('users').values({email:stamp+role+tag+'@example.com',displayName:'History test',role}).returningAll().executeTakeFirstOrThrow();
 const id=stamp+role+tag;await db.insertInto('sessions').values({id,userId:u.id,expiresAt:new Date(Date.now()+3600000)}).execute();
 const r=new Response();await setServerSession(r,{id,createdAt:Date.now(),lastAccessed:Date.now()});return r.headers.get('set-cookie')!.split(';')[0];
}
try{
 const admin=await session('admin'),reader=await session('user');
 const a=await db.insertInto('crmAccounts').values({nombre:'History '+stamp,status:'reviewed'}).returningAll().executeTakeFirstOrThrow();
 const lead=await db.insertInto('leads').values({accountId:a.id,nombre:a.nombre,opportunityName:'Propuesta histórica',managementType:'main',estado:'main:contact'}).returningAll().executeTakeFirstOrThrow();
 const activities=await db.insertInto('crmActivities').values(Array.from({length:52},(_,i)=>({accountId:a.id,leadId:lead.id,typeId:'call',title:'Conversación '+i,occurredAt:new Date(1700000000000+i*1000),outcome:'interested',result:'Pidió propuesta',channel:'phone',continuation:'task'}))).returningAll().execute();
 const addMessage=async(status:string,activityId:string|null=null)=>{
  const id=randomUUID();await sql`INSERT INTO crm_messages(id,account_id,original_account_id,lead_id,channel,recipient,owner_email,status,activity_id,text_body) VALUES(${id}::uuid,${a.id},${a.id},${lead.id},'whatsapp','5493442000000','history@example.com',${status},${activityId},'Texto registrado')`.execute(db);return id;
 };
 await addMessage('manual_sent',activities[0].id);const opened=await addMessage('whatsapp_opened');await addMessage('draft');await addMessage('cancelled');
 await db.insertInto('crmTasks').values({accountId:a.id,leadId:lead.id,typeId:'followup',title:'Revisar propuesta',dueDate:'2027-01-18',assignedUserEmail:null,continuation:'wait'}).execute();
 // Stage events come from the real leads trigger (insert with a stage + an update), never hand-inserted.
 await db.updateTable('leads').set({estado:'main:contacted'}).where('id','=',lead.id).execute();
 await sql`INSERT INTO crm_commercial_journal(account_id,action,actor_email,actor_name) VALUES(${a.id},'account_updated','history@example.com','History test')`.execute(db);
 await sql`INSERT INTO crm_communication_journal(account_id,original_account_id,lead_id,entity_type,entity_id,action,actor_email,after_value) VALUES(${a.id},${a.id},${lead.id},'interaction','x','contact_completed','history@example.com',${JSON.stringify({status:'manual_sent',channel:'whatsapp',outboxId:7,destination:'549344'})}::text::jsonb)`.execute(db);
 async function history(page=1,cookie=reader,status=200,kind='all'){const r=await get(new Request('http://localhost/_api/commercial?'+new URLSearchParams({accountId:a.id,historyPage:String(page),...(kind==='all'?{}:{historyKind:kind})}),{headers:{cookie}}));const d=superjson.parse<any>(await r.text());assert.equal(r.status,status,d.error);return d;}
 const first=await history(),second=await history(2);assert.equal(first.total,58);assert.equal(first.events.length,50);assert.equal(second.events.length,8);assert.equal(new Set([...first.events,...second.events].map(e=>e.id)).size,58);
 assert(first.events.some(e=>e.id==='message:'+opened&&e.messageStatus==='whatsapp_opened'));
 const combined=[...first.events,...second.events].find(e=>e.id==='activity:'+activities[0].id);assert.equal(combined.messageStatus,'manual_sent');assert.equal(combined.result,'Pidió propuesta');assert.equal(combined.opportunityName,'Propuesta histórica');
 const all=[...first.events,...second.events];
 const stages=all.filter(e=>e.kind==='stage');assert.deepEqual(stages.map(e=>e.title).sort(),['Gestión iniciada → Por contactar','Por contactar → Contactado'],'stage events use stage names');assert(stages.every(e=>e.opportunityName==='Propuesta histórica'&&e.result===null),'management notes are not shown');
 assert.equal(all.find(e=>e.kind==='communication').title,'Contacto realizado','raw journal actions are labeled');assert.equal(all.find(e=>e.kind==='change').title,'Datos del negocio editados');
 assert(all.every(e=>!/^[a-z]+(_[a-z]+)+$/.test(e.title)),'no internal key reaches the timeline');
 const journalled=all.find(e=>e.kind==='communication');assert.equal(journalled.result,'Envío confirmado manualmente · WhatsApp','communication entries read as plain words');
 assert(all.every(e=>![e.result,e.messageText].some(v=>typeof v==='string'&&/[{}]|"status"|outboxId|triggeredBy/.test(v))),'no raw JSON or internal keys in any entry');assert(all.filter(e=>e.kind==='communication').every(e=>e.messageText===null));
 const contacts=await history(1,reader,200,'contact'),managements=await history(1,reader,200,'management'),changes=await history(1,reader,200,'change');
 assert.equal(contacts.total,54);assert(contacts.events.every(e=>['activity','message','response','communication'].includes(e.kind)));assert.equal(managements.total,2);assert(managements.events.every(e=>e.kind==='stage'));assert.equal(changes.total,2,'the edit plus the status change the management trigger made');assert(changes.events.every(e=>e.kind==='change'));
 assert.equal(first.totalPending,1);assert.equal(first.pending[0].title,'Revisar propuesta');assert.equal(first.pending[0].continuation,'wait');
 await db.updateTable('leads').set({deletedAt:new Date()}).where('id','=',lead.id).execute();assert.equal((await history()).total,3,'only business-level data changes stay once the management is deleted (the status trigger added one more)');assert.equal((await history()).totalPending,0);
 await db.updateTable('crmAccounts').set({archivedAt:new Date()}).where('id','=',a.id).execute();await history(1,reader,403);await history(1,admin);
 const r=await get(new Request('http://localhost/_api/commercial?accountId='+a.id+'&historyPage=1'));assert.equal(r.status,401);
 // U-28B: stage-change notes (and the reason's label) of managements reach the timeline for every business reader; the legacy comment still shows.
 {
  const colleague=await session('user','colleague'),ownerEmail=stamp+'user@example.com';
  const b=await db.insertInto('crmAccounts').values({nombre:'Notes '+stamp,status:'reviewed',assignedUserEmail:ownerEmail}).returningAll().executeTakeFirstOrThrow();
  const typed=await db.insertInto('leads').values({accountId:b.id,nombre:b.nombre,opportunityName:'Gestión con nota',managementType:'main',estado:'main:contact',assignedUserEmail:ownerEmail} as never).returningAll().executeTakeFirstOrThrow();
  const legacy=await db.insertInto('leads').values({accountId:b.id,nombre:b.nombre,opportunityName:'Gestión heredada',estado:'Cargado',assignedUserEmail:ownerEmail}).returningAll().executeTakeFirstOrThrow();
  const reason=await db.selectFrom('crmManagementReasons').selectAll().where('managementType','=','main').where('outcomeKey','=','lost').where('active','=',true).where('doNotContact','=',false).where('requiresNote','=',false).executeTakeFirstOrThrow();
  const transition=async(leadId:string,stage:string,extra:object)=>{const rev=(await db.selectFrom('leads').select('pipelineRevision').where('id','=',leadId).executeTakeFirstOrThrow()).pipelineRevision;const r=await pipelinePost(new Request('http://localhost/_api/pipeline',{method:'POST',headers:{cookie:reader},body:superjson.stringify({action:'transition',leadId,revision:rev,stage,...extra})}));assert.equal(r.status,200,await r.text());};
  await transition(typed.id,'main:lost',{reasonId:reason.id,comment:'Prefiere seguir con su proveedor actual'});
  await transition(legacy.id,'En tratativas',{comment:'Nota de gestión anterior'});
  const stored=await db.selectFrom('crmPipelineEvents').select(['managementNote','comment']).where('leadId','=',typed.id).where('newStage','=','main:lost').executeTakeFirstOrThrow();assert.equal(stored.managementNote,'Prefiere seguir con su proveedor actual');assert.equal(stored.comment,null,'a typed management keeps its note in management_note, not comment');
  const historyOf=async(cookie:string|null,status=200)=>{const r=await get(new Request('http://localhost/_api/commercial?'+new URLSearchParams({accountId:b.id,historyPage:'1',historyKind:'management'}),{headers:cookie?{cookie}:{}}));const d=superjson.parse<any>(await r.text());assert.equal(r.status,status,d.error);return d;};
  const checkNotes=(d:any)=>{
   const t=d.events.find((e:any)=>e.opportunityName==='Gestión con nota'&&!e.title.startsWith('Gestión iniciada'));assert(t,'typed stage entry present');assert.equal(t.result,'Motivo: '+reason.name+' · Prefiere seguir con su proveedor actual','typed note shows with the reason label');
   const l=d.events.find((e:any)=>e.opportunityName==='Gestión heredada'&&e.result);assert(l,'legacy stage entry with a note present');assert.equal(l.result,'Nota de gestión anterior','legacy comment still shows');
   assert(d.events.every((e:any)=>typeof e.result!=='string'||!/[{}]|reason_id|^\d+$/.test(e.result)),'no raw ids or keys');
  };
  checkNotes(await historyOf(reader));checkNotes(await historyOf(colleague));checkNotes(await historyOf(admin));
  await historyOf(null,401);
  await db.updateTable('crmAccounts').set({archivedAt:new Date()}).where('id','=',b.id).execute();
  checkNotes(await historyOf(reader));await historyOf(colleague,403);
 }
 console.log('Commercial history: pagination, one event per linked message/activity, honest WhatsApp state, pending commitments and archived/deleted permissions passed');
}finally{await db.destroy()}
