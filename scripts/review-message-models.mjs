import postgres from 'postgres';
import {mkdirSync,writeFileSync,chmodSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {readReview,applyReview} from './message-models/review.mjs';
const args=process.argv.slice(2),apply=args.includes('--apply');
if(args.some(a=>a!=='--apply'&&!a.startsWith('--output=')))throw new Error('Uso: node scripts/review-message-models.mjs [--apply] [--output=/ruta]');
if(!process.env.DATABASE_URL)throw new Error('Falta DATABASE_URL.');
const directory=resolve(args.find(a=>a.startsWith('--output='))?.slice(9)??'/tmp/crm-message-models-'+Date.now());
mkdirSync(directory,{recursive:true,mode:0o700});
const sql=postgres(process.env.DATABASE_URL,{max:1,prepare:false});
let committed=false,stage='validación';
function save(name,data){
 const value=JSON.stringify(data,null,2)+'\n';
 writeFileSync(directory+'/'+name,value,{mode:0o600,flag:'wx'});
 chmodSync(directory+'/'+name,0o600);
 return createHash('sha256').update(value).digest('hex');
}
try{
 const report=await sql.begin(apply?'read write':'read only',async tx=>{
  await tx.unsafe('SET LOCAL search_path TO public');
  await tx.unsafe("SET LOCAL lock_timeout TO '5s'; SET LOCAL statement_timeout TO '30s'");
  if(apply)await tx.unsafe('LOCK TABLE crm_verticals IN SHARE MODE; LOCK TABLE message_templates IN SHARE ROW EXCLUSIVE MODE');
  const before=await readReview(tx);
  const backupSha256=save('before.json',{models:before.rows,activeVerticals:before.active});
  save('plan.json',{apply,...before.plan});
  stage='aplicación';
  const after=apply?await applyReview(tx,before.plan):before.rows;
  // Persist the complete expected after-state before COMMIT, even if the receipt cannot be written later.
  save('after.json',{models:after,applied:apply});
  return {updates:before.plan.changes.filter(c=>c.kind==='update').length,inserts:before.plan.changes.filter(c=>c.kind==='insert').length,deactivations:before.plan.changes.filter(c=>c.kind==='deactivate').length,verticals:before.plan.verticals,backupSha256};
 });
 committed=apply;
 const result={...report,readOnly:!apply,committed,reportDirectory:directory};
 save('receipt.json',result);console.log(JSON.stringify(result,null,2));
}catch(error){
 // A dropped connection around COMMIT cannot be reported as a verified rollback.
 console.error(JSON.stringify({committed:committed?true:apply&&stage==='aplicación'?null:false,stage,error:error.code??error.message,reportDirectory:directory}));
 process.exitCode=1;
}finally{await sql.end();}
