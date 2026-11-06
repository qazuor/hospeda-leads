import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import superjson from 'superjson';
import {db} from '../src/helpers/db';
import {setServerSession} from '../src/helpers/getSetServerSession';
import {heartbeat,online} from '../src/endpoints/presence';
import {presence as userscriptPresence} from '../src/endpoints/userscript';
import {createUserscriptToken,hashUserscriptToken} from '../src/helpers/userscriptTokens';
import {USERSCRIPT_VERSION} from '../userscript/src/version';

assert.equal(process.env.CRM_TEST_DATABASE,'1','Disposable database required');
const created:number[]=[];
async function actor(role:'admin'|'user',deactivatedAt:Date|null=null){
  const user=await db.insertInto('users').values({email:`presence-${randomUUID()}@example.test`,displayName:`Presence ${role}`,role,deactivatedAt}).returningAll().executeTakeFirstOrThrow();created.push(user.id);
  const id=`presence-${user.id}`;await db.insertInto('sessions').values({id,userId:user.id,expiresAt:new Date(Date.now()+3_600_000),lastAccessed:new Date('2026-01-01T00:00:00Z')}).execute();
  const response=new Response();await setServerSession(response,{id,createdAt:Date.now(),lastAccessed:Date.now()});
  return {user,cookie:response.headers.get('set-cookie')!.split(';')[0]!};
}
function request(path:string,cookie:string,method='GET',body?:unknown){return new Request(`http://localhost/_api/presence/${path}`,{method,headers:{cookie,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:superjson.stringify(body)})});}
async function result(response:Response){return superjson.parse<unknown>(await response.text());}
try{
  const admin=await actor('admin'),seller=await actor('user'),inactive=await actor('user',new Date());
  assert.equal((await heartbeat(request('heartbeat',admin.cookie,'POST',{}))).status,200,'admin heartbeat accepted');
  const first=await db.selectFrom('userPresence').select(['lastSeenAt','source']).where('userId','=',admin.user.id).where('source','=','crm').executeTakeFirstOrThrow();assert.ok(first.lastSeenAt,'heartbeat writes CRM presence');
  const sessionBefore=await db.selectFrom('sessions').select(['lastAccessed','expiresAt']).where('userId','=',admin.user.id).executeTakeFirstOrThrow();
  assert.equal((await heartbeat(request('heartbeat',admin.cookie,'POST',{}))).status,200,'repeated heartbeat accepted');
  const sessionAfter=await db.selectFrom('sessions').select(['lastAccessed','expiresAt']).where('userId','=',admin.user.id).executeTakeFirstOrThrow();assert.deepEqual(sessionAfter,sessionBefore,'heartbeat does not change session timestamps');
  await db.insertInto('userPresence').values({userId:seller.user.id,source:'crm',lastSeenAt:new Date(Date.now()-180_000)}).execute();
  await db.insertInto('userPresence').values({userId:inactive.user.id,source:'crm',lastSeenAt:new Date()}).execute();
  const list=await online(request('online',admin.cookie));assert.equal(list.status,200,'admin can list active users');
  const output=await result(list) as {users:{id:number}[];windowSeconds:number};assert.equal(output.windowSeconds,120);assert.ok(output.users.some(user=>user.id===admin.user.id),'online response includes requesting admin');assert.ok(!output.users.some(user=>user.id===seller.user.id),'users outside two-minute window are excluded');assert.ok(!output.users.some(user=>user.id===inactive.user.id),'deactivated users are excluded');
  assert.equal((await online(request('online',seller.cookie))).status,403,'seller cannot list online users');
  const rawToken=createUserscriptToken();await db.insertInto('crmUserscriptTokens').values({id:randomUUID(),userId:seller.user.id,tokenHash:hashUserscriptToken(rawToken),label:'presence integration'}).execute();
  const scriptBeat=await userscriptPresence(new Request('http://localhost/_api/userscript/presence',{method:'POST',headers:{Authorization:`Bearer ${rawToken}`,'X-Hospeda-Userscript-Version':USERSCRIPT_VERSION,'content-type':'application/json'},body:JSON.stringify({source:'whatsapp'})}));assert.equal(scriptBeat.status,200,'userscript token beat is accepted');
  const scriptList=await result(await online(request('online',admin.cookie))) as {users:{id:number;sources:string[]}[]};assert.ok(scriptList.users.find(user=>user.id===seller.user.id)?.sources.includes('whatsapp'),'WhatsApp userscript source is listed');
  assert.equal((await heartbeat(request('heartbeat',seller.cookie,'POST',{unexpected:true}))).status,400,'heartbeat validates its input');
  console.log('Presence: CRM and userscript heartbeat, session preservation, two-minute window, admin-only list, deactivated-user exclusion and Zod validation passed');
}finally{
  await db.deleteFrom('sessions').where('userId','in',created).execute();await db.deleteFrom('users').where('id','in',created).execute();await db.destroy();
}
