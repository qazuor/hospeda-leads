import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {sql} from 'kysely';
import {db} from '../src/helpers/db';
import {displayClassification} from '../src/helpers/accountClassification';

assert.equal(process.env.CRM_TEST_DATABASE,'1','Use disposable DB');
const stamp=Date.now(),admin=await db.selectFrom('users').select('email').where('email','=','admin@example.com').where('deactivatedAt','is',null).executeTakeFirstOrThrow();
const dir=await mkdtemp(join(tmpdir(),'account-classifications-')),ids:string[]=[],verticals:string[]=[];
const run=async(input:unknown,apply=false,actor=admin.email)=>{const path=join(dir,'input.json');await writeFile(path,JSON.stringify(input));return spawnSync(process.execPath,['--import','tsx','scripts/load-account-classifications.mjs','--file',path,...(apply?['--apply','--actor',actor]:[])],{encoding:'utf8',env:process.env});};
const make=async(name:string)=>{const row=await db.insertInto('crmAccounts').values({nombre:name}).returning('id').executeTakeFirstOrThrow();ids.push(String(row.id));return String(row.id);};
const catalog=async(name:string,active=true)=>{verticals.push(name);await db.insertInto('crmVerticals').values({name,active}).execute();return name;};
const subtype=async(tipo:string,name:string,active=true)=>db.insertInto('crmSubtypes').values({name,typeName:tipo,active}).execute();
try{
 const v=await catalog(`Loader V ${stamp}`),v2=await catalog(`Loader V2 ${stamp}`),inactive=await catalog(`Loader inactive ${stamp}`,false),gone=`Loader missing ${stamp}`;
 const good=`Loader subtype ${stamp}`,second=`Loader second subtype ${stamp}`,bad=`Loader inactive subtype ${stamp}`,wrong=`Loader wrong subtype ${stamp}`;await subtype(v,good);await subtype(v,second);await subtype(v,bad,false);await subtype(v2,wrong);
 const account=await make(`Loader target ${stamp}`),same=await make(`Loader same vertical ${stamp}`),merged=await make(`Loader merged ${stamp}`),trash=await make(`Loader trash ${stamp}`),missing='999999999999999';
 await db.insertInto('crmAccountClassifications').values({accountId:account,tipo:v,subtipo:good,createdBy:admin.email}).execute();
 await db.updateTable('crmAccounts').set({mergedIntoId:same}).where('id','=',merged).execute();await db.updateTable('crmAccounts').set({deletedAt:new Date()}).where('id','=',trash).execute();
 const before=await db.selectFrom('crmAccountClassifications').select(eb=>eb.fn.countAll().as('n')).executeTakeFirstOrThrow();
 const input={[account]:[`${v}/${good}`,v2,`${inactive}/x`,`No such vertical ${stamp}`,`${v}/${bad}`,`${v}/No such subtype ${stamp}`], [same]:[`${v}/${good}`,`${v}/${second}`,`${v}/${wrong}`], [merged]:[`${v}/${good}`], [trash]:[`${v}/${good}`], [missing]:[`${v}/${good}`]};
 const dry=await run(input);assert.equal(dry.status,0,dry.stderr);assert.match(dry.stdout,/add=/);assert.match(dry.stdout,/sin cambios/);assert.match(dry.stdout,/business is merged/);assert.match(dry.stdout,/business is in trash/);assert.match(dry.stdout,/does not exist/);
 const badId=await run({'not-numeric':['anything']});assert.notEqual(badId.status,0,'Account IDs must be numeric');
 const badShape=await run({[account]:'not-an-array'});assert.notEqual(badShape.status,0,'Each account value must be an array');
 const badActor=await run({[account]:[v]},true,`missing-${stamp}@example.com`);assert.notEqual(badActor.status,0,'Apply actor must be an active user');
 const afterDry=await db.selectFrom('crmAccountClassifications').select(eb=>eb.fn.countAll().as('n')).executeTakeFirstOrThrow();assert.equal(String(afterDry.n),String(before.n),'Dry run writes nothing');
 const result=await run(input,true);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/Display-copy mismatches: \d+/);assert.match(result.stdout,/rejected=/);
 const pairs=await db.selectFrom('crmAccountClassifications').select(['tipo','subtipo']).where('accountId','=',account).execute();assert(pairs.some(p=>p.tipo===v&&p.subtipo===good),'Existing pair is preserved');assert(pairs.some(p=>p.tipo===v2&&p.subtipo===null),'New pair is added');
 const samePairs=await db.selectFrom('crmAccountClassifications').select(['tipo','subtipo']).where('accountId','=',same).execute();assert(samePairs.some(p=>p.tipo===v&&p.subtipo===good));assert(samePairs.some(p=>p.tipo===v&&p.subtipo===second),'Same vertical may have distinct subtypes');assert(!samePairs.some(p=>p.subtipo===wrong),'Subtype belonging to another vertical is rejected');
 const catalogOrder=(await db.selectFrom('crmVerticals').select('name').orderBy('sortOrder').orderBy('name').execute()).map(row=>row.name),expected=displayClassification({pairs,verticalOrder:catalogOrder}),displayCopy=await db.selectFrom('crmAccounts').select(['tipo','subtipo']).where('id','=',account).executeTakeFirstOrThrow();assert.equal(displayCopy.tipo,expected?.tipo);assert.equal(displayCopy.subtipo,expected?.subtipo,'Display copy follows the helper rule');
 assert((await db.selectFrom('crmCommercialJournal').select('metadata').where('accountId','=',account).where('action','=','account_classifications_changed').execute()).some(row=>JSON.stringify(row.metadata).includes('dedup2_secondary_verticals')),'Journal records reason');
 const rerun=await run(input,true);assert.equal(rerun.status,0,rerun.stderr);assert.match(rerun.stdout,/sin cambios/);assert.match(rerun.stdout,/added=0/);
 const cap=await make(`Loader cap ${stamp}`),capPairs=Array.from({length:8},(_,i)=>({accountId:cap,tipo:`Existing ${i} ${stamp}`,subtipo:null}));await db.insertInto('crmAccountClassifications').values(capPairs).execute();
 const capVertical=await catalog(`Loader ninth ${stamp}`);const capResult=await run({[cap]:[capVertical]},true);assert.equal(capResult.status,0,capResult.stderr);assert.match(capResult.stdout,/maximum of 8/);assert.equal(await db.selectFrom('crmAccountClassifications').select('id').where('accountId','=',cap).execute().then(r=>r.length),8);
 const vGood=await catalog(`Loader failure survivor ${stamp}`);const failureAccount=await make(`Loader failure ${stamp}`),survivor=await make(`Loader survivor ${stamp}`);const trigger=`load_fail_${stamp}`;const fn=`load_fail_fn_${stamp}`;
 await sql.raw(`CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.account_id = ${failureAccount} THEN RAISE EXCEPTION 'intentional loader failure'; END IF; RETURN NEW; END $$`).execute(db);
 await sql.raw(`CREATE TRIGGER ${trigger} BEFORE INSERT ON crm_commercial_journal FOR EACH ROW EXECUTE FUNCTION ${fn}()`).execute(db);
 try{const partial=await run({[failureAccount]:[vGood],[survivor]:[vGood]},true);assert.equal(partial.status,1);assert.match(partial.stdout,/failed=1/);assert.equal(await db.selectFrom('crmAccountClassifications').select('id').where('accountId','=',survivor).execute().then(r=>r.length),1,'Failure does not stop later accounts');}finally{await sql.raw(`DROP TRIGGER IF EXISTS ${trigger} ON crm_commercial_journal`).execute(db);await sql.raw(`DROP FUNCTION IF EXISTS ${fn}()`).execute(db);}
 console.log('Account classification loader: dry run, additive apply, validation, cap, per-business failure, journal, display copy and idempotence passed');
}finally{
 if(ids.length){await db.deleteFrom('crmCommercialJournal').where('accountId','in',ids).execute();await db.deleteFrom('crmAccounts').where('id','in',ids).execute();}
 if(verticals.length){await db.deleteFrom('crmSubtypes').where('typeName','in',verticals).execute();await db.deleteFrom('crmVerticals').where('name','in',verticals).execute();}
 await rm(dir,{recursive:true,force:true});await db.destroy();
}
