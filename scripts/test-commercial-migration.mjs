import postgres from 'postgres';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
assert.equal(process.env.CRM_TEST_DATABASE,'1','Run only against a test database with CRM_TEST_DATABASE=1');
const sql=postgres(process.env.DATABASE_URL,{max:1,prepare:false});
const rollback=new Error('intentional rollback');
try{
  await sql.begin(async tx=>{
    try {
    const schema='crm_migration_test_'+Date.now();
    await tx.unsafe(`CREATE SCHEMA ${schema}; SET LOCAL search_path TO ${schema}`);
    for(const f of ['001_initial.sql','002_user_profile_fields.sql','003_unify_lead_responsible.sql'])await tx.unsafe(await readFile('migrations/'+f,'utf8'));
    await tx.unsafe(`INSERT INTO leads(id,nombre,contact_name,telefono,email,estado,asignado_a,notas) VALUES (500,'Negocio histórico','Ana','123','info@example.com','Suscripto','Ambiguo','Texto histórico'),(501,'Otro negocio',NULL,'123','info@example.com','Cargado',NULL,NULL),(502,'Borrado','Juan',NULL,NULL,NULL,NULL,NULL); UPDATE leads SET deleted_at=now() WHERE id=502; INSERT INTO lead_notes(id,lead_id,note) VALUES(700,500,'Nota previa'); INSERT INTO lead_journal(id,lead_id,lead_name,actor_name,action) VALUES(800,500,'Negocio histórico','Admin','created');`);
    const original=await tx`SELECT * FROM leads ORDER BY id`;
    await tx.unsafe(await readFile('migrations/004_commercial_foundation.sql','utf8'));
    const migrated=await tx`SELECT * FROM leads ORDER BY id`;
    for(let i=0;i<original.length;i++)for(const key of Object.keys(original[i]))assert.deepEqual(migrated[i][key],original[i][key],`Historical ${key} changed`);
    assert.equal(Number((await tx`SELECT count(*) AS n FROM crm_accounts`)[0].n),3);
    assert.equal(Number((await tx`SELECT count(*) AS n FROM crm_contacts`)[0].n),2);
    assert.equal(Number((await tx`SELECT count(*) AS n FROM crm_accounts WHERE commercial_status='client'`)[0].n),0);
    assert.equal((await tx`SELECT note FROM lead_notes WHERE id=700`)[0].note,'Nota previa');
    const accountId=migrated[0].account_id;
    assert.equal((await tx`SELECT account_id FROM lead_journal WHERE id=800`)[0].account_id,accountId);
    assert((await tx`SELECT deleted_at FROM crm_contacts WHERE source_lead_id=502`)[0].deleted_at);
    await tx`INSERT INTO leads(nombre,account_id,opportunity_name,estado) VALUES('ignored',${accountId},'Segunda venta','Cargado')`;
    await tx`UPDATE leads SET nombre='Nuevo nombre',ciudad='Colón' WHERE id=500`;
    const siblings=await tx`SELECT * FROM leads WHERE account_id=${accountId}`;
    assert.equal(siblings.length,2);assert(siblings.every(l=>l.nombre==='Nuevo nombre'&&l.ciudad==='Colón'));
    assert.equal(siblings.find(l=>String(l.id)!=='500').opportunity_name,'Segunda venta');
    await tx`UPDATE crm_accounts SET telefono='456' WHERE id=${accountId}`;
    assert((await tx`SELECT * FROM leads WHERE account_id=${accountId}`).every(l=>l.telefono==='456'));
    await tx`INSERT INTO leads(id,nombre) VALUES(500,'Reimportado') ON CONFLICT DO NOTHING`;
    assert.equal(Number((await tx`SELECT count(*) AS n FROM crm_accounts`)[0].n),3);
    console.log('Historical migration: values, IDs, notes, journal, generic contacts, deleted leads, projections and reimport passed');
    throw rollback;
    }catch(error){if(error!==rollback)console.error("Migration test failure:",error);throw error;}
  });
}catch(e){if(e!==rollback)throw e}finally{await sql.end()}
