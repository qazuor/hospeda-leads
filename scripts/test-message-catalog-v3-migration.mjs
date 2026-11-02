import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import postgres from 'postgres';

// Migration 058 replaces the 036 catalog with v3 (owner decision 02/11/2026), puts the sales material inside the
// «Envío de la información» messages by title, and keeps sent messages intact.
assert.equal(process.env.CRM_TEST_DATABASE,'1','Use a disposable local database only');
const databaseUrl=new URL(process.env.DATABASE_URL??'');
assert(['localhost','127.0.0.1','::1'].includes(databaseUrl.hostname)||/^172\.17\.(?:\d{1,3})\.(?:\d{1,3})$/.test(databaseUrl.hostname),'DATABASE_URL must point to local PostgreSQL or its default Docker bridge');
const database=postgres(databaseUrl.toString(),{max:1,prepare:false,path:process.env.CRM_TEST_DATABASE_SOCKET});
const rollback=new Error('intentional test rollback');
try{
 await database.begin(async tx=>{
  const schema='crm_message_catalog_v3_'+Date.now();
  // public stays on the path for extension operator classes (pg_trgm) used by earlier migrations.
  await tx.unsafe(`CREATE SCHEMA ${schema}; SET LOCAL search_path TO ${schema},public`);
  for(const name of (await readdir('migrations')).filter(n=>n.endsWith('.sql')&&n<'058').sort())
   await tx.unsafe(await readFile('migrations/'+name,'utf8'));

  const [user]=await tx`INSERT INTO users(email,display_name,role) VALUES('catalog-v3@example.test','Catalog fixture','admin') RETURNING email`;
  const [account]=await tx`INSERT INTO crm_accounts(nombre) VALUES('Catalog fixture') RETURNING id`;
  const [old]=await tx`SELECT * FROM message_templates WHERE name='Relación y novedades · WhatsApp'`;
  assert(old,'the 036 catalog is in place before 058');
  const snapshot={id:String(old.id),name:old.name,body:old.body};
  await tx`INSERT INTO crm_messages(id,account_id,original_account_id,channel,recipient,body,template_snapshot,owner_email,status) VALUES(gen_random_uuid(),${account.id},${account.id},'whatsapp','+5493442000000','Hola Ana',${tx.json(snapshot)},${user.email},'manual_sent')`;
  const [alojamientos]=await tx`INSERT INTO crm_sales_materials(id,title,kind,source,created_by_email) VALUES(gen_random_uuid(),'Presentacion Alojamientos','deliverable','file',${user.email}) RETURNING id`;
  // An archived material is never put inside a message.
  await tx`INSERT INTO crm_sales_materials(id,title,kind,source,status,archived_at,created_by_email) VALUES(gen_random_uuid(),'Folleto','deliverable','file','archived',now(),${user.email})`;

  await tx.unsafe(await readFile('migrations/058_message_catalog_v3.sql','utf8'));

  const templates=await tx`SELECT channel,name,purpose,subject,body FROM message_templates ORDER BY id`;
  assert.equal(templates.length,42,'v3 catalog: 42 templates');
  for(const gone of ['Relación y novedades','Retomar conversación','Coordinación · Pedido de material','Acompañamiento · Bienvenida','Bienvenida · Instagram','Revisión de la ficha · Instagram','Fin de la prueba · Instagram'])
   assert(!templates.some(t=>t.name.startsWith(gone)),`${gone} is removed`);
  assert(templates.every(t=>t.purpose),'every template declares its purpose');
  assert(templates.filter(t=>t.channel==='email').every(t=>t.subject),'email templates have a subject');
  const envio=templates.filter(t=>t.name.startsWith('Envío de la información · Alojamientos'));
  assert.equal(envio.length,3);
  for(const t of envio.filter(t=>t.channel!=='social')){
   const reference=`{{material:${alojamientos.id}${t.channel==='email'?':attach':''}}}`;
   assert.match(t.body,new RegExp(`<p>¡Buenísimo, gracias![^<]*</p><p>${reference.replace(/[{}]/g,'\\$&')}</p>`),`${t.name} carries the material right after the thank-you paragraph`);
   assert.equal(t.body.split('{{material:').length,2,`${t.name} carries the material once`);
  }
  // Instagram drafts do not resolve material references: the web presentation goes in its place.
  const instagram=envio.find(t=>t.channel==='social');
  assert(!instagram.body.includes('{{material:'),'Instagram never carries a raw material token');
  assert.match(instagram.body,/gracias![^<]*<\/p><p>{{link_presentacion}}<\/p>/,'Instagram links the web presentation instead');
  assert(templates.filter(t=>t.name.startsWith('Envío de la información · Otros rubros')).every(t=>!t.body.includes('{{material:')),'an archived material is left out');
  assert(templates.filter(t=>!t.name.startsWith('Envío de la información')).every(t=>!t.body.includes('{{material:')),'only «Envío de la información» carries material');
  const versions=await tx`SELECT version FROM crm_message_template_versions`;
  assert.equal(versions.length,42,'each new template starts at version 1');
  assert(versions.every(v=>v.version===1));
  const [message]=await tx`SELECT body,template_snapshot FROM crm_messages`;
  assert.equal(message.body,'Hola Ana','sent messages keep their text');
  assert.equal(message.template_snapshot.body,old.body,'sent messages keep their template snapshot');
  console.log('Message catalog v3 migration: 42 templates with versions, material resolved by title, archived material skipped, sent messages intact');
  throw rollback;
 });
}catch(error){if(error!==rollback)throw error;}finally{await database.end();}
