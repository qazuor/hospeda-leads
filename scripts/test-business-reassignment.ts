import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import superjson from 'superjson';
import {db} from '../src/helpers/db';
import {setServerSession} from '../src/helpers/getSetServerSession';
import {get,post} from '../src/endpoints/business_reassignment';

assert.equal(process.env.CRM_TEST_DATABASE,'1','Use disposable test database');
const suffix=randomUUID(),adminEmail=`rebalance-admin-${suffix}@example.com`,sellerEmail=`rebalance-seller-${suffix}@example.com`;
const admin=await db.insertInto('users').values({email:adminEmail,displayName:'Rebalance admin',role:'admin'}).returningAll().executeTakeFirstOrThrow();
const seller=await db.insertInto('users').values({email:sellerEmail,displayName:'Rebalance seller',role:'user'}).returningAll().executeTakeFirstOrThrow();
const accounts:string[]=[],groups:string[]=[];
let assignmentSnapshot:{id:string;assignedUserEmail:string|null}[]=[];
async function cookieFor(userId:number,email:string){const id=`${email}-${randomUUID()}`;await db.insertInto('sessions').values({id,userId,expiresAt:new Date(Date.now()+3600000)}).execute();const response=new Response();await setServerSession(response,{id,createdAt:Date.now(),lastAccessed:Date.now()});return response.headers.get('set-cookie')!.split(';')[0]!;}
const adminCookie=await cookieFor(admin.id,adminEmail),sellerCookie=await cookieFor(seller.id,sellerEmail);
const request=(cookie:string)=>new Request('http://localhost/_api/business_reassignment',{headers:{Cookie:cookie}});
const postPlan=(cookie:string,fingerprint:string)=>post(new Request('http://localhost/_api/business_reassignment',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:superjson.stringify({fingerprint})}));
const readPlan=async(cookie:string)=>superjson.parse(await(await get(request(cookie))).text()) as {fingerprint:string;moves:{accountId:string;groupId:string|null}[];groups:{groupId:string;accountIds:string[]}[]};
try{
 assignmentSnapshot=await db.selectFrom('crmAccounts').select(['id','assignedUserEmail']).execute().then(rows=>rows.filter(row=>!accounts.includes(String(row.id))).map(row=>({id:String(row.id),assignedUserEmail:row.assignedUserEmail})));
 const first=await db.insertInto('crmAccounts').values({nombre:`Rebalance pair A ${suffix}`,status:'new',assignedUserEmail:adminEmail}).returning('id').executeTakeFirstOrThrow();accounts.push(String(first.id));
 const second=await db.insertInto('crmAccounts').values({nombre:`Rebalance pair B ${suffix}`,status:'new',assignedUserEmail:adminEmail}).returning('id').executeTakeFirstOrThrow();accounts.push(String(second.id));
 const third=await db.insertInto('crmAccounts').values({nombre:`Rebalance added ${suffix}`,status:'new',assignedUserEmail:adminEmail}).returning('id').executeTakeFirstOrThrow();accounts.push(String(third.id));
 const group=await db.insertInto('crmAccountSellerGroups').values({createdBy:adminEmail,note:'Integration fixture'}).returning('id').executeTakeFirstOrThrow();groups.push(String(group.id));
 await db.insertInto('crmAccountSellerGroupMembers').values(accounts.slice(0,2).map(accountId=>({groupId:String(group.id),accountId,addedBy:adminEmail}))).execute();
 let plan=await readPlan(adminCookie);assert.ok(plan.groups.some(item=>item.groupId===String(group.id)),'GET returns linked group');
 const stale=plan.fingerprint;await db.updateTable('crmAccounts').set({status:'reviewed'}).where('id','=',accounts[0]!).execute();const beforeStalePost=await db.selectFrom('crmAccounts').select(['id','assignedUserEmail','updatedAt']).where('id','in',accounts.slice(0,2)).orderBy('id').execute();
 const staleResponse=await postPlan(adminCookie,stale);assert.equal(staleResponse.status,400,'Stale fingerprint is rejected');const afterStalePost=await db.selectFrom('crmAccounts').select(['id','assignedUserEmail','updatedAt']).where('id','in',accounts.slice(0,2)).orderBy('id').execute();assert.deepEqual(afterStalePost,beforeStalePost,'Stale plan changes no account state');assert.equal(await db.selectFrom('crmCommercialJournal').select('id').where('accountId','in',accounts.slice(0,2)).where('action','=','business_assignment_rebalanced').execute().then(rows=>rows.length),0,'Stale plan writes no reassignment journal rows');
 await db.updateTable('crmAccounts').set({status:'new',reviewStatus:null}).where('id','=',accounts[0]!).execute();plan=await readPlan(adminCookie);
 const pairMoves=plan.moves.filter(move=>move.groupId===String(group.id));assert.equal(pairMoves.length,2,'Both linked members are included in the plan');
 const posted=await postPlan(adminCookie,plan.fingerprint);assert.equal(posted.status,200,'Fresh group plan executes');
 const assigned=await db.selectFrom('crmAccounts').select('assignedUserEmail').where('id','in',accounts.slice(0,2)).execute();assert.equal(new Set(assigned.map(row=>row.assignedUserEmail)).size,1,'Pair moved together');assert.notEqual(assigned[0]?.assignedUserEmail,adminEmail,'Pair moved to an active seller');
 const journal=await db.selectFrom('crmCommercialJournal').select('accountId').where('accountId','in',accounts.slice(0,2)).where('action','=','business_assignment_rebalanced').execute();assert.equal(journal.length,2,'One journal row is written per moved account');
 plan=await readPlan(adminCookie);await db.insertInto('crmAccountSellerGroupMembers').values({groupId:String(group.id),accountId:accounts[2]!,addedBy:adminEmail}).execute();
 assert.equal((await postPlan(adminCookie,plan.fingerprint)).status,400,'Adding a member invalidates the preview fingerprint');
 assert.equal((await get(request(sellerCookie))).status,403,'Non-admin cannot preview');assert.equal((await postPlan(sellerCookie,plan.fingerprint)).status,403,'Non-admin cannot execute');
 console.log('Business reassignment integration test passed');
}finally{
 if(accounts.length){await db.deleteFrom('crmCommercialJournal').where('accountId','in',accounts).execute();await db.deleteFrom('leadJournal').where('accountId','in',accounts).execute();await db.deleteFrom('crmPipelineEvents').where('accountId','in',accounts).execute();}
 await db.deleteFrom('crmCommercialJournal').where('actorEmail','=',adminEmail).execute();
 for(const row of assignmentSnapshot)await db.updateTable('crmAccounts').set({assignedUserEmail:row.assignedUserEmail}).where('id','=',row.id).where('mergedIntoId','is',null).where('assignedUserEmail','is distinct from',row.assignedUserEmail).execute();
 if(groups.length)await db.deleteFrom('crmAccountSellerGroups').where('id','in',groups).execute();
 if(accounts.length)await db.deleteFrom('crmAccounts').where('id','in',accounts).execute();
 await db.deleteFrom('sessions').where('userId','in',[admin.id,seller.id]).execute();
 await db.deleteFrom('users').where('id','in',[admin.id,seller.id]).execute();
 await db.destroy();
}
