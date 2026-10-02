import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import postgres from 'postgres';
assert.equal(process.env.CRM_TEST_DATABASE,'1','Use disposable DB');
const sql=postgres(process.env.DATABASE_URL,{max:1,prepare:false}),rollback=new Error('rollback');
try{await sql.begin(async tx=>{
 const schema='quality_'+Date.now();await tx.unsafe(`CREATE SCHEMA ${schema}; SET LOCAL search_path TO ${schema}`);
 for(const file of (await readdir('migrations')).filter(n=>n.endsWith('.sql')&&n<'009').sort())await tx.unsafe(await readFile('migrations/'+file,'utf8'));
 await tx`INSERT INTO leads(nombre,estado,email,telefono,origen,archivo_adjunto,notas,deleted_at) VALUES(' Histórico ','Cargado','INVALIDO','3442 15 000000','Otro origen','https://example.com/document','Nota original',now())`;
 const before=await tx`SELECT * FROM leads`,accounts=await tx`SELECT * FROM crm_accounts`;
 await tx.unsafe(await readFile('migrations/009_data_quality.sql','utf8'));
 assert.deepEqual(await tx`SELECT * FROM leads`,before);
 const after=await tx`SELECT * FROM crm_accounts`;for(const field of Object.keys(accounts[0]))assert.deepEqual(after[0][field],accounts[0][field]);
 assert.equal(after[0].merged_into_id,null);assert.equal(Number((await tx`SELECT count(*) n FROM crm_data_evidence`)[0].n),0);
 console.log('Quality migration: representative historical/invalid/deleted data and relationships preserved');throw rollback;
 });}catch(e){if(e!==rollback)throw e;}finally{await sql.end();}
