import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import postgres from 'postgres';
assert.equal(process.env.CRM_TEST_DATABASE,'1','Use a disposable DB');
const database=postgres(process.env.DATABASE_URL,{max:1,prepare:false});
const rollback=new Error('intentional test rollback');
try{
 await database.begin(async tx=>{
  const schema='crm_explicit_migration_test_'+Date.now();
  await tx.unsafe(`CREATE SCHEMA ${schema}; SET LOCAL search_path TO ${schema}`);
  for(const name of (await readdir('migrations')).filter(n=>n.endsWith('.sql')&&n<'014').sort())await tx.unsafe(await readFile('migrations/'+name,'utf8'));
  await tx`INSERT INTO users(email,display_name,role) VALUES('historical@example.com','Historical owner','user')`;
  const [old]=await tx`INSERT INTO leads(nombre,assigned_user_email,contact_name,telefono,notas) VALUES('Conservar','historical@example.com','Persona histórica','123','Nota original') RETURNING id,account_id`;
  await tx`INSERT INTO lead_notes(lead_id,note) VALUES(${old.id},'No eliminar')`;
  await tx`INSERT INTO lead_journal(lead_id,lead_name,actor_name,action) VALUES(${old.id},'Conservar','Test','created')`;
  const snapshot={};
  for(const table of ['leads','crm_accounts','crm_contacts','lead_notes','lead_journal','crm_tasks','crm_activities','crm_pipeline_events','crm_import_batches'])snapshot[table]=await tx.unsafe(`SELECT * FROM ${table} ORDER BY id`);
  await tx.unsafe(await readFile('migrations/014_explicit_management.sql','utf8'));
  for(const table of Object.keys(snapshot)){
   const next=await tx.unsafe(`SELECT * FROM ${table} ORDER BY id`);
   assert.deepEqual(next.map(({creation_request_key,creation_request_hash,...r})=>r),snapshot[table].map(r=>({...r})),table+' historical data survives');
  }
  await tx`SAVEPOINT reject_legacy`;
  try{await tx`INSERT INTO leads(nombre) VALUES('Should fail')`;assert.fail('Legacy insert must be rejected');}
  catch(e){assert.match(e.message,/iniciá la gestión explícitamente/);await tx`ROLLBACK TO SAVEPOINT reject_legacy`;}
  assert.equal(Number((await tx`SELECT count(*) AS n FROM crm_accounts`)[0].n),snapshot.crm_accounts.length);
  const [newBusiness]=await tx`INSERT INTO crm_accounts(nombre) VALUES('Sin gestión') RETURNING id`;
  assert.equal(Number((await tx`SELECT count(*) AS n FROM leads WHERE account_id=${newBusiness.id}`)[0].n),0);
  const [explicit]=await tx`INSERT INTO leads(nombre,account_id,opportunity_name) VALUES('Ignored projection',${old.account_id},'Propuesta explícita') RETURNING nombre,estado`;
  assert.equal(explicit.nombre,'Conservar');assert.equal(explicit.estado,null);
  console.log('Explicit management migration: historical data/owners/notes/history preserved; legacy accountless insert blocked; business-only insert and canonical explicit management projection passed');
  throw rollback;
 });
}catch(e){if(e!==rollback)throw e;}finally{await database.end();}
