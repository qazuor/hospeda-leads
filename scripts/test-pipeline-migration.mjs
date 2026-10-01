import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import postgres from 'postgres';
assert.equal(process.env.CRM_TEST_DATABASE,'1','Use disposable DB');
const sql=postgres(process.env.DATABASE_URL,{max:1,prepare:false});const rollback=new Error('rollback');
try{await sql.begin(async tx=>{try{
 const schema=`pipeline_${Date.now()}`;await tx.unsafe(`CREATE SCHEMA ${schema}; SET LOCAL search_path TO ${schema}`);
 for(const n of (await readdir('migrations')).filter(n=>n.endsWith('.sql')&&n<'007').sort())await tx.unsafe(await readFile('migrations/'+n,'utf8'));
 await tx`INSERT INTO leads(id,nombre,estado,prioridad,fecha_ultimo_contacto) VALUES(900,'Suscripción histórica','Suscripto','alta',NULL),(901,'Ambiguo','No interesado','baja',NULL),(902,'Desconocido','Pendiente externo',NULL,NULL),(903,'Sin etapa',NULL,NULL,NULL),(904,'Vacío','',NULL,NULL)`;
 const before=await tx`SELECT * FROM leads ORDER BY id`;
 await tx.unsafe(await readFile('migrations/007_pipeline_reactivation.sql','utf8'));
 const after=await tx`SELECT * FROM leads ORDER BY id`;
 for(let i=0;i<before.length;i++){
  for(const k of Object.keys(before[i]))assert.deepEqual(after[i][k],before[i][k],k);
  assert.equal(after[i].stage_since,null);assert.equal(after[i].pipeline_revision,0);
 }
 const stages=await tx`SELECT * FROM crm_stages WHERE historical`;assert(stages.every(s=>s.classification==='open'));
 assert.equal(Number((await tx`SELECT count(*) n FROM crm_pipeline_events`)[0].n),0);
 await tx`UPDATE leads SET estado='En tratativas' WHERE id=901`;
 assert((await tx`SELECT stage_since FROM leads WHERE id=901`)[0].stage_since);
 assert.equal(Number((await tx`SELECT count(*) n FROM crm_pipeline_events`)[0].n),1);
 await tx`UPDATE leads SET prioridad='alta' WHERE id=901`;
 assert.equal(Number((await tx`SELECT count(*) n FROM crm_pipeline_events`)[0].n),1);
 console.log('Pipeline migration: exact labels, null/empty states, manual priorities, unknown dates, no invented outcomes/events, audited transitions passed');throw rollback;
}catch(e){if(e!==rollback)console.error("Original migration error:",e);throw e;}
});}catch(e){if(e!==rollback)throw e}finally{await sql.end()}
