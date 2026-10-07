import assert from 'node:assert/strict';
import superjson from 'superjson';
import {db} from '../src/helpers/db';
import {setServerSession} from '../src/helpers/getSetServerSession';
import {handle} from '../src/endpoints/business_list_defaults';
import {basePreferences} from '../src/helpers/businessListPreferences';
assert.equal(process.env.CRM_TEST_DATABASE,'1','Disposable database required');
const key='business_list_team_defaults_v1';
const existing=await db.selectFrom('appSettings').select('value').where('key','=',key).executeTakeFirst();
const ids:number[]=[];
async function actor(role:'admin'|'user'){const user=await db.insertInto('users').values({email:`list-${role}-${Date.now()}@example.com`,displayName:role,role}).returningAll().executeTakeFirstOrThrow();ids.push(user.id);const id='list-'+user.id;await db.insertInto('sessions').values({id,userId:user.id,expiresAt:new Date(Date.now()+3600000)}).execute();const response=new Response();await setServerSession(response,{id,createdAt:Date.now(),lastAccessed:Date.now()});return response.headers.get('set-cookie')!.split(';')[0];}
async function call(cookie:string,body?:unknown,status=200){const r=await handle(new Request('http://localhost/_api/business_list_defaults',{headers:{cookie},...(body?{method:'POST',body:superjson.stringify(body)}:{})}));assert.equal(r.status,status,await r.clone().text());return superjson.parse<any>(await r.text());}
try{const admin=await actor('admin'),seller=await actor('user');const defaults={preferences:basePreferences(),presets:[{id:'colon',name:'Colón',filters:[{rules:[{field:'ciudad',operator:'eq',value:'Colón'}]}]}],initialPresetId:null};
 await call(admin,defaults);assert.deepEqual((await call(seller)).defaults,defaults);await call(seller,{...defaults,initialPresetId:'colon'},403);assert.equal((await call(admin)).defaults.initialPresetId,null);
 await call(admin,{...defaults,initialPresetId:'missing'},400);await call(admin,{...defaults,preferences:{...defaults.preferences,columns:['email']}},400);await call(admin,{...defaults,preferences:{...defaults.preferences,filters:[{rules:[{field:'deletedAt',operator:'is_true'}]}]}},400);await call('',undefined,401);
 await call(admin,{...defaults,initialPresetId:'colon'});assert.equal((await call(seller)).defaults.initialPresetId,'colon');console.log('Business list team defaults: shared read, admin write, initial preset and schema validation passed');
}finally{if(existing)await db.updateTable('appSettings').set({value:existing.value}).where('key','=',key).execute();else await db.deleteFrom('appSettings').where('key','=',key).execute();await db.deleteFrom('sessions').where('userId','in',ids).execute();await db.deleteFrom('users').where('id','in',ids).execute();await db.destroy();}
