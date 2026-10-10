import postgres from 'postgres';
import {readFile,writeFile} from 'node:fs/promises';
import {planBusinessRecovery,recoveryDigest,validateRecoveryManifest} from './lib/recover-business-metadata.mjs';
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i++){const key=args[i];if(key==='--apply')options.apply=true;else if(['--manifest','--output','--expected-preview','--actor'].includes(key)&&args[i+1]&&!args[i+1].startsWith('--')){if(options[key])throw new Error('Opción repetida.');options[key]=args[++i];}else throw new Error('Uso: --manifest archivo.json --output informe-nuevo.json [--apply --expected-preview SHA256 --actor email-admin]');}
if(!options['--manifest']||!options['--output']||!process.env.DATABASE_URL)throw new Error('Falta manifiesto, destino o DATABASE_URL.');
if(options.apply&&(!/^[a-f0-9]{64}$/.test(options['--expected-preview']??'')||!options['--actor']))throw new Error('Aplicar requiere la huella del ensayo y un administrador identificado.');
if(!options.apply&&(options['--expected-preview']||options['--actor']))throw new Error('Opciones de aplicación sin --apply.');
const manifest=validateRecoveryManifest(JSON.parse(await readFile(options['--manifest'],'utf8')));
// Claim a new report before opening the transaction; never overwrite prior evidence.
await writeFile(options['--output'],'{"status":"pending","committed":false}\n',{flag:'wx',mode:0o600});
const database=postgres(process.env.DATABASE_URL,{max:1,prepare:false,connection:{application_name:'crm_business_metadata_recovery'}});
let committed=false;
try{
 const report=await database.begin(options.apply?'isolation level serializable':'isolation level repeatable read read only',async tx=>{
  await tx`SET LOCAL statement_timeout='60s'`;
  const ids=manifest.accounts.map(a=>a.accountId);
  const current=await tx.unsafe(`SELECT * FROM crm_accounts WHERE id=ANY($1::bigint[]) ORDER BY id ${options.apply?'FOR UPDATE':''}`,[ids]);
  const active=await tx`SELECT 'leads' AS entity,id::text,account_id::text FROM leads WHERE account_id=ANY(${ids}::bigint[]) AND deleted_at IS NULL
   UNION ALL SELECT 'contacts',id::text,account_id::text FROM crm_contacts WHERE account_id=ANY(${ids}::bigint[]) AND deleted_at IS NULL
   UNION ALL SELECT 'tasks',id::text,account_id::text FROM crm_tasks WHERE account_id=ANY(${ids}::bigint[]) AND deleted_at IS NULL
   UNION ALL SELECT 'activities',id::text,account_id::text FROM crm_activities WHERE account_id=ANY(${ids}::bigint[]) AND deleted_at IS NULL
   UNION ALL SELECT 'messages',id::text,account_id::text FROM crm_messages WHERE account_id=ANY(${ids}::bigint[]) AND status NOT IN ('cancelled','draft')
   UNION ALL SELECT 'documents',id::text,account_id::text FROM crm_documents WHERE account_id=ANY(${ids}::bigint[]) AND deleted_at IS NULL
   ORDER BY entity,id`;
  const activity={};for(const row of active)(activity[row.account_id]??=[]).push(row);
  const plan=planBusinessRecovery(manifest,current,activity);
  const previewSha256=recoveryDigest(plan);
  const evidence={...plan,previewSha256,readOnly:!options.apply,committed:false};
  if(!options.apply)return evidence;
  if(plan.conflicts.length)throw new Error('Hay conflictos; no se aplicó ninguna recuperación.');
  if(previewSha256!==options['--expected-preview'])throw new Error('Los datos o el manifiesto cambiaron desde el ensayo. Volvé a revisar la vista previa.');
  const [actor]=await tx`SELECT email,display_name FROM users WHERE email=${options['--actor']} AND role='admin'`;
  if(!actor)throw new Error('El actor debe ser un administrador del CRM.');
  await tx`SELECT set_config('crm.actor_email',${actor.email},true)`;
  for(const change of plan.changes){
   const [after]=await tx`UPDATE crm_accounts SET ${tx(change.fields,...Object.keys(change.fields))},updated_at=now() WHERE id=${change.accountId} RETURNING *`;
   await tx`INSERT INTO crm_commercial_journal(account_id,action,actor_email,actor_name,metadata) VALUES(${change.accountId},'business_metadata_recovered',${actor.email},${actor.display_name},${tx.json({before:change.before,after,backupSha256:manifest.backupSha256,manifestSha256:plan.manifestSha256,previewSha256,fields:Object.keys(change.fields)})})`;
  }
  // Prove that only the reviewed fields and updated_at changed in each account.
  const after=await tx`SELECT * FROM crm_accounts WHERE id=ANY(${ids}::bigint[]) ORDER BY id`;
  const byId=new Map(plan.changes.map(c=>[c.accountId,c]));
  for(let i=0;i<current.length;i++)for(const key of Object.keys(current[i])){
   if(key==='updated_at'||key in (byId.get(String(current[i].id))?.fields??{}))continue;
   if(JSON.stringify(current[i][key])!==JSON.stringify(after[i][key]))throw new Error('Cambió un campo protegido; operación revertida.');
  }
  return {...evidence,committed:true};
 });
 committed=report.committed;
 await writeFile(options['--output'],JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({readOnly:report.readOnly,committed:report.committed,counts:report.counts,conflicts:report.conflicts.length,previewSha256:report.previewSha256,reportFile:options['--output']}));
}catch(error){console.error(committed?'La recuperación se confirmó, pero no se pudo guardar el informe final. No asumir rollback.':error instanceof Error?error.message:'No se pudo completar la recuperación.');process.exitCode=1;}finally{await database.end();}
