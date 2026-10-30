import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import postgres from 'postgres';

assert.equal(process.env.CRM_TEST_DATABASE,'1','Use a disposable local database only');
const databaseUrl=new URL(process.env.DATABASE_URL??'');
assert(['localhost','127.0.0.1','::1'].includes(databaseUrl.hostname)||/^172\.17\.(?:\d{1,3})\.(?:\d{1,3})$/.test(databaseUrl.hostname),'DATABASE_URL must point to local PostgreSQL or its default Docker bridge');
const database=postgres(databaseUrl.toString(),{max:1,prepare:false,path:process.env.CRM_TEST_DATABASE_SOCKET,onnotice:()=>{}});
const rollback=new Error('intentional test rollback');
/** The 042 list: every status must still be accepted after 049. */
const KEPT=['draft','whatsapp_opened','manual_pending','manual_sent','manual_no_contact','manual_not_done','submitting','accepted','delivery_confirmed','failed','unknown','replied','rejected','cancelled','voided'];
try{
 const file='049_instagram_opened.sql',migration=await readFile('migrations/'+file,'utf8');
 // Same checksum rule as scripts/migrate.mjs: an applied migration is immutable.
 const applied=(await database`SELECT checksum FROM schema_migrations WHERE name=${file}`.catch(()=>[]))[0];
 if(applied)assert.equal(applied.checksum,createHash('sha256').update(migration).digest('hex'),'049 was edited after being applied');
 await database.begin(async tx=>{
  const schema='crm_instagram_opened_'+Date.now();
  await tx.unsafe(`CREATE SCHEMA ${schema}; SET LOCAL search_path TO ${schema},public`);
  for(const name of (await readdir('migrations')).filter(n=>n.endsWith('.sql')&&n<'049').sort())await tx.unsafe(await readFile('migrations/'+name,'utf8'));
  const [account]=await tx`INSERT INTO crm_accounts(nombre) VALUES('Zz Instagram migration fixture') RETURNING id`;
  const insert=status=>tx`INSERT INTO crm_messages(id,account_id,original_account_id,channel,recipient,owner_email,status) VALUES(${randomUUID()},${account.id},${account.id},'social','@fixture','fixture@example.test',${status})`;
  await assert.rejects(tx.savepoint(()=>insert('instagram_opened')),/crm_messages_status_check/,'042 does not know instagram_opened');
  // Existing rows with every pre-049 status must survive the constraint swap (ADD CONSTRAINT validates them).
  for(const status of KEPT)await insert(status);
  await tx.unsafe(migration);
  const [{n}]=await tx`SELECT count(*)::int AS n FROM crm_messages WHERE status=ANY(${KEPT})`;
  assert.equal(n,KEPT.length,'all pre-049 rows are still there after 049');
  await insert('instagram_opened');
  for(const status of KEPT)await insert(status);
  await assert.rejects(tx.savepoint(()=>insert('instagram_sent')),/crm_messages_status_check/,'unknown statuses are still refused');
  console.log('Instagram opened migration: checksum unchanged, rows with every 042 status validate, CHECK accepts instagram_opened, keeps the 042 statuses and refuses others passed');
  throw rollback;
 });
}catch(error){if(error!==rollback)throw error;}finally{await database.end();}
