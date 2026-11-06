import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';

assert.equal(process.env.CRM_TEST_DATABASE,'1','Use a disposable database');
const database=postgres(process.env.DATABASE_URL,{max:1,prepare:false,path:process.env.CRM_TEST_DATABASE_SOCKET});
const rollback=new Error('intentional test rollback');
try{
 const tracked=await database`SELECT name FROM schema_migrations WHERE name='066_account_classifications.sql'`;
 assert.equal(tracked.length,1,'Migration runner must record 066 once; reruns are skipped by checksum guard');
 const migration=await readFile('migrations/066_account_classifications.sql','utf8');
 await database.begin(async tx=>{
  const schema=`account_classifications_${Date.now()}`;
  await tx.unsafe(`CREATE SCHEMA ${schema}; SET LOCAL search_path TO ${schema}`);
  await tx.unsafe(`CREATE TABLE crm_accounts(id bigserial PRIMARY KEY,tipo text,subtipo text,deleted_at timestamptz,merged_into_id bigint);
   CREATE FUNCTION bump_crm_live_domain() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$`);
  const [regular,deleted,merged,empty,blank]=await tx`INSERT INTO crm_accounts(tipo,subtipo,deleted_at,merged_into_id) VALUES
   (' Alojamiento ',' Hotel ',now(),NULL),('Gastronomía',NULL,NULL,2),('Experiencias',' ',NULL,NULL),(NULL,'Sin vertical',NULL,NULL),('   ','Nada',NULL,NULL) RETURNING id`;
  await tx.unsafe(migration);
  const rows=await tx`SELECT account_id,tipo,subtipo,created_by FROM crm_account_classifications ORDER BY account_id`;
  assert.deepEqual(rows.map(row=>[Number(row.account_id),row.tipo,row.subtipo,row.created_by]),[
   [Number(regular.id),'Alojamiento','Hotel','migration_066'],[Number(deleted.id),'Gastronomía',null,'migration_066'],[Number(merged.id),'Experiencias',null,'migration_066']
  ]);
  assert.equal(rows.some(row=>Number(row.account_id)===Number(empty.id)||Number(row.account_id)===Number(blank.id)),false);
  async function expectCode(statement,code){
   await tx.unsafe('SAVEPOINT constraint_check');let caught;
   try{await statement();}catch(error){caught=error;}
   assert.equal(caught?.code,code,`Expected PostgreSQL error ${code}`);
   await tx.unsafe('ROLLBACK TO SAVEPOINT constraint_check');await tx.unsafe('RELEASE SAVEPOINT constraint_check');
  }
  await expectCode(()=>tx`INSERT INTO crm_account_classifications(account_id,tipo,subtipo) VALUES(${regular.id},'Alojamiento','Hotel')`,'23505');
  await tx`INSERT INTO crm_account_classifications(account_id,tipo,subtipo) VALUES(${regular.id},'Alojamiento','Camping'),(${regular.id},'Alojamiento','Cabaña'),(${regular.id},'Alojamiento',NULL)`;
  await expectCode(()=>tx`INSERT INTO crm_account_classifications(account_id,tipo,subtipo) VALUES(${regular.id},'','No válida')`,'23514');
  await expectCode(()=>tx`INSERT INTO crm_account_classifications(account_id,tipo,subtipo) VALUES(999999,'Alojamiento',NULL)`,'23503');
  assert.equal(Number((await tx`SELECT count(*) AS n FROM crm_account_classifications WHERE account_id=${regular.id}`)[0].n),4);
  const trigger=await tx`SELECT count(*) AS n FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE t.tgname='crm_account_classifications_live_version' AND n.nspname=${schema} AND NOT t.tgisinternal`;
  assert.equal(Number(trigger[0].n),1);
  throw rollback;
 });
}catch(error){if(error!==rollback)throw error;}finally{await database.end();}
console.log('Account classifications migration: backfill (including deleted and merged accounts), empty legacy values, uniqueness with NULL, multiple subtypes, constraints, live trigger and migration rerun guard passed');
