import assert from 'node:assert/strict';
import superjson from 'superjson';
import {db} from '../src/helpers/db';
import {setServerSession} from '../src/helpers/getSetServerSession';
import {handle as get} from '../src/endpoints/view_pins_GET';
import {handle as post} from '../src/endpoints/view_pins_POST';
assert.equal(process.env.CRM_TEST_DATABASE,'1','Disposable database required');
const ids:number[]=[];
async function actor(){const user=await db.insertInto('users').values({email:`pins-${Date.now()}-${ids.length}@example.com`,displayName:'Pins',role:'user'}).returningAll().executeTakeFirstOrThrow();ids.push(user.id);const id='pins-'+user.id;await db.insertInto('sessions').values({id,userId:user.id,expiresAt:new Date(Date.now()+3600000)}).execute();const response=new Response();await setServerSession(response,{id,createdAt:Date.now(),lastAccessed:Date.now()});return response.headers.get('set-cookie')!.split(';')[0];}
async function call(handler:typeof get|typeof post,cookie:string,body?:unknown,status=200){const response=await handler(new Request('http://localhost/_api/view_pins',{headers:{cookie},...(body!==undefined?{method:'POST',body:superjson.stringify(body)}:{})}));assert.equal(response.status,status,await response.clone().text());return superjson.parse<Record<string,unknown>>(await response.text());}
try{
 const a=await actor(),b=await actor();await call(get,'',undefined,401);await call(post,'',{entity:'business',config:{order:['system:all'],hidden:[]}},401);assert.deepEqual(await call(get,a),{});
 await call(post,a,{entity:'business',config:{order:['system:all','personal:legacy-'+'a'.repeat(64),'system:custom:123e4567-e89b-12d3-a456-426614174000'],hidden:['system:all']}});assert.deepEqual(await call(get,a),{business:{order:['system:all','personal:legacy-'+'a'.repeat(64),'system:custom:123e4567-e89b-12d3-a456-426614174000'],hidden:[]}});
 for(const stored of ['null','[]']){await db.updateTable('appSettings').set({value:stored}).where('key','=','view_pins:'+ids[0]).execute();await call(post,a,{entity:'business',config:{order:['system:all'],hidden:[]}});assert.deepEqual(await call(get,a),{business:{order:['system:all'],hidden:[]}});}
 await db.updateTable('appSettings').set({value:'not-json'}).where('key','=','view_pins:'+ids[0]).execute();await call(post,a,{entity:'business',config:{order:['system:all'],hidden:[]}});assert.deepEqual(await call(get,a),{business:{order:['system:all'],hidden:[]}});assert.deepEqual(await call(get,b),{});await call(post,b,{entity:'business',config:{order:['system:all'],hidden:[]}});await call(post,a,{entity:'business',config:null});assert.deepEqual(await call(get,a),{});assert.deepEqual((await call(get,b)).business,{order:['system:all'],hidden:[]});await call(post,a,{entity:'business',config:{order:['private:x'],hidden:[]}},400);
 console.log('View pins: auth, per-user isolation, default, save/read, reset, key validation, all pin enforcement and corrupt/non-object JSON recovery passed');
}finally{await db.deleteFrom('appSettings').where('key','in',ids.map(id=>'view_pins:'+id)).execute();await db.deleteFrom('sessions').where('userId','in',ids).execute();await db.deleteFrom('users').where('id','in',ids).execute();await db.destroy();}
