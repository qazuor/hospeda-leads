import assert from 'node:assert/strict';
import postgres from 'postgres';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
assert.equal(process.env.CRM_TEST_DATABASE,'1','Use a disposable database');
const db=postgres(process.env.DATABASE_URL,{max:1,prepare:false}),folder=await mkdtemp(join(tmpdir(),'crm-recovery-test-')),marker=randomUUID();
const exec=args=>{const p=spawnSync(process.execPath,['scripts/recover-business-metadata.mjs',...args],{env:process.env,encoding:'utf8'});assert.equal(p.status,0,p.stderr);return JSON.parse(p.stdout);};
try{
 const email=marker+'@example.com';await db`INSERT INTO users(email,display_name,role) VALUES(${email},'Recovery admin','admin')`;
 const source=String(Date.now());const [account]=await db`INSERT INTO crm_accounts(source_lead_id,nombre,assigned_user_email,discovery_source,verification_urls,archived_at) VALUES(${source},${marker},${email},'Investigación actual','https://current.example.com',now()) RETURNING *`;
 const manifest={formatVersion:1,backupSha256:'a'.repeat(64),accounts:[{accountId:String(account.id),sourceLeadId:source,values:{origin:'Turismo Colón',source_reference:'https://historical.example.com',review_status:'filtered',subscription_label:'Comp',deleted_at:'2026-10-03T12:00:00.000Z',deleted_by_email:'historical@example.com',deletion_reason:'Eliminación histórica recuperada'}}]};
 const path=join(folder,'manifest.json');await writeFile(path,JSON.stringify(manifest));
 const preview=exec(['--manifest',path,'--output',join(folder,'preview.json')]);assert.equal(preview.readOnly,true);assert.equal(preview.committed,false);assert.equal(preview.counts.deleted_at,1);
 assert.equal((await db`SELECT deleted_at FROM crm_accounts WHERE id=${account.id}`)[0].deleted_at,null);
 const changed=spawnSync(process.execPath,['scripts/recover-business-metadata.mjs','--manifest',path,'--output',join(folder,'bad.json'),'--apply','--expected-preview','b'.repeat(64),'--actor',email],{env:process.env,encoding:'utf8'});assert.notEqual(changed.status,0);assert.equal((await db`SELECT deleted_at FROM crm_accounts WHERE id=${account.id}`)[0].deleted_at,null,'Mismatch rolls back');
 const applied=exec(['--manifest',path,'--output',join(folder,'applied.json'),'--apply','--expected-preview',preview.previewSha256,'--actor',email]);assert.equal(applied.committed,true);
 const [after]=await db`SELECT * FROM crm_accounts WHERE id=${account.id}`;
 for(const k of ['nombre','assigned_user_email','archived_at','discovery_source','verification_urls','commercial_status','client_since'])assert.deepEqual(after[k],account[k],k+' preserved');
 assert.equal(after.origin,'Turismo Colón');assert.equal(after.review_status,'filtered');assert.equal(after.subscription_label,'Comp');assert.equal(after.deleted_by_email,'historical@example.com');assert.equal(new Date(after.deleted_at).toISOString(),manifest.accounts[0].values.deleted_at);
 assert.equal((await db`SELECT count(*)::int AS n FROM leads WHERE account_id=${account.id}`)[0].n,0,'No artificial management recreated');
 assert.equal((await db`SELECT count(*)::int AS n FROM crm_commercial_journal WHERE account_id=${account.id} AND action='business_metadata_recovered'`)[0].n,1);
 const repeat=exec(['--manifest',path,'--output',join(folder,'repeat.json')]);assert.equal(repeat.counts.origin,0);assert.equal(repeat.conflicts,0);
 const report=JSON.parse(await readFile(join(folder,'applied.json'),'utf8'));assert.equal(report.changes[0].fields.subscription_label,'Comp');
 console.log('Recovery PostgreSQL: read-only preview, hash mismatch rollback, original deletion dates/actor, all five data groups, protected research/ownership/archive/payment, audited commit and idempotency passed');
}finally{await db.end();await rm(folder,{recursive:true,force:true});}
