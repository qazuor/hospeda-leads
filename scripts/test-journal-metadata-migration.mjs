import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import postgres from 'postgres';

assert.equal(process.env.CRM_TEST_DATABASE,'1','Use a disposable local database only');
const databaseUrl=new URL(process.env.DATABASE_URL??'');
assert(['localhost','127.0.0.1','::1'].includes(databaseUrl.hostname)||/^172\.17\.(?:\d{1,3})\.(?:\d{1,3})$/.test(databaseUrl.hostname),'DATABASE_URL must point to local PostgreSQL or its default Docker bridge');
const database=postgres(databaseUrl.toString(),{max:1,prepare:false,path:process.env.CRM_TEST_DATABASE_SOCKET,onnotice:()=>{}});
const rollback=new Error('intentional test rollback');
try{
 await database.begin(async tx=>{
  const schema='crm_journal_metadata_'+Date.now();
  await tx.unsafe(`CREATE SCHEMA ${schema}; SET LOCAL search_path TO ${schema},public`);
  for(const name of (await readdir('migrations')).filter(n=>n.endsWith('.sql')&&n<'040').sort())
   await tx.unsafe(await readFile('migrations/'+name,'utf8'));

  const [account]=await tx`INSERT INTO crm_accounts(nombre) VALUES('Journal fixture') RETURNING id`;
  const edit={before:{ciudad:'Paraná'},after:{ciudad:'Colón'}},move={before:{assignedUserEmail:'a@example.test'},after:{assignedUserEmail:'b@example.test'}};
  // The pre-#223 shape: a jsonb string holding the JSON text.
  const insert=(action,metadata)=>tx`INSERT INTO crm_commercial_journal(account_id,action,actor_name,metadata) VALUES(${account.id},${action},'Fixture',to_jsonb(${JSON.stringify(metadata)}::text)) RETURNING id`;
  const [stringEdit]=await insert('account_updated',edit),[stringMove]=await insert('business_assignment_rebalanced',move);
  const [otherAction]=await insert('note_added',{text:'keep me'});
  const [objectEdit]=await tx`INSERT INTO crm_commercial_journal(account_id,action,actor_name,metadata) VALUES(${account.id},'account_updated','Fixture',${JSON.stringify(edit)}::text::jsonb) RETURNING id`;
  const row=async id=>(await tx`SELECT jsonb_typeof(metadata) AS type,metadata FROM crm_commercial_journal WHERE id=${id}`)[0];
  assert.equal((await row(stringEdit.id)).type,'string');

  const migration=await readFile('migrations/040_journal_metadata_repair.sql','utf8');
  await tx.unsafe(migration);
  assert.equal((await row(stringEdit.id)).type,'object');assert.deepEqual((await row(stringEdit.id)).metadata,edit);
  assert.equal((await row(stringMove.id)).type,'object');assert.deepEqual((await row(stringMove.id)).metadata,move);
  assert.equal((await row(otherAction.id)).type,'string','other actions are out of scope');
  assert.equal((await row(objectEdit.id)).type,'object');assert.deepEqual((await row(objectEdit.id)).metadata,edit,'object rows stay untouched');

  await tx.unsafe(migration);
  assert.deepEqual((await row(stringEdit.id)).metadata,edit,'a second run changes nothing');
  console.log('Journal metadata migration: string rows of the two actions unwrapped, other rows untouched, rerun is a no-op passed');
  throw rollback;
 });
}catch(error){if(error!==rollback)throw error;}finally{await database.end();}
