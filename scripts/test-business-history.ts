import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {sql} from 'kysely';
import superjson from 'superjson';
import {db} from '../src/helpers/db';
import {setServerSession} from '../src/helpers/getSetServerSession';
import {get} from '../src/endpoints/commercial';
assert.equal(process.env.CRM_TEST_DATABASE,'1','Use a disposable database');
const stamp=randomUUID();
async function session(role:'admin'|'user'){
 const u=await db.insertInto('users').values({email:stamp+role+'@example.com',displayName:'History test',role}).returningAll().executeTakeFirstOrThrow();
 const id=stamp+role;await db.insertInto('sessions').values({id,userId:u.id,expiresAt:new Date(Date.now()+3600000)}).execute();
 const r=new Response();await setServerSession(r,{id,createdAt:Date.now(),lastAccessed:Date.now()});return r.headers.get('set-cookie')!.split(';')[0];
}
try{
 const admin=await session('admin'),reader=await session('user');
 const a=await db.insertInto('crmAccounts').values({nombre:'History '+stamp}).returningAll().executeTakeFirstOrThrow();
 const lead=await db.insertInto('leads').values({accountId:a.id,nombre:a.nombre,opportunityName:'Propuesta histórica'}).returningAll().executeTakeFirstOrThrow();
 const activities=await db.insertInto('crmActivities').values(Array.from({length:52},(_,i)=>({accountId:a.id,leadId:lead.id,typeId:'call',title:'Conversación '+i,occurredAt:new Date(1700000000000+i*1000),outcome:'interested',result:'Pidió propuesta',channel:'phone',continuation:'task'}))).returningAll().execute();
 const addMessage=async(status:string,activityId:string|null=null)=>{
  const id=randomUUID();await sql`INSERT INTO crm_messages(id,account_id,original_account_id,lead_id,channel,recipient,owner_email,status,activity_id,text_body) VALUES(${id}::uuid,${a.id},${a.id},${lead.id},'whatsapp','5493442000000','history@example.com',${status},${activityId},'Texto registrado')`.execute(db);return id;
 };
 await addMessage('manual_sent',activities[0].id);const opened=await addMessage('whatsapp_opened');await addMessage('draft');await addMessage('cancelled');
 await db.insertInto('crmTasks').values({accountId:a.id,leadId:lead.id,typeId:'followup',title:'Revisar propuesta',dueDate:'2027-01-18',assignedUserEmail:null,continuation:'wait'}).execute();
 async function history(page=1,cookie=reader,status=200){const r=await get(new Request('http://localhost/_api/commercial?'+new URLSearchParams({accountId:a.id,historyPage:String(page)}),{headers:{cookie}}));const d=superjson.parse<any>(await r.text());assert.equal(r.status,status,d.error);return d;}
 const first=await history(),second=await history(2);assert.equal(first.total,53);assert.equal(first.events.length,50);assert.equal(second.events.length,3);assert.equal(new Set([...first.events,...second.events].map(e=>e.id)).size,53);
 assert(first.events.some(e=>e.id==='message:'+opened&&e.messageStatus==='whatsapp_opened'));
 const combined=[...first.events,...second.events].find(e=>e.id==='activity:'+activities[0].id);assert.equal(combined.messageStatus,'manual_sent');assert.equal(combined.result,'Pidió propuesta');assert.equal(combined.opportunityName,'Propuesta histórica');
 assert.equal(first.totalPending,1);assert.equal(first.pending[0].title,'Revisar propuesta');assert.equal(first.pending[0].continuation,'wait');
 await db.updateTable('leads').set({deletedAt:new Date()}).where('id','=',lead.id).execute();assert.equal((await history()).total,0);assert.equal((await history()).totalPending,0);
 await db.updateTable('crmAccounts').set({archivedAt:new Date()}).where('id','=',a.id).execute();await history(1,reader,403);await history(1,admin);
 const r=await get(new Request('http://localhost/_api/commercial?accountId='+a.id+'&historyPage=1'));assert.equal(r.status,401);
 console.log('Commercial history: pagination, one event per linked message/activity, honest WhatsApp state, pending commitments and archived/deleted permissions passed');
}finally{await db.destroy()}
