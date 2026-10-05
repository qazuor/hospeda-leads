import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import postgres from 'postgres';
assert.equal(process.env.CRM_TEST_DATABASE,'1','Use disposable DB');
const sql=postgres(process.env.DATABASE_URL,{max:1,prepare:false}),rollback=new Error('rollback');
try{await sql.begin(async tx=>{
 const schema='business_import_'+Date.now();await tx.unsafe(`CREATE SCHEMA ${schema}; SET LOCAL search_path TO ${schema}`);
 for(const file of (await readdir('migrations')).filter(n=>n.endsWith('.sql')&&n<'013').sort())await tx.unsafe(await readFile('migrations/'+file,'utf8'));
 const [a]=await tx`INSERT INTO leads(nombre,tipo,subtipo,estado,notas) VALUES('Histórico','Gastronomía','Restaurante','Cargado','Nota original') RETURNING account_id`;
 const [b]=await tx`INSERT INTO crm_accounts(nombre) VALUES('Clasificación ambigua') RETURNING id`;
 await tx`INSERT INTO leads(nombre,account_id,tipo,subtipo) VALUES('Clasificación ambigua',${b.id},'Gastronomía','Restaurante'),('Clasificación ambigua',${b.id},'Alojamientos','Hotel')`;
 const before=await tx`SELECT * FROM leads ORDER BY id`;
 await tx.unsafe(await readFile('migrations/013_business_import.sql','utf8'));
 assert.deepEqual(await tx`SELECT * FROM leads ORDER BY id`,before);
 const [classified]=await tx`SELECT tipo,subtipo FROM crm_accounts WHERE id=${a.account_id}`;
 assert.deepEqual(classified,{tipo:'Gastronomía',subtipo:'Restaurante'});
 const [ambiguous]=await tx`SELECT tipo,subtipo FROM crm_accounts WHERE id=${b.id}`;
 assert.deepEqual(ambiguous,{tipo:null,subtipo:null});
 console.log('Business migration: historical sales/notes unchanged, unambiguous classification copied, conflicts left empty');throw rollback;
 });}catch(e){if(e!==rollback)throw e;}finally{await sql.end();}
