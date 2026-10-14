import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import postgres from 'postgres';

assert.equal(process.env.CRM_TEST_DATABASE,'1','Use a disposable local database only');
const databaseUrl=new URL(process.env.DATABASE_URL??'');
assert(['localhost','127.0.0.1','::1'].includes(databaseUrl.hostname)||/^172\.17\.(?:\d{1,3})\.(?:\d{1,3})$/.test(databaseUrl.hostname),'DATABASE_URL must point to local PostgreSQL or its default Docker bridge');
const database=postgres(databaseUrl.toString(),{max:1,prepare:false,path:process.env.CRM_TEST_DATABASE_SOCKET});
const rollback=new Error('intentional test rollback');
try{
 await database.begin(async tx=>{
  const schema='crm_communication_product_'+Date.now();
  await tx.unsafe(`CREATE SCHEMA ${schema}; SET LOCAL search_path TO ${schema}`);
  for(const name of (await readdir('migrations')).filter(n=>n.endsWith('.sql')&&n<'022').sort())
   await tx.unsafe(await readFile('migrations/'+name,'utf8'));

  const [user]=await tx`INSERT INTO users(email,display_name,role) VALUES('communication-migration@example.test','Migration fixture','admin') RETURNING email`;
  const [account]=await tx`INSERT INTO crm_accounts(nombre) VALUES('Migration fixture') RETURNING id`;
  const [sequence]=await tx`INSERT INTO crm_sequences(name,scope,steps,owner_email) VALUES('Fixture','general','[]'::jsonb,${user.email}) RETURNING id`;
  const [run]=await tx`INSERT INTO crm_sequence_runs(id,account_id,original_account_id,sequence_id,snapshot,owner_email) VALUES(gen_random_uuid(),${account.id},${account.id},${sequence.id},'{}'::jsonb,${user.email}) RETURNING id`;

  await tx.unsafe(await readFile('migrations/022_communication_product_model.sql','utf8'));
  assert.equal((await tx`SELECT to_regclass('crm_sequences') AS table`)[0].table,null);
  assert.equal((await tx`SELECT to_regclass('crm_sequence_runs') AS table`)[0].table,null);
  assert.equal(Number((await tx`SELECT count(*) AS n FROM crm_resource_journal WHERE entity IN ('crm_sequences','crm_sequence_runs')`)[0].n),0,'sequence cleanup must not leave audit rows for removed records');
  assert.equal(Number((await tx`SELECT count(*) AS n FROM crm_communication_journal`)[0].n),0);
  assert.equal((await tx`SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='crm_messages' AND column_name='purpose'`)[0].column_name,'purpose');
  assert.equal((await tx`SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='message_templates' AND column_name='management_type'`)[0].column_name,'management_type');
  assert(run.id);
  console.log('Communication product migration: isolated schema upgrade and sequence cleanup passed');
  throw rollback;
 });
}catch(error){if(error!==rollback)throw error;}finally{await database.end();}
