import assert from 'node:assert/strict';
import superjson from 'superjson';
import {db} from '../src/helpers/db';
import {post as quality} from '../src/endpoints/dataQuality';
import {post as commercial,get as detail} from '../src/endpoints/commercial';
import {handle as listing} from '../src/endpoints/leads_GET';
import {setServerSession} from '../src/helpers/getSetServerSession';
import type {ImportReview,ImportResult} from '../src/endpoints/dataQuality.schema';
import type {CommercialDetail} from '../src/endpoints/commercial.schema';
assert.equal(process.env.CRM_TEST_DATABASE,'1','Use disposable DB');
const stamp=Date.now();
async function identity(role:'admin'|'user'){
 const u=await db.insertInto('users').values({email:`business-${role}-${stamp}@example.com`,displayName:'Import '+role,role}).returningAll().executeTakeFirstOrThrow();
 const session={id:u.email,createdAt:Date.now(),lastAccessed:Date.now()};
 await db.insertInto('sessions').values({id:session.id,userId:u.id,expiresAt:new Date(Date.now()+3600000)}).execute();
 const response=new Response();await setServerSession(response,session);
 return {u,cookie:response.headers.get('set-cookie')!.split(';')[0]};
}
const admin=await identity('admin'),user=await identity('user');
async function call<T>(endpoint:typeof quality,body:unknown,status=200,cookie=admin.cookie){
 const response=await endpoint(new Request('http://localhost/_api/test',{method:'POST',headers:{cookie},body:superjson.stringify(body)}));
 const data=superjson.parse<T&{error?:string}>(await response.text());assert.equal(response.status,status,data.error);return data;
}
async function counts(){return Promise.all((['leads','crmContacts','crmTasks','crmActivities'] as const).map(t=>db.selectFrom(t).select(eb=>eb.fn.countAll().as('n')).executeTakeFirstOrThrow().then(r=>Number(r.n))));}
try{
 await db.insertInto('crmVerticals').values({name:'Gastronomía test '+stamp,active:true}).execute();
 const tipo='Gastronomía test '+stamp,subtipo='Restaurante test '+stamp;
 await db.insertInto('crmSubtypes').values({name:subtipo,typeName:tipo,active:true}).execute();
 const before=await counts();
 const rows=[{nombre:'Negocio gastronómico '+stamp,ciudad:'Colón',tipo,subtipo,provincia:'Entre Ríos',direccion:'Calle pública 123',whatsapp:'+543447123456',discoverySource:'Sitio oficial',verificationUrls:'https://example.com/menu\nhttps://example.com/local',verifiedOn:'2026-01-01',businessNotes:'Dirección verificada; no se identificó persona.'}];
 const preview=await call<ImportReview>(quality,{action:'import_preview',mode:'business',rows,source:'Relevamiento comercial'});
 assert.equal(preview.mode,'business');assert.deepEqual(preview.rows[0].errors,[]);assert.deepEqual(await counts(),before);
 const body={action:'import_confirm',batchId:preview.batchId,decisions:[{index:0,action:'create'}],confirm:true};
 const result=await call<ImportResult>(quality,body);assert.equal(result.imported,1);assert.equal(result.details[0].entity,'business');
 const accountId=result.details[0].accountId!;
 assert.deepEqual(await counts(),before,'No sales, persons, tasks or activities may be created');
 const response=await detail(new Request('http://localhost/_api/commercial?accountId='+accountId,{headers:{cookie:admin.cookie}}));
 const saved=superjson.parse<CommercialDetail>(await response.text());
 for(const field of ['tipo','subtipo','direccion','whatsapp','discoverySource','verificationUrls','verifiedOn','businessNotes'] as const)assert.equal(saved.account[field],rows[0][field]);
 assert.equal(saved.account.commercialStatus,'prospect');assert.equal(saved.account.assignedUserEmail,null);assert.equal(saved.opportunities.length,0);assert.equal(saved.contacts.length,0);
 assert.deepEqual(await call<ImportResult>(quality,body),result);assert.deepEqual(await counts(),before);
 const retry=await call<ImportReview>(quality,{action:'import_preview',mode:'business',rows,source:'Otra fuente'});assert.equal(retry.batchId,preview.batchId);assert.equal(retry.status,'completed');
 const listResponse=await listing(new Request('http://localhost/_api/leads?entity=business&tipo='+encodeURIComponent(tipo),{headers:{cookie:admin.cookie}}));
 const list=superjson.parse<{rows:Array<{accountId:string;tipo:string;subtipo:string;opportunityCount:number}>}>(await listResponse.text());
 assert(list.rows.some(r=>r.accountId===accountId&&r.tipo===tipo&&r.subtipo===subtipo&&r.opportunityCount===0));
 const duplicate=await call<ImportReview>(quality,{action:'import_preview',mode:'business',rows:[{...rows[0],businessNotes:'Otra nota'}],source:'Duplicado'});assert(duplicate.rows[0].matches.some(m=>m.id===accountId));
 const invalid=await call<ImportReview>(quality,{action:'import_preview',mode:'business',rows:[{nombre:'No válido '+stamp,tipo,subtipo:'inventado'},{nombre:'Sin ventas '+stamp,estado:'Cargado',notas:'Nota de venta'}],source:'Validación'});
 assert(invalid.rows.every(r=>r.errors.length));
 await call(quality,{action:'import_confirm',batchId:invalid.batchId,decisions:[{index:0,action:'create'},{index:1,action:'skip'}],confirm:true},400);
 await call(quality,{action:'import_preview',mode:'business',rows:[{nombre:'Responsable',asignadoA:admin.u.email}],source:'Permiso'},403,user.cookie);
 // Editing new classification must not alter the independent opportunity classification.
 const lead=await db.insertInto('leads').values({nombre:saved.account.nombre,accountId,tipo:'Alojamientos',estado:'Cargado'}).returningAll().executeTakeFirstOrThrow();
 await call<{id:string}>(commercial,{action:'account_save',id:accountId,nombre:saved.account.nombre,ciudad:'Colón',tipo,subtipo,businessNotes:'Actualizada'});
 assert.equal((await db.selectFrom('leads').select('tipo').where('id','=',lead.id).executeTakeFirstOrThrow()).tipo,'Alojamientos');
 const manual=await call<{id:string}>(commercial,{action:'account_save',nombre:'Manual '+stamp,ciudad:'Colón',tipo,subtipo,assignedUserEmail:null});
 assert(await db.selectFrom('crmAccounts').select('id').where('id','=',manual.id).executeTakeFirst());
 await call(commercial,{action:'account_save',nombre:'Subtipo inventado',tipo,subtipo:'inventado'},400);
 console.log('Business import: persisted classification/provenance, no phantom entities, replay, duplicate preview, filters, validation and independent sales passed');
}finally{await db.destroy();}
