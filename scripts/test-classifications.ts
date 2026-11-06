import assert from 'node:assert/strict';
import superjson from 'superjson';
import {db} from '../src/helpers/db';
import {post as commercial} from '../src/endpoints/commercial';
import {handle as quick} from '../src/endpoints/leads_quick_POST';
import {setServerSession} from '../src/helpers/getSetServerSession';
import type {AccountClassification} from '../src/helpers/accountClassification';
assert.equal(process.env.CRM_TEST_DATABASE,'1','Use disposable DB');
const stamp=Date.now();
const admin=await db.selectFrom('users').selectAll().where('email','=','admin@example.com').executeTakeFirstOrThrow();
const seller=await db.insertInto('users').values({email:`classification-seller-${stamp}@example.com`,displayName:'Classification seller',role:'user'}).returningAll().executeTakeFirstOrThrow();
const session={id:`classification-${stamp}`,createdAt:Date.now(),lastAccessed:Date.now()};
await db.insertInto('sessions').values({id:session.id,userId:admin.id,expiresAt:new Date(Date.now()+3600000)}).execute();
const sellerSession={...session,id:`classification-seller-${stamp}`};await db.insertInto('sessions').values({id:sellerSession.id,userId:seller.id,expiresAt:new Date(Date.now()+3600000)}).execute();
const response=new Response(),sellerResponse=new Response();await setServerSession(response,session);await setServerSession(sellerResponse,sellerSession);const cookie=response.headers.get('set-cookie')!.split(';')[0],sellerCookie=sellerResponse.headers.get('set-cookie')!.split(';')[0];
const request=(body:unknown,who=cookie)=>new Request('http://localhost/_api/commercial',{method:'POST',headers:{cookie:who},body:superjson.stringify(body)});
async function write(body:unknown,status=200,error?:string,who=cookie){const r=await commercial(request(body,who)),data=superjson.parse<{id:string;error?:string}>(await r.text());assert.equal(r.status,status,data.error);if(error)assert.equal(data.error,error);return data;}
async function quickWrite(body:unknown,status=200,who=cookie){const r=await quick(request(body,who)),data=superjson.parse<{error?:string}>(await r.text());assert.equal(r.status,status,data.error);}
async function catalog(name:string){await db.insertInto('crmVerticals').values({name,active:true}).execute();await db.insertInto('crmSubtypes').values({name:'sub '+name,typeName:name,active:true}).execute();return {tipo:name,subtipo:'sub '+name};}
try{
 const a=await catalog('Class A '+stamp),b=await catalog('Class B '+stamp),c=await catalog('Class C '+stamp),more=await Promise.all(Array.from({length:6},(_,i)=>catalog(`Class ${i+4} ${stamp}`))),bad={tipo:'Unknown '+stamp,subtipo:null};
 const saved=await write({action:'account_save',nombre:'Classification '+stamp,classifications:[a,b]});
 const rows=()=>db.selectFrom('crmAccountClassifications').selectAll().where('accountId','=',saved.id).orderBy('id').execute();
 const initial=await rows(),keep=initial.find(x=>x.tipo===b.tipo)!;
 await write({action:'account_save',id:saved.id,nombre:'Classification '+stamp,classifications:[b,c]});
 const after=await rows();assert.equal(after.find(x=>x.tipo===b.tipo)?.id,keep.id);assert.equal(after.find(x=>x.tipo===b.tipo)?.createdBy,keep.createdBy);
 assert.deepEqual(after.map(x=>x.tipo).sort(),[b.tipo,c.tipo].sort());
 const account=await db.selectFrom('crmAccounts').select(['tipo','subtipo']).where('id','=',saved.id).executeTakeFirstOrThrow();assert.deepEqual(account,{tipo:b.tipo,subtipo:b.subtipo});
 assert(await db.selectFrom('crmCommercialJournal').select('id').where('accountId','=',saved.id).where('action','=','account_classifications_changed').executeTakeFirst());
 const eight=[a,b,c,...more.slice(0,5)].map(pair=>({tipo:pair.tipo,subtipo:null} as AccountClassification));
 const limited=await write({action:'account_save',nombre:'Classification limit '+stamp,classifications:[a]});
 await write({action:'account_save',id:limited.id,nombre:'Classification limit '+stamp,classifications:eight});
 await write({action:'account_save',id:limited.id,nombre:'Classification limit '+stamp,classifications:[...eight,{tipo:more[5]!.tipo,subtipo:null}]},400,'Un negocio puede tener como máximo 8 verticales.');
 await write({action:'account_save',id:saved.id,nombre:'Classification '+stamp,classifications:[bad]},400);
 const beforeRejected=await rows();
 await write({action:'account_save',id:saved.id,nombre:'Classification '+stamp,classifications:[b],tipo:b.tipo},400);
 assert.deepEqual(await rows(),beforeRejected,'Rejected classification request leaves rows unchanged');
 // Legacy clients edit only the displayed pair and retain secondary classifications.
 await write({action:'account_save',id:saved.id,nombre:'Classification '+stamp,tipo:a.tipo,subtipo:a.subtipo});
 assert.deepEqual((await rows()).map(x=>x.tipo).sort(),[a.tipo,c.tipo].sort());
 await db.updateTable('crmVerticals').set({active:false}).where('name','=',a.tipo).execute();
 await write({action:'account_save',id:saved.id,nombre:'Classification renamed '+stamp,ciudad:'Paraná'});
 assert.deepEqual((await rows()).map(x=>x.tipo).sort(),[a.tipo,c.tipo].sort(),'Existing inactive classification survives unrelated edit');
 const inactive=await catalog('Inactive new '+stamp);await db.updateTable('crmVerticals').set({active:false}).where('name','=',inactive.tipo).execute();
 const beforeInactive=await rows();await write({action:'account_save',id:saved.id,nombre:'Classification '+stamp,classifications:[a,inactive]},400,'Vertical no disponible en Configuración.');assert.deepEqual(await rows(),beforeInactive,'Rejected new inactive pair leaves rows unchanged');
 await db.updateTable('crmVerticals').set({active:true}).where('name','=',a.tipo).execute();
 const inline=await write({action:'account_save',nombre:'Inline '+stamp,classifications:[a,b]});
 const inlineRowsBefore=await db.selectFrom('crmAccountClassifications').select(['tipo','subtipo']).where('accountId','=',inline.id).execute();
 await quickWrite({id:inline.id,accountId:inline.id,field:'tipo',value:c.tipo,classifications:[a,c],expectedClassifications:[a,b]},403,sellerCookie);
 await db.updateTable('crmAccounts').set({doNotContact:true,assignedUserEmail:seller.email}).where('id','=',inline.id).execute();
 await quickWrite({id:inline.id,accountId:inline.id,field:'tipo',value:c.tipo,classifications:[a,c],expectedClassifications:[a,b]},403,sellerCookie);
 assert.deepEqual(await db.selectFrom('crmAccountClassifications').select(['tipo','subtipo']).where('accountId','=',inline.id).execute(),inlineRowsBefore,'Unauthorized inline writes leave rows unchanged');
 await db.updateTable('crmAccounts').set({doNotContact:false}).where('id','=',inline.id).execute();
 await quickWrite({id:inline.id,accountId:inline.id,field:'tipo',value:c.tipo,classifications:[a,c],expectedClassifications:[a,b]});
 let inlineRows=await db.selectFrom('crmAccountClassifications').select(['tipo','subtipo']).where('accountId','=',inline.id).orderBy('id').execute();assert.deepEqual(inlineRows.map(x=>x.tipo).sort(),[a.tipo,c.tipo].sort());
 await quickWrite({id:inline.id,accountId:inline.id,field:'tipo',value:b.tipo,expectedClassification:{tipo:a.tipo,subtipo:a.subtipo}});
 inlineRows=await db.selectFrom('crmAccountClassifications').select(['tipo','subtipo']).where('accountId','=',inline.id).orderBy('id').execute();assert.deepEqual(inlineRows.map(x=>x.tipo).sort(),[b.tipo,c.tipo].sort(),'Inline scalar compatibility keeps the secondary pair');
 await quickWrite({id:inline.id,accountId:inline.id,field:'tipo',value:a.tipo,classifications:[a,b],expectedClassifications:[a,c]},409);
 inlineRows=await db.selectFrom('crmAccountClassifications').select(['tipo','subtipo']).where('accountId','=',inline.id).orderBy('id').execute();assert.deepEqual(inlineRows.map(x=>x.tipo).sort(),[b.tipo,c.tipo].sort());
 await write({action:'account_save',id:saved.id,nombre:'Classification '+stamp,classifications:[a,b]},403,undefined,sellerCookie);
 assert.deepEqual((await rows()).map(row=>row.tipo).sort(),[a.tipo,c.tipo].sort(),'Unauthorized seller list write leaves rows unchanged');
 const restricted=await write({action:'account_save',nombre:'No contact classification '+stamp,assignedUserEmail:seller.email,classifications:[a]});await db.updateTable('crmAccounts').set({doNotContact:true}).where('id','=',restricted.id).execute();
 const restrictedRows=()=>db.selectFrom('crmAccountClassifications').select(['tipo','subtipo']).where('accountId','=',restricted.id).execute();
 await write({action:'account_save',id:restricted.id,nombre:'No contact classification '+stamp,classifications:[b]},403,undefined,sellerCookie);
 assert.deepEqual(await restrictedRows(),[{tipo:a.tipo,subtipo:a.subtipo}],'No contactar seller write leaves rows unchanged');
 const mergedSource=await write({action:'account_save',nombre:'Merged classification source '+stamp,classifications:[a]});const mergedDest=await write({action:'account_save',nombre:'Merged classification destination '+stamp,classifications:[b]});await db.updateTable('crmAccounts').set({mergedIntoId:mergedDest.id,mergedAt:new Date()}).where('id','=',mergedSource.id).execute();
 const mergedRows=await db.selectFrom('crmAccountClassifications').select(['tipo','subtipo']).where('accountId','=',mergedSource.id).execute();await write({action:'account_save',id:mergedSource.id,nombre:'Mutated merged '+stamp,classifications:[b]},403);assert.deepEqual(await db.selectFrom('crmAccountClassifications').select(['tipo','subtipo']).where('accountId','=',mergedSource.id).execute(),mergedRows,'Merged business save rejection leaves classifications unchanged');
 console.log('Account classifications: diff identity, validation, legacy scalar, display/journal, and inline optimistic conflict passed');
}finally{await db.destroy();}
