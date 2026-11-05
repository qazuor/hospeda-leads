import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import postgres from 'postgres';

assert.equal(process.env.CRM_TEST_DATABASE,'1','Use a disposable local database only');
const databaseUrl=new URL(process.env.DATABASE_URL??'');
assert(['localhost','127.0.0.1','::1'].includes(databaseUrl.hostname)||/^172\.17\.(?:\d{1,3})\.(?:\d{1,3})$/.test(databaseUrl.hostname),'DATABASE_URL must point to local PostgreSQL or its default Docker bridge');
const database=postgres(databaseUrl.toString(),{max:1,prepare:false,path:process.env.CRM_TEST_DATABASE_SOCKET});
const rollback=new Error('intentional test rollback');
// Migration 060 points «Envío de la información» at the new sales material (owner decision 05/11/2026). With no active
// materials (fresh databases) it skips the references; otherwise every referenced title must be active exactly once.
const materialByTemplate={'Envío de la información · Alojamientos':'Presentación corta · Alojamientos','Envío de la información · Comer y salir':'Presentación corta · Comer y salir','Envío de la información · Experiencias':'Presentación corta · Experiencias','Envío de la información · Otros rubros':'Cómo funciona Hospeda','Envío de la información · Aliados':'3 formas de estar en Hospeda'};
const titles=[...new Set(Object.values(materialByTemplate))];
try {
 await database.begin(async tx=>{
  const schema='crm_message_catalog_v4_'+Date.now();
  await tx.unsafe(`CREATE SCHEMA ${schema}; SET LOCAL search_path TO ${schema},public`);
  for(const name of (await readdir('migrations')).filter(n=>n.endsWith('.sql')&&n<'060').sort()) await tx.unsafe(await readFile('migrations/'+name,'utf8'));
  const migration=await readFile('migrations/060_message_catalog_v4.sql','utf8');
  // Each scenario runs in its own savepoint and is rolled back, so scenarios never see each other's rows.
  const undo=new Error('undo scenario');
  const scenario=async run=>{try{await tx.savepoint(async sp=>{await run(sp);throw undo;});}catch(error){if(error!==undo)throw error;}};
  // A failed statement aborts its savepoint: run the migration in a nested one and return the error.
  const failure=async sp=>{try{await sp.savepoint(async inner=>{await inner.unsafe(migration);});}catch(error){return error;}assert.fail('migration 060 should have failed');};
  await scenario(async sp=>{
   await sp.unsafe(migration);
   const [{count}]=await sp`SELECT count(*)::int AS count FROM message_templates`;
   assert.equal(count,48);
   const [{count:tokens}]=await sp`SELECT count(*)::int AS count FROM message_templates WHERE body LIKE '%{{material:%'`;
   assert.equal(tokens,0);
  });
  await scenario(async sp=>{
   const [user]=await sp`INSERT INTO users(email,display_name,role) VALUES('catalog-v4@example.test','Catalog fixture','admin') RETURNING email`;
   const [account]=await sp`INSERT INTO crm_accounts(nombre) VALUES('Catalog fixture') RETURNING id`;
   const [old]=await sp`SELECT * FROM message_templates WHERE name='Seguimiento · WhatsApp'`;
   assert(old);
   const snapshot={id:String(old.id),name:old.name,body:old.body};
   await sp`INSERT INTO crm_messages(id,account_id,original_account_id,channel,recipient,body,template_snapshot,owner_email,status) VALUES(gen_random_uuid(),${account.id},${account.id},'whatsapp','+5493442000000','Hola Ana',${sp.json(snapshot)},${user.email},'manual_sent')`;
   const ids=new Map();
   for(const title of titles){const [row]=await sp`INSERT INTO crm_sales_materials(id,title,kind,source,created_by_email) VALUES(gen_random_uuid(),${title},'deliverable','file',${user.email}) RETURNING id`;ids.set(title,String(row.id));}
   const [decoy]=await sp`INSERT INTO crm_sales_materials(id,title,kind,source,created_by_email) VALUES(gen_random_uuid(),'Presentacion Alojamientos','deliverable','file',${user.email}) RETURNING id`;
   await sp`INSERT INTO crm_sales_materials(id,title,kind,source,status,archived_at,created_by_email) VALUES(gen_random_uuid(),'Folleto','deliverable','file','archived',now(),${user.email})`;
   await sp.unsafe(migration);
   const templates=await sp`SELECT channel,name,body FROM message_templates WHERE name LIKE 'Envío de la información%' ORDER BY name`;
   assert.equal(templates.length,18);
   for(const template of templates){
    const title=Object.entries(materialByTemplate).find(([prefix])=>template.name.startsWith(prefix+' · '))?.[1];
    const expected=title&&template.channel!=='social'?ids.get(title):null;
    if(expected){const token=`{{material:${expected}${template.channel==='email'?':attach':''}}}`;assert.match(template.body,new RegExp(`<p>¡Buenísimo, gracias![^<]*</p><p>${token.replace(/[{}]/g,'\\$&')}</p>`),template.name);}
    else assert(!template.body.includes('{{material:'),template.name);
    assert(!template.body.includes(String(decoy.id)));
   }
   const [{template_snapshot}]=await sp`SELECT template_snapshot FROM crm_messages`;
   assert.equal(template_snapshot.body,old.body);
  });
  await scenario(async sp=>{
   const [user]=await sp`INSERT INTO users(email,display_name,role) VALUES('catalog-v4-missing@example.test','Catalog fixture','admin') RETURNING email`;
   for(const title of titles.slice(1)) await sp`INSERT INTO crm_sales_materials(id,title,kind,source,created_by_email) VALUES(gen_random_uuid(),${title},'deliverable','file',${user.email})`;
   assert.match((await failure(sp)).message,/Falta el material activo «Presentación corta · Alojamientos»/);
  });
  await scenario(async sp=>{
   const [user]=await sp`INSERT INTO users(email,display_name,role) VALUES('catalog-v4-duplicate@example.test','Catalog fixture','admin') RETURNING email`;
   for(const title of titles) await sp`INSERT INTO crm_sales_materials(id,title,kind,source,created_by_email) VALUES(gen_random_uuid(),${title},'deliverable','file',${user.email})`;
   await sp`INSERT INTO crm_sales_materials(id,title,kind,source,created_by_email) VALUES(gen_random_uuid(),${titles[0]},'deliverable','file',${user.email})`;
   assert.match((await failure(sp)).message,/Hay 2 materiales activos con el título «Presentación corta · Alojamientos»/);
  });
  console.log('Message catalog v4 migration scenarios passed');
  throw rollback;
 });
} catch(error){if(error!==rollback)throw error;} finally {await database.end();}
