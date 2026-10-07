import assert from 'node:assert/strict';
import superjson from 'superjson';
import {db} from '../src/helpers/db';
import {setServerSession} from '../src/helpers/getSetServerSession';
import {handle} from '../src/endpoints/business_list_defaults';
import {handle as listBusinesses} from '../src/endpoints/leads_GET';
import {defaultSystemViews} from '../src/helpers/businessSystemViews';
import {basePreferences} from '../src/helpers/businessListPreferences';
assert.equal(process.env.CRM_TEST_DATABASE,'1','Disposable database required');
const key='business_list_team_defaults_v1';
const existing=await db.selectFrom('appSettings').select('value').where('key','=',key).executeTakeFirst();
const ids:number[]=[];const accountIds:string[]=[];
async function actor(role:'admin'|'user'){const user=await db.insertInto('users').values({email:`list-${role}-${Date.now()}@example.com`,displayName:role,role}).returningAll().executeTakeFirstOrThrow();ids.push(user.id);const id='list-'+user.id;await db.insertInto('sessions').values({id,userId:user.id,expiresAt:new Date(Date.now()+3600000)}).execute();const response=new Response();await setServerSession(response,{id,createdAt:Date.now(),lastAccessed:Date.now()});return response.headers.get('set-cookie')!.split(';')[0];}
async function call(cookie:string,body?:unknown,status=200){const r=await handle(new Request('http://localhost/_api/business_list_defaults',{headers:{cookie},...(body?{method:'POST',body:superjson.stringify(body)}:{})}));assert.equal(r.status,status,await r.clone().text());return superjson.parse<any>(await r.text());}
try{const admin=await actor('admin'),seller=await actor('user');const defaults={preferences:basePreferences(),presets:[{id:'colon',name:'Colón',filters:[{rules:[{field:'ciudad',operator:'eq',value:'Colón'}]}]}],initialPresetId:null};
 await call(admin,defaults);assert.deepEqual((await call(seller)).defaults,defaults);await call(seller,{...defaults,initialPresetId:'colon'},403);assert.equal((await call(admin)).defaults.initialPresetId,null);
 const systemViews=defaultSystemViews().reverse().map(v=>({...v,name:'Equipo '+v.name,enabled:v.id!=='today'}));await call(admin,{...defaults,systemViews});assert.deepEqual((await call(seller)).defaults.systemViews,systemViews);await call(seller,{...defaults,systemViews:[]},403);assert.deepEqual((await call(admin)).defaults.systemViews,systemViews);await call(admin,{...defaults,systemViews:[systemViews[0],systemViews[0]]},400);
 await call(admin,{...defaults,initialPresetId:'missing'},400);await call(admin,{...defaults,preferences:{...defaults.preferences,columns:['email']}},400);await call(admin,{...defaults,preferences:{...defaults.preferences,filters:[{rules:[{field:'deletedAt',operator:'is_true'}]}]}},400);await call('',undefined,401);
 await call(admin,{...defaults,initialPresetId:'colon'});assert.equal((await call(seller)).defaults.initialPresetId,'colon');const owner=await db.selectFrom('users').select('email').where('id','=',ids[0]).executeTakeFirstOrThrow();
 const prefix='Anchor fixture '+Date.now();
 for(let i=0;i<25;i++){const a=await db.insertInto('crmAccounts').values({nombre:prefix+' '+String(i).padStart(2,'0'),assignedUserEmail:owner.email}).returning('id').executeTakeFirstOrThrow();accountIds.push(a.id);}
 await db.updateTable('crmAccounts').set({nombre:prefix+' zz'}).where('id','=',accountIds[0]).execute();
 async function listing(extra:Record<string,string>={}){const query=new URLSearchParams({entity:'business',q:prefix,page:'1',pageSize:'10',sortBy:'nombre',sortDir:'asc',anchorAccountId:accountIds[0],...extra});const response=await listBusinesses(new Request('http://localhost/_api/leads?'+query,{headers:{cookie:seller}}));assert.equal(response.status,200,await response.clone().text());return superjson.parse<any>(await response.text());}
 const moved=await listing({alignAnchorPage:'true'});assert.equal(moved.page,3);assert.equal(moved.anchorPage,3);assert.ok(moved.rows.some((row:any)=>row.accountId===accountIds[0]));assert.equal(moved.rows.find((row:any)=>row.accountId===accountIds[0]).canModify,false);
 const continuous=await listing({alignAnchorPage:'false'});assert.equal(continuous.page,1);assert.equal(continuous.anchorPage,3);
 const excluded=await listing({q:prefix+' 01',alignAnchorPage:'true'});assert.equal(excluded.page,1);assert.equal(excluded.anchorPage,undefined);
 await db.updateTable('crmAccounts').set({archivedAt:new Date()}).where('id','=',accountIds[0]).execute();const archived=await listing({alignAnchorPage:'true'});assert.equal(archived.anchorPage,undefined);assert.equal(archived.total,24);
 console.log('Business anchor restoration: reordered pages, continuous batches, filters and archived access passed');
 console.log('Business list team defaults: shared read, admin write, initial preset and schema validation passed');
}finally{if(accountIds.length)await db.deleteFrom('crmAccounts').where('id','in',accountIds).execute();if(existing)await db.updateTable('appSettings').set({value:existing.value}).where('key','=',key).execute();else await db.deleteFrom('appSettings').where('key','=',key).execute();await db.deleteFrom('sessions').where('userId','in',ids).execute();await db.deleteFrom('users').where('id','in',ids).execute();await db.destroy();}
