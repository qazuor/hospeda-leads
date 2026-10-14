import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import postgres from 'postgres';

assert.equal(process.env.CRM_TEST_DATABASE,'1','Use a disposable DB');
const database=postgres(process.env.DATABASE_URL,{max:1,prepare:false,path:process.env.CRM_TEST_DATABASE_SOCKET});
console.log('Connecting to disposable PostgreSQL migration test database');
const rollback=new Error('intentional test rollback');
try{
 await database.begin(async tx=>{
  const schema='crm_business_state_migration_'+Date.now();
  await tx.unsafe(`CREATE SCHEMA ${schema}; SET LOCAL search_path TO ${schema}`);
  console.log('Applying historical migrations to isolated schema');
  for(const name of (await readdir('migrations')).filter(n=>n.endsWith('.sql')&&n<'018').sort())await tx.unsafe(await readFile('migrations/'+name,'utf8'));
  const [account]=await tx`INSERT INTO crm_accounts(nombre,commercial_status,client_since,do_not_contact,archived_at,deleted_at,review_status,origin,source_reference,subscription_label)
   VALUES('Negocio histórico','client','2026-01-02T00:00:00Z',true,'2026-02-03T00:00:00Z','2026-04-05T00:00:00Z','filtered','import','fuente original','Plan anterior') RETURNING id`;
  await tx`INSERT INTO crm_stages(name,sort_order,active,classification,historical) VALUES('migration-fixture-open',9999,true,'open',false) ON CONFLICT(name) DO NOTHING`;
  const [lead]=await tx`INSERT INTO leads(nombre,account_id,opportunity_name,estado) VALUES('Gestión histórica',${account.id},'Plan anterior','migration-fixture-open') RETURNING id`;
  await tx`INSERT INTO lead_journal(account_id,lead_name,actor_name,action) VALUES(${account.id},'Gestión histórica','Fixture','legacy_event')`;
  await tx`INSERT INTO crm_commercial_journal(account_id,action,actor_name) VALUES(${account.id},'legacy_business_event','Fixture')`;
  await tx`INSERT INTO crm_pipeline_events(account_id,lead_id,action,classification,recontact_date) VALUES(${account.id},${lead.id},'stage','lost','2026-11-01')`;
  const beforeAccount=(await tx`SELECT * FROM crm_accounts WHERE id=${account.id}`)[0];
  const beforeLead=(await tx`SELECT * FROM leads WHERE id=${lead.id}`)[0];
  const journals={
   lead:await tx`SELECT * FROM lead_journal WHERE account_id=${account.id} ORDER BY id`,
   commercial:await tx`SELECT * FROM crm_commercial_journal WHERE account_id=${account.id} ORDER BY id`,
   pipeline:await tx`SELECT * FROM crm_pipeline_events WHERE account_id=${account.id} ORDER BY id`,
  };
  console.log('Applying business state migrations 018–020');
  await tx.unsafe(await readFile('migrations/018_business_management_state_model.sql','utf8'));
  await tx.unsafe(await readFile('migrations/019_business_management_workflows.sql','utf8'));
  await tx.unsafe(await readFile('migrations/020_backfill_business_state.sql','utf8'));
  await tx.unsafe(await readFile('migrations/021_business_state_journal.sql','utf8'));
  const afterAccount=(await tx`SELECT * FROM crm_accounts WHERE id=${account.id}`)[0];
  const afterLead=(await tx`SELECT * FROM leads WHERE id=${lead.id}`)[0];
  for(const [key,value] of Object.entries(beforeAccount))if(key!=='updated_at')assert.deepEqual(afterAccount[key],value,`crm_accounts.${key} preserved`);
  assert.equal(afterAccount.status,'archived','archival restriction preserved by the backfill');
  assert.equal(afterAccount.is_client,true,'legacy client marker preserved as an independent boolean');
  assert.equal(afterAccount.recontact_at,null);
  assert.equal(afterAccount.referred_to_leandro,false);
  await tx`SELECT set_config('crm.actor_email','fixture@example.com',true)`;
  await tx`UPDATE crm_accounts SET status='reviewed',is_client=true,do_not_contact=true,referred_to_leandro=true,recontact_at='2026-12-15' WHERE id=${account.id}`;
  const stateEvent=(await tx`SELECT action,actor_email,metadata FROM crm_commercial_journal WHERE account_id=${account.id} ORDER BY id DESC LIMIT 1`)[0];
  assert.equal(stateEvent.action,'leandro_referral_changed');
  assert.equal(stateEvent.actor_email,'fixture@example.com');
  assert.equal(stateEvent.metadata.before.status,'archived');
  assert.equal(stateEvent.metadata.before.is_client,true);
  assert.equal(stateEvent.metadata.before.referred_to_leandro,false);
  assert.equal(stateEvent.metadata.after.status,'reviewed');
  assert.equal(stateEvent.metadata.after.is_client,true);
  assert.equal(stateEvent.metadata.after.do_not_contact,true);
  assert.equal(stateEvent.metadata.after.referred_to_leandro,true);
  assert.equal(stateEvent.metadata.after.recontact_at.slice(0,10),'2026-12-15');
  await tx`SELECT set_config('crm.state_change_origin','automatic',true),set_config('crm.state_change_cause','management_change',true)`;
  await tx`UPDATE crm_accounts SET status='in_management' WHERE id=${account.id}`;
  const derivedEvent=(await tx`SELECT metadata FROM crm_commercial_journal WHERE account_id=${account.id} ORDER BY id DESC LIMIT 1`)[0];
  assert.equal(derivedEvent.metadata.origin,'automatic');
  assert.equal(derivedEvent.metadata.cause,'management_change');
  for(const [key,value] of Object.entries(beforeLead))assert.deepEqual(afterLead[key],value,`leads.${key} preserved`);
  assert.deepEqual(await tx`SELECT * FROM lead_journal WHERE account_id=${account.id} ORDER BY id`,journals.lead,'legacy journal preserved');
  const commercialAfter=await tx`SELECT * FROM crm_commercial_journal WHERE account_id=${account.id} ORDER BY id`;
  assert.deepEqual(commercialAfter.slice(0,journals.commercial.length),journals.commercial,'commercial journal preserved');
  const pipelineAfter=await tx`SELECT * FROM crm_pipeline_events WHERE account_id=${account.id} ORDER BY id`;
  for(let i=0;i<journals.pipeline.length;i++)for(const [key,value] of Object.entries(journals.pipeline[i]))assert.deepEqual(pipelineAfter[i][key],value,`crm_pipeline_events.${key} preserved`);
  await tx`SAVEPOINT invalid_status`;
  try{await tx`UPDATE crm_accounts SET status='closed_won' WHERE id=${account.id}`;assert.fail('Unknown business status must fail');}
  catch(error){assert.match(error.message,/crm_accounts_status_check/);await tx`ROLLBACK TO SAVEPOINT invalid_status`;}
  assert.equal(Number((await tx`SELECT count(*) AS n FROM crm_accounts`)[0].n),1);
  assert.equal(Number((await tx`SELECT count(*) AS n FROM leads`)[0].n),1);
  console.log('Business state migrations: legacy data and journals preserved; business status, flags and recontact date audited; invalid status rejected');
  throw rollback;
 });
}catch(error){if(error!==rollback)throw error;}finally{await database.end();}
