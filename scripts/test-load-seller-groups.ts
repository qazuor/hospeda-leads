import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {db} from '../src/helpers/db';

assert.equal(process.env.CRM_TEST_DATABASE,'1','Use disposable DB');
const admin=await db.selectFrom('users').select('email').where('role','=','admin').where('deactivatedAt','is',null).executeTakeFirstOrThrow();
const seller=await db.selectFrom('users').select('email').where('role','=','user').where('deactivatedAt','is',null).executeTakeFirstOrThrow();
const rows=[] as Array<{id:string;name:string}>;
const dir=await mkdtemp(join(tmpdir(),'seller-groups-'));
const run=(input:unknown,apply=false)=>{
 const path=join(dir,'input.json');
 return writeFile(path,JSON.stringify(input)).then(()=>spawnSync(process.execPath,['--import','tsx','scripts/load-seller-groups.mjs','--file',path,...(apply?['--apply','--actor',admin.email]:[])],{encoding:'utf8',env:process.env}));
};
const make=async(name:string,email:string)=>{const row=await db.insertInto('crmAccounts').values({nombre:name,assignedUserEmail:email}).returning('id').executeTakeFirstOrThrow();rows.push({id:String(row.id),name});return String(row.id);};
try{
 const a=await make('Load seller group A '+randomUUID(),seller.email),b=await make('Load seller group B '+randomUUID(),seller.email);
 const c=await make('Load seller group C '+randomUUID(),admin.email),d=await make('Load seller group D '+randomUUID(),seller.email);
 const before=await db.selectFrom('crmAccountSellerGroupMembers').select(eb=>eb.fn.countAll().as('count')).executeTakeFirstOrThrow();
 const rootObject=await run({accounts:[c,d]});assert.equal(rootObject.status,0,rootObject.stderr);assert.match(rootObject.stdout,/different sellers and no sellerEmail/);
 const dry=await run([[a,b],{accounts:[c,d]}]);assert.equal(dry.status,0,dry.stderr);assert.match(dry.stdout,/different sellers and no sellerEmail/);
 const afterDry=await db.selectFrom('crmAccountSellerGroupMembers').select(eb=>eb.fn.countAll().as('count')).executeTakeFirstOrThrow();assert.equal(String(afterDry.count),String(before.count),'Dry run makes no writes');
 const applied=await run([[a,b],{accounts:[c,d]}],true);assert.equal(applied.status,0,applied.stderr);assert.match(applied.stdout,/applied=1/);assert.match(applied.stdout,/skipped=1/);
 const membership=await db.selectFrom('crmAccountSellerGroupMembers').select('groupId').where('accountId','=',a).executeTakeFirstOrThrow();assert.equal((await db.selectFrom('crmAccountSellerGroupMembers').select('groupId').where('accountId','=',b).executeTakeFirstOrThrow()).groupId,membership.groupId);
 const repeated=await run([[a,b]],true);assert.equal(repeated.status,0,repeated.stderr);assert.match(repeated.stdout,/alreadyLinked=1/);assert.match(repeated.stdout,/applied=0/);
 // Review fixes: sellers of group members outside the file count and are listed; inactive businesses and unknown sellers are skipped.
 await db.updateTable('crmAccounts').set({assignedUserEmail:admin.email}).where('id','=',b).execute();
 const x=await make('Load seller group X '+randomUUID(),seller.email);
 const outside=await run([[a,x]],true);assert.equal(outside.status,0,outside.stderr);assert.match(outside.stdout,new RegExp('also in the group.*H'+b));assert.match(outside.stdout,/different sellers and no sellerEmail/);assert.match(outside.stdout,/applied=0/);
 assert.equal(await db.selectFrom('crmAccountSellerGroupMembers').select('groupId').where('accountId','=',x).executeTakeFirst(),undefined,'Outside seller conflict writes nothing');
 const y=await make('Load seller group Y '+randomUUID(),seller.email),z=await make('Load seller group Z '+randomUUID(),seller.email);await db.updateTable('crmAccounts').set({archivedAt:new Date()}).where('id','=',y).execute();
 const archived=await run([[y,z]],true);assert.match(archived.stdout,/skipped: archived/);assert.match(archived.stdout,/applied=0/);
 const unknown=await run([{accounts:[c,d],sellerEmail:'nobody-'+randomUUID()+'@example.com'}],true);assert.match(unknown.stdout,/unknown sellerEmail/);assert.match(unknown.stdout,/applied=0/);
 const invalid=await run([[a,a]]);assert.notEqual(invalid.status,0);assert.match(invalid.stderr,/distinct numeric account IDs/);
 console.log('Seller group loader: dry run, apply, different seller skip and idempotent rerun passed');
}finally{
 if(rows.length){await db.deleteFrom('crmCommercialJournal').where('accountId','in',rows.map(row=>row.id)).execute();await db.deleteFrom('crmAccounts').where('id','in',rows.map(row=>row.id)).execute();}
 await rm(dir,{recursive:true,force:true});await db.destroy();
}
