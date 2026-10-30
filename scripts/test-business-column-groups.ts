import assert from 'node:assert/strict';
import superjson from 'superjson';
import {db} from '../src/helpers/db';
import {setServerSession} from '../src/helpers/getSetServerSession';
import {handle} from '../src/endpoints/business_column_groups';
import {BUSINESS_COLUMN_GROUPS_KEY,DEFAULT_BUSINESS_COLUMN_GROUPS} from '../src/helpers/businessColumnGroups';

assert.equal(process.env.CRM_TEST_DATABASE,'1','Disposable database required');
const existing=await db.selectFrom('appSettings').select('value').where('key','=',BUSINESS_COLUMN_GROUPS_KEY).executeTakeFirst();
await db.deleteFrom('appSettings').where('key','=',BUSINESS_COLUMN_GROUPS_KEY).execute();
const userIds:number[]=[];
async function actor(role:'admin'|'user'){const user=await db.insertInto('users').values({email:`group-${role}-${Date.now()}-${userIds.length}@example.test`,displayName:role,role}).returningAll().executeTakeFirstOrThrow();userIds.push(user.id);const id='group-'+user.id;await db.insertInto('sessions').values({id,userId:user.id,expiresAt:new Date(Date.now()+3600000)}).execute();const response=new Response();await setServerSession(response,{id,createdAt:Date.now(),lastAccessed:Date.now()});return response.headers.get('set-cookie')!.split(';')[0];}
async function call(cookie:string,method:'GET'|'POST'='GET',body?:unknown,status=200){const response=await handle(new Request('http://localhost/_api/business_column_groups',{headers:{cookie,...(method==='POST'?{'content-type':'application/json'}:{})},method,...(method==='POST'?{body:superjson.stringify(body)}:{})}));assert.equal(response.status,status,await response.clone().text());return superjson.parse<unknown>(await response.text());}
try{
 const admin=await actor('admin'),seller=await actor('user');
 assert.deepEqual((await call(seller)) as object,{groups:DEFAULT_BUSINESS_COLUMN_GROUPS});
 const saved=[{id:'seller-contact',name:'Contacto de prueba',members:['contactName','contactPhone']}];
 await call(admin,'POST',saved);assert.deepEqual(await call(seller),{groups:saved});
 await call(seller,'POST',saved,403);await call(admin,'POST',[{id:'invalid',name:'Inválido',members:['nombre','actions']}],400);
 assert.deepEqual(await call(seller),{groups:saved});
 console.log('Business column groups: seeded GET, admin save, seller 403, invalid payload 400 and seller GET passed');
}finally{
 if(existing)await db.updateTable('appSettings').set({value:existing.value}).where('key','=',BUSINESS_COLUMN_GROUPS_KEY).execute();else await db.deleteFrom('appSettings').where('key','=',BUSINESS_COLUMN_GROUPS_KEY).execute();
 await db.deleteFrom('sessions').where('userId','in',userIds).execute();await db.deleteFrom('users').where('id','in',userIds).execute();await db.destroy();
}
