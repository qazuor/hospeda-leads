import assert from 'node:assert/strict';
import superjson from 'superjson';
import {sql} from 'kysely';
import {db} from '../src/helpers/db';
import {post,get} from '../src/endpoints/dataQuality';
import {get as commercialGET} from '../src/endpoints/commercial';
import {handle as list} from '../src/endpoints/leads_GET';
import {handle as directImport} from '../src/endpoints/leads_import_POST';
import {setServerSession} from '../src/helpers/getSetServerSession';
import {businessFields} from '../src/helpers/dataNormalization';
import type {ImportReview,ImportResult,MergePreview,QualityDetail} from '../src/endpoints/dataQuality.schema';
import type {CommercialDetail} from '../src/endpoints/commercial.schema';
assert.equal(process.env.CRM_TEST_DATABASE,'1','Use disposable DB');
const stamp=Date.now();
async function identity(role:'admin'|'user'){
 const u=await db.insertInto('users').values({email:`quality-${role}-${stamp}@example.com`,displayName:'Quality '+role,role}).returningAll().executeTakeFirstOrThrow();
 const session={id:u.email,createdAt:Date.now(),lastAccessed:Date.now()};await db.insertInto('sessions').values({id:session.id,userId:u.id,expiresAt:new Date(Date.now()+3600000)}).execute();const r=new Response();await setServerSession(r,session);return {user:u,cookie:r.headers.get('set-cookie')!.split(';')[0]};
}
const admin=await identity('admin'),user=await identity('user');
async function mutation<T>(body:unknown,status=200,cookie=admin.cookie){const r=await post(new Request('http://localhost/_api/data_quality',{method:'POST',headers:{cookie},body:superjson.stringify(body)}));const data=superjson.parse<T&{error?:string}>(await r.text());assert.equal(r.status,status,data.error);return data;}
async function detail(id:string){const r=await commercialGET(new Request('http://localhost/_api/commercial?accountId='+id,{headers:{cookie:admin.cookie}}));assert.equal(r.status,200);return superjson.parse<CommercialDetail>(await r.text());}
try{
 assert.equal((await get(new Request('http://localhost/_api/data_quality'))).status,401);
 assert.equal((await directImport(new Request('http://localhost/_api/leads_import',{headers:{cookie:admin.cookie}}))).status,409);
 const source=await db.insertInto('crmAccounts').values({nombre:'Fusión origen '+stamp,ciudad:'Colón',telefono:'03442123456',email:'source@example.com',doNotContact:true,commercialStatus:'client',clientSince:new Date('2026-01-01'),assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
 const dest=await db.insertInto('crmAccounts').values({nombre:'Fusión destino '+stamp,ciudad:'Colón',telefono:'+543442123456',email:'destination@example.com'}).returningAll().executeTakeFirstOrThrow();
 const c1=await db.insertInto('crmContacts').values({accountId:source.id,name:'Persona origen',isPrimary:true}).returningAll().executeTakeFirstOrThrow();
 await db.insertInto('crmContacts').values({accountId:dest.id,name:'Persona destino',isPrimary:true}).execute();
 const l=await db.insertInto('leads').values({accountId:source.id,nombre:source.nombre,primaryContactId:c1.id,estado:'Cargado',archivoAdjunto:'https://example.com/doc',assignedUserEmail:user.user.email,fechaProximaAccion:new Date('2026-10-10'),notas:'Nota antigua'}).returningAll().executeTakeFirstOrThrow();
 const sibling=await db.insertInto('leads').values({accountId:source.id,nombre:source.nombre,estado:'Cargado',deletedAt:new Date(),reactivatedFromId:l.id}).returningAll().executeTakeFirstOrThrow();
 const note=await db.insertInto('leadNotes').values({leadId:l.id,note:'Nota vinculada'}).returningAll().executeTakeFirstOrThrow();
 const task=await db.insertInto('crmTasks').values({accountId:source.id,leadId:l.id,title:'Visitar',typeId:'visit',dueDate:'2026-10-10',contactIds:[String(c1.id)]}).returningAll().executeTakeFirstOrThrow();
 const activity=await db.insertInto('crmActivities').values({accountId:source.id,leadId:l.id,taskId:task.id,title:'Contacto realizado',typeId:'call',occurredAt:new Date('2026-09-01'),contactIds:[String(c1.id)]}).returningAll().executeTakeFirstOrThrow();
 await sql`INSERT INTO crm_objections(account_id,lead_id,type_id,notes) SELECT ${source.id},${l.id},id,'Objeción histórica' FROM crm_objection_types LIMIT 1`.execute(db);
 await db.insertInto('crmCommercialJournal').values({accountId:source.id,action:'original',actorName:'Histórico',metadata:{identity:source.nombre}}).execute();
 const oldWork=await db.selectFrom('crmWorkJournal').selectAll().where('accountId','=',source.id).execute();
 const oldEvents=(await sql`SELECT * FROM crm_pipeline_events WHERE account_id=${source.id}`.execute(db)).rows;
 await mutation({action:'merge_preview',sourceId:source.id,destinationId:dest.id},403,user.cookie);
 let p=await mutation<MergePreview>({action:'merge_preview',sourceId:source.id,destinationId:dest.id});
 const selections=Object.fromEntries(businessFields.map(f=>[f,'destination']));selections.telefono='source';
 const mergeBody=()=>({action:'merge_confirm',sourceId:source.id,destinationId:dest.id,token:p.token,selections,reason:'Mismo negocio revisado',confirm:true});
 await db.insertInto('leadNotes').values({leadId:l.id,note:'Cambio concurrente'}).execute();await mutation(mergeBody(),409);
 p=await mutation<MergePreview>({action:'merge_preview',sourceId:source.id,destinationId:dest.id});
 // Fault injection after relationships moved: transaction must restore all intermediate writes.
 await sql`CREATE FUNCTION quality_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected merge failure'; END $$`.execute(db);
 await sql`CREATE TRIGGER quality_test_fail BEFORE INSERT ON crm_account_merges FOR EACH ROW EXECUTE FUNCTION quality_test_fail()`.execute(db);
 await mutation(mergeBody(),400);
 assert.equal((await detail(source.id)).account.id,source.id);assert.equal((await db.selectFrom('crmTasks').selectAll().where('id','=',task.id).executeTakeFirstOrThrow()).accountId,source.id);assert.equal((await db.selectFrom('crmContacts').selectAll().where('id','=',c1.id).executeTakeFirstOrThrow()).isPrimary,true);
 await sql`DROP TRIGGER quality_test_fail ON crm_account_merges; DROP FUNCTION quality_test_fail()`.execute(db);
 p=await mutation<MergePreview>({action:'merge_preview',sourceId:source.id,destinationId:dest.id});await mutation(mergeBody());
 const d=await detail(source.id);assert.equal(d.account.id,dest.id);assert.equal(d.account.doNotContact,true);assert.equal(d.account.commercialStatus,'client');assert.equal(d.account.telefono,source.telefono);assert(d.journal.some(j=>j.action==='original'&&j.accountId===source.id));
 assert.equal(d.contacts.length,2);assert.equal(d.contacts.filter(c=>c.isPrimary).length,1);assert.equal(d.opportunities.length,1);assert.equal((await db.selectFrom("leads").selectAll().where("accountId","=",dest.id).execute()).length,2,"Fusion preserves deleted opportunities without exposing them in the active detail");
 const moved=await db.selectFrom('leads').selectAll().where('id','=',l.id).executeTakeFirstOrThrow();assert.equal(moved.accountId,dest.id);assert.equal(moved.primaryContactId,c1.id);assert.equal(moved.archivoAdjunto,l.archivoAdjunto);assert.equal(moved.notas,l.notas);assert.equal(moved.assignedUserEmail,user.user.email);
 assert.equal((await db.selectFrom('leads').selectAll().where('id','=',sibling.id).executeTakeFirstOrThrow()).reactivatedFromId,l.id);
 assert.equal((await db.selectFrom('leadNotes').selectAll().where('id','=',note.id).executeTakeFirstOrThrow()).leadId,l.id);
 for(const old of oldWork)assert.deepEqual(await db.selectFrom('crmWorkJournal').selectAll().where('id','=',old.id).executeTakeFirstOrThrow(),old);
 for(const old of oldEvents as Array<Record<string,unknown>>){const row=(await sql`SELECT * FROM crm_pipeline_events WHERE id=${String(old.id)}`.execute(db)).rows[0] as Record<string,unknown>;assert.equal(String(row.accountId),dest.id);assert.equal(String(row.originalAccountId),source.id);for(const f of ['actorEmail','oldStage','newStage','metadata','createdAt'])assert.deepEqual(row[f],old[f]);}
 assert.equal((await db.selectFrom('crmActivities').selectAll().where('id','=',activity.id).executeTakeFirstOrThrow()).accountId,dest.id);
 const sourceAfter=await db.selectFrom('crmAccounts').selectAll().where('id','=',source.id).executeTakeFirstOrThrow();assert.equal(sourceAfter.mergedIntoId,dest.id);
 await assert.rejects(()=>db.insertInto('leads').values({nombre:'Reaparecer',accountId:source.id}).execute(),/fusionado/);
 await mutation(mergeBody(),409);
 const listing=await list(new Request('http://localhost/_api/leads?entity=business&q='+encodeURIComponent('Fusión'),{headers:{cookie:admin.cookie}}));const rows=superjson.parse<{rows:Array<{accountId:string}>}>(await listing.text());assert(!rows.rows.some(r=>r.accountId===source.id));assert(rows.rows.some(r=>r.accountId===dest.id));
 // Reviewed import, invalid rows, conservative updates and replay protection.
 const importRows=[{nombre:'Import '+stamp,ciudad:'Colón',email:'import@example.com'},{nombre:'Inválido',email:'bad'},{nombre:dest.nombre,ciudad:'Colón',telefono:''}];
 const count=Number((await db.selectFrom('leads').select(eb=>eb.fn.countAll().as('n')).executeTakeFirstOrThrow()).n);
 let review=await mutation<ImportReview>({action:'import_preview',rows:importRows,source:'CSV test'});
 assert.equal(Number((await db.selectFrom('leads').select(eb=>eb.fn.countAll().as('n')).executeTakeFirstOrThrow()).n),count);
 assert(review.rows[1].errors.length);const match=review.rows[2].matches.find(m=>m.id===dest.id)!;assert(match);
 const decisions=[{index:0,action:'create'},{index:1,action:'skip'},{index:2,action:'update',targetId:dest.id,revision:match.revision,acknowledge:true}];
 const body={action:'import_confirm',batchId:review.batchId,decisions,confirm:true};
 await mutation({...body,decisions:[decisions[0],{index:1,action:'create'},decisions[2]]},400);assert.equal(Number((await db.selectFrom('leads').select(eb=>eb.fn.countAll().as('n')).executeTakeFirstOrThrow()).n),count);
 const concurrent=await Promise.all([mutation<ImportResult>(body),mutation<ImportResult>(body)]);
 const result=concurrent[0];assert.deepEqual(concurrent[1],result);assert.equal(result.imported,1);assert.equal(result.updated,1);assert.equal(result.skipped,1);
 assert.equal((await detail(dest.id)).account.telefono,source.telefono);
 assert.deepEqual(await mutation<ImportResult>(body),result);assert.equal(Number((await db.selectFrom('leads').select(eb=>eb.fn.countAll().as('n')).executeTakeFirstOrThrow()).n),count+1);
 const retry=await mutation<ImportReview>({action:'import_preview',rows:importRows,source:'Otra fuente'});assert.equal(retry.batchId,review.batchId);assert.equal(retry.status,'completed');
 const qualityResponse=await get(new Request('http://localhost/_api/data_quality?accountId='+dest.id,{headers:{cookie:admin.cookie}}));const quality=superjson.parse<QualityDetail>(await qualityResponse.text());assert(quality.evidence.some(e=>e.batchId===review.batchId));
 // Import conflicts cannot partially apply earlier rows.
 review=await mutation<ImportReview>({action:'import_preview',rows:[{nombre:dest.nombre,ciudad:'Colón',email:'next@example.com'}],source:'Concurrent test'});const m=review.rows[0].matches.find(m=>m.id===dest.id)!;
 await db.updateTable('crmAccounts').set({updatedAt:new Date(),email:'concurrent@example.com'}).where('id','=',dest.id).execute();await mutation({action:'import_confirm',batchId:review.batchId,decisions:[{index:0,action:'update',targetId:dest.id,revision:m.revision,acknowledge:true}],confirm:true},409);
 await mutation({action:'import_preview',rows:[{nombre:'No asignar',asignadoA:admin.user.email}],source:'Permiso'},403,user.cookie);
 console.log('Quality integration: permissions, preview/no writes, invalid row rollback, safe empty updates, batch replay, conflicts, merge fault rollback, full references/history, canonical links and archived origin passed');
}finally{await db.destroy();}
