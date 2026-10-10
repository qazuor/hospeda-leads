import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import superjson from 'superjson';
import {db} from '../src/helpers/db';
import {setServerSession} from '../src/helpers/getSetServerSession';
import {handle} from '../src/endpoints/lead_journal_GET';
assert.equal(process.env.CRM_TEST_DATABASE,'1','Use a disposable database');
const marker=randomUUID();
async function login(role:'admin'|'user'){
 const user=await db.insertInto('users').values({email:marker+role+'@example.com',displayName:'Lucía '+marker,role}).returningAll().executeTakeFirstOrThrow();
 const id=randomUUID();await db.insertInto('sessions').values({id,userId:user.id,expiresAt:new Date(Date.now()+3600000)}).execute();const response=new Response();await setServerSession(response,{id,createdAt:Date.now(),lastAccessed:Date.now()});return {user,cookie:response.headers.get('set-cookie')!.split(';')[0]};
}
try{
 const admin=await login('admin'),reader=await login('user');
 const account=await db.insertInto('crmAccounts').values({nombre:'Negocio Colón '+marker,ciudad:'Colón',tipo:'Alojamiento'}).returningAll().executeTakeFirstOrThrow();
 await db.insertInto('leadJournal').values({leadId:null,accountId:account.id,leadName:account.nombre,actorName:'Usuario histórico',action:'soft_deleted'}).execute();
 for(let i=0;i<12;i++)await db.insertInto('crmCommercialJournal').values({accountId:account.id,action:'account_updated',actorEmail:admin.user.email,actorName:admin.user.displayName,metadata:{before:{nombre:'Anterior'},after:{nombre:'Nuevo '+i}},createdAt:new Date(Date.UTC(2026,9,9,2,59,i))}).execute();
 await db.insertInto('crmCommercialJournal').values({accountId:account.id,action:'account_updated',actorEmail:admin.user.email,actorName:admin.user.displayName,createdAt:new Date('2026-10-09T03:00:00Z')}).execute();
 await db.insertInto('crmTasks').values({accountId:account.id,title:'Reunión '+marker,typeId:'meeting',dueDate:'2027-01-12'}).execute();
 await db.insertInto('crmDocuments').values({id:randomUUID(),accountId:account.id,title:'Propuesta '+marker,type:'file',ownerEmail:admin.user.email}).execute();
 const lead=await db.insertInto('leads').values({accountId:account.id,nombre:account.nombre,estado:'Cargado'}).returningAll().executeTakeFirstOrThrow();
 await db.deleteFrom('leads').where('id','=',lead.id).execute();
 async function history(params:Record<string,string>,cookie=admin.cookie,status=200){const response=await handle(new Request('http://localhost/_api/lead_journal?'+new URLSearchParams(params),{headers:{cookie}}));const data=superjson.parse<any>(await response.text());assert.equal(response.status,status,data.error);return data;}
 const first=await history({accountId:account.id,pageSize:'10'}),second=await history({accountId:account.id,pageSize:'10',page:'2'});
 assert(first.total>10);assert.equal(first.rows.length,10);assert.equal(new Set([...first.rows,...second.rows].map(r=>r.id)).size,first.rows.length+second.rows.length);
 const all=await history({accountId:account.id,pageSize:'100'});
 for(const source of ['lead','business','work','resource','pipeline'])assert(all.rows.some(r=>r.source===source),'Missing '+source);
 assert(all.rows.some(r=>r.source==='lead'&&r.leadId===null&&r.accountId===account.id));
 assert(all.filters.accounts.some(a=>a.id===account.id));
 assert.equal((await history({accountId:account.id,from:'2026-10-08',to:'2026-10-08',action:'account_updated'})).total,12,'Inclusive Argentina calendar day');
 assert.equal((await history({q:'colon '+marker,pageSize:'100'})).total,all.total,'Accent-insensitive business search covers each source');
 await history({},reader.cookie,403);
 const unauth=await handle(new Request('http://localhost/_api/lead_journal'));assert.notEqual(unauth.status,200);
 console.log('Global history: business/work/resource/pipeline journals, detached historical leads, stable pagination, business filters, accent search, Argentina dates and admin permissions passed');
}finally{await db.destroy();}
