// Spec 91 §12: POST /_api/communication/seen and the lastSeenAt of GET /_api/communication. Permissions (same read check as the GET),
// GREATEST (never backwards), the future cap at the server's now(), own-row-only writes (no journal, no history) and the cascades.
import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import superjson from 'superjson';import {sql} from 'kysely';
import {db} from '../src/helpers/db';import {get,seen} from '../src/endpoints/communication';import {app} from '../src/server/app';import {setServerSession} from '../src/helpers/getSetServerSession';
assert.equal(process.env.CRM_TEST_DATABASE,'1');const stamp=Date.now();
async function identity(role:'admin'|'user'){const u=await db.insertInto('users').values({email:`communication-reads-${role}-${randomUUID()}@example.com`,displayName:role,role}).returningAll().executeTakeFirstOrThrow();const s={id:u.email,createdAt:Date.now(),lastAccessed:Date.now()};await db.insertInto('sessions').values({id:s.id,userId:u.id,expiresAt:new Date(Date.now()+3600000)}).execute();const r=new Response();await setServerSession(r,s);return {user:u,cookie:r.headers.get('set-cookie')!.split(';')[0]};}
const mark=async(body:unknown,cookie:string,status=200)=>{const r=await seen(new Request('http://localhost/_api/communication/seen',{method:'POST',headers:{cookie},body:superjson.stringify(body)}));const d=superjson.parse<any>(await r.text());assert.equal(r.status,status,d?.error);return d;};
const read=async(accountId:string,cookie:string,status=200)=>{const r=await get(new Request('http://localhost/_api/communication?accountId='+accountId,{headers:{cookie}}));const d=superjson.parse<any>(await r.text());assert.equal(r.status,status,d?.error);return d;};
const row=async(userId:number,accountId:string)=>(await sql<{lastSeenAt:Date}>`SELECT last_seen_at AS "lastSeenAt" FROM crm_communication_reads WHERE user_id=${userId} AND account_id=${accountId}`.execute(db)).rows[0];
const count=async(table:'crm_communication_journal'|'crm_commercial_journal',accountId:string)=>Number((await sql<{n:string}>`SELECT count(*) n FROM ${sql.table(table)} WHERE account_id=${accountId}`.execute(db)).rows[0].n);
const created:string[]=[];
try{
 const admin=await identity('admin'),owner=await identity('user'),other=await identity('user');
 const business=async(over:Record<string,unknown>={})=>{const a=await db.insertInto('crmAccounts').values({nombre:'Zz Lecturas '+stamp+' '+created.length,assignedUserEmail:owner.user.email,...over}).returningAll().executeTakeFirstOrThrow();created.push(String(a.id));return String(a.id);};
 const open=await business(),archived=await business({archivedAt:new Date()}),trashed=await business({deletedAt:new Date()});
 // Unauthenticated and invalid input.
 assert.equal((await seen(new Request('http://localhost/_api/communication/seen',{method:'POST',body:superjson.stringify({accountId:open,seenAt:new Date()})}))).status,401);
 await mark({accountId:'abc',seenAt:new Date()},owner.cookie,400);await mark({accountId:open,seenAt:'yesterday'},owner.cookie,400);await mark({accountId:open},owner.cookie,400);
 // An oversized body is refused from its Content-Length, before reading it.
 {const r=await seen(new Request('http://localhost/_api/communication/seen',{method:'POST',headers:{cookie:owner.cookie,'content-length':'5000'},body:superjson.stringify({accountId:open,seenAt:new Date()})}));assert.equal(r.status,400);assert.match(superjson.parse<any>(await r.text()).error,/demasiado grande/);assert.equal(await row(owner.user.id,open),undefined);}
 // The route is registered on the server app (same-origin POST).
 assert.notEqual((await app.request('/_api/communication/seen',{method:'POST',headers:{origin:'http://localhost'}})).status,404);
 // First visit: GET reports null and does not write anything.
 assert.equal((await read(open,owner.cookie)).lastSeenAt,null);assert.equal(await row(owner.user.id,open),undefined,'GET is read-only');
 const journalBefore=await count('crm_communication_journal',open),historyBefore=await count('crm_commercial_journal',open);
 const t1=new Date(Date.now()-3*3600000),t0=new Date(t1.getTime()-3600000),t2=new Date(t1.getTime()+3600000);
 assert.equal((await mark({accountId:open,seenAt:t1},owner.cookie)).lastSeenAt.getTime(),t1.getTime());
 assert.equal((await read(open,owner.cookie)).lastSeenAt.getTime(),t1.getTime(),'GET returns the caller own previous visit');
 // GREATEST: an older timestamp never moves the marker backwards; a newer one moves it forward.
 assert.equal((await mark({accountId:open,seenAt:t0},owner.cookie)).lastSeenAt.getTime(),t1.getTime());assert.equal((await row(owner.user.id,open)).lastSeenAt.getTime(),t1.getTime());
 assert.equal((await mark({accountId:open,seenAt:t2},owner.cookie)).lastSeenAt.getTime(),t2.getTime());
 // Future cap: a timestamp ahead of the server clock is stored as the server's now().
 const before=Date.now(),future=await mark({accountId:open,seenAt:new Date(Date.now()+30*86400000)},owner.cookie),after=Date.now();
 assert(future.lastSeenAt.getTime()>=before-5000&&future.lastSeenAt.getTime()<=after+5000,'a future seenAt is capped at now()');
 // Per user: another user's marker is separate, and nobody else's row changes.
 assert.equal((await read(open,other.cookie)).lastSeenAt,null,'read state is per user');
 await mark({accountId:open,seenAt:t0},other.cookie);assert.equal((await row(other.user.id,open)).lastSeenAt.getTime(),t0.getTime());assert.equal((await row(owner.user.id,open)).lastSeenAt.getTime(),future.lastSeenAt.getTime());
 // Not a business write: no journal, no history.
 assert.equal(await count('crm_communication_journal',open),journalBefore,'seen writes no communication journal');assert.equal(await count('crm_commercial_journal',open),historyBefore,'seen writes no business history');
 // Permissions mirror the GET: a seller cannot mark an archived business of someone else, nor a trashed one; its owner and an admin can.
 await read(archived,other.cookie,403);await mark({accountId:archived,seenAt:t1},other.cookie,403);assert.equal(await row(other.user.id,archived),undefined);
 await read(archived,owner.cookie);await mark({accountId:archived,seenAt:t1},owner.cookie);await mark({accountId:archived,seenAt:t1},admin.cookie);
 await read(trashed,owner.cookie,403);await mark({accountId:trashed,seenAt:t1},owner.cookie,403);assert.equal(await row(owner.user.id,trashed),undefined);
 const missing=String(BigInt(open)+1000000n);assert.notEqual((await seen(new Request('http://localhost/_api/communication/seen',{method:'POST',headers:{cookie:owner.cookie},body:superjson.stringify({accountId:missing,seenAt:t1})}))).status,200);
 // Cascade: deleting the user or the business removes its read rows.
 await sql`DELETE FROM sessions WHERE user_id=${other.user.id}`.execute(db);await db.deleteFrom('users').where('id','=',other.user.id).execute();
 assert.equal(Number((await sql<{n:string}>`SELECT count(*) n FROM crm_communication_reads WHERE user_id=${other.user.id}`.execute(db)).rows[0].n),0,'deleting a user cascades');
 await db.deleteFrom('crmAccounts').where('id','=',archived).execute();created.splice(created.indexOf(archived),1);
 assert.equal(Number((await sql<{n:string}>`SELECT count(*) n FROM crm_communication_reads WHERE account_id=${archived}`.execute(db)).rows[0].n),0,'deleting a business cascades');
 console.log('Communication reads: auth, input, per-user state, GREATEST, future cap, no journal/history, read permissions and cascades passed');
}finally{
 for(const id of created)await sql`DELETE FROM crm_accounts WHERE id=${id}`.execute(db).catch(()=>{});
 await db.destroy();
}
