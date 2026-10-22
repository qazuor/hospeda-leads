import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import postgres from 'postgres';

// Migration 036 replaces every message template and the stored variable settings; sent messages keep their snapshots.
assert.equal(process.env.CRM_TEST_DATABASE,'1','Use a disposable local database only');
const databaseUrl=new URL(process.env.DATABASE_URL??'');
assert(['localhost','127.0.0.1','::1'].includes(databaseUrl.hostname)||/^172\.17\.(?:\d{1,3})\.(?:\d{1,3})$/.test(databaseUrl.hostname),'DATABASE_URL must point to local PostgreSQL or its default Docker bridge');
const database=postgres(databaseUrl.toString(),{max:1,prepare:false,path:process.env.CRM_TEST_DATABASE_SOCKET});
const rollback=new Error('intentional test rollback');
try{
 await database.begin(async tx=>{
  const schema='crm_message_catalog_'+Date.now();
  // public stays on the path for extension operator classes (pg_trgm) used by earlier migrations.
  await tx.unsafe(`CREATE SCHEMA ${schema}; SET LOCAL search_path TO ${schema},public`);
  for(const name of (await readdir('migrations')).filter(n=>n.endsWith('.sql')&&n<'036').sort())
   await tx.unsafe(await readFile('migrations/'+name,'utf8'));

  const [user]=await tx`INSERT INTO users(email,display_name,role) VALUES('catalog-migration@example.test','Catalog fixture','admin') RETURNING email`;
  const [account]=await tx`INSERT INTO crm_accounts(nombre) VALUES('Catalog fixture') RETURNING id`;
  const [old]=await tx`INSERT INTO message_templates(channel,name,body) VALUES('whatsapp','Primer contacto viejo','<p>Hola {{contact}}</p>') RETURNING *`;
  await tx`INSERT INTO crm_message_template_versions(template_id,version,snapshot,actor_email) VALUES(${old.id},1,${tx.json({body:old.body})},${user.email})`;
  const snapshot={id:String(old.id),name:old.name,body:old.body};
  await tx`INSERT INTO crm_messages(id,account_id,original_account_id,channel,recipient,body,template_snapshot,owner_email,status) VALUES(gen_random_uuid(),${account.id},${account.id},'whatsapp','+5493442000000','Hola Ana',${tx.json(snapshot)},${user.email},'manual_sent')`;
  await tx`INSERT INTO app_settings(key,value) VALUES('crm_message_variables','[]')`;

  await tx.unsafe(await readFile('migrations/036_message_catalog.sql','utf8'));

  const templates=await tx`SELECT channel,name,purpose,management_type,subject FROM message_templates ORDER BY id`;
  assert.equal(templates.length,33,'11 bases in Email, WhatsApp and Instagram');
  assert(!templates.some(t=>t.name==='Primer contacto viejo'),'old templates are removed');
  assert.deepEqual([...new Set(templates.map(t=>t.channel))].sort(),['email','social','whatsapp']);
  assert(templates.every(t=>t.purpose),'every template declares its purpose');
  assert(templates.filter(t=>t.channel==='email').every(t=>t.subject),'email templates have a subject');
  const versions=await tx`SELECT template_id,version FROM crm_message_template_versions`;
  assert.equal(versions.length,33,'each new template starts at version 1');
  assert(versions.every(v=>v.version===1));
  const [message]=await tx`SELECT body,template_snapshot FROM crm_messages`;
  assert.equal(message.body,'Hola Ana','sent messages keep their text');
  assert.equal(message.template_snapshot.body,'<p>Hola {{contact}}</p>','sent messages keep their template snapshot');
  assert.equal((await tx`SELECT count(*)::int AS n FROM app_settings WHERE key='crm_message_variables'`)[0].n,0,'stored variables are dropped so the built-in catalog applies');
  console.log('Message catalog migration: old templates and settings replaced, 33 templates with versions, sent messages intact');
  throw rollback;
 });
}catch(error){if(error!==rollback)throw error;}finally{await database.end();}
