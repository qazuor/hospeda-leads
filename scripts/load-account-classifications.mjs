import {z} from 'zod';
import {sql} from 'kysely';
import {db} from '../src/helpers/db.tsx';
import {parseClassificationImport} from '../src/helpers/classificationImport.ts';
import {displayClassification,setAccountClassifications,normalizeClassifications} from '../src/helpers/accountClassification.ts';

const inputSchema=z.record(z.string().regex(/^\d+$/),z.array(z.string()));
const args=process.argv.slice(2),fileIndex=args.indexOf('--file'),apply=args.includes('--apply'),actorIndex=args.indexOf('--actor');
const fail=message=>{throw new Error(message);};
const labelOf=pair=>pair.tipo+(pair.subtipo?`/${pair.subtipo}`:'');
const keyOf=pair=>JSON.stringify([pair.tipo,pair.subtipo]);
const issue=(id,reason)=>`requiere revisión manual: ${reason}`;
const rawIssue=rows=>{
 const clean=normalizeClassifications({pairs:rows.map(({tipo,subtipo})=>({tipo,subtipo}))});
 if(clean.length!==rows.length)return 'las clasificaciones actuales tienen duplicados o pares incompatibles';
 if(rows.some(row=>row.tipo!==row.tipo.trim()||row.subtipo!==null&&row.subtipo!==row.subtipo.trim()))return 'hay texto sin recortar en las clasificaciones actuales';
 return null;
};
const main=async()=>{
 if(fileIndex<0||!args[fileIndex+1])fail('Usage: node --import tsx scripts/load-account-classifications.mjs --file <json> [--apply --actor <email>]');
 if(apply&&(actorIndex<0||!args[actorIndex+1]))fail('--apply requires --actor <email>.');
 const actorEmail=actorIndex>=0?args[actorIndex+1]:null;
 const {readFile}=await import('node:fs/promises');
 const parsed=inputSchema.safeParse(JSON.parse(await readFile(args[fileIndex+1],'utf8')));
 if(!parsed.success)fail('Input must be an object mapping numeric account IDs to arrays of classification strings.');
 let actor=null;
 if(apply){actor=await db.selectFrom('users').select(['email','displayName']).where('email','=',actorEmail).where('deactivatedAt','is',null).executeTakeFirst();if(!actor)fail('Actor must be an existing active user.');}
 let added=0,unchanged=0,rejected=0,failed=0;
 const outcome=(kind,id,label,reason='')=>{if(kind==='added')added++;else if(kind==='unchanged')unchanged++;else if(kind==='rejected')rejected++;else failed++;console.log(`  ${kind} ${label}${reason?`: ${reason}`:''}`);};
 const ids=Object.keys(parsed.data);
 for(const accountId of ids){
  try{
   const account=await db.selectFrom('crmAccounts').selectAll().where('id','=',accountId).executeTakeFirst();
   const currentRows=account?await db.selectFrom('crmAccountClassifications').selectAll().where('accountId','=',accountId).orderBy('id').execute():[];
   const rawPairs=currentRows.map(({tipo,subtipo})=>({tipo,subtipo})),current=normalizeClassifications({pairs:rawPairs}),currentKeys=new Set(current.map(keyOf));
   console.log(`H${accountId} ${account?`${account.nombre} [${account.mergedIntoId?'merged':account.deletedAt?'trash':'active'}]`:'[missing]'}; current=${current.map(labelOf).join('; ')||'(none)'}`);
   let blocked=!account?'business does not exist':account.mergedIntoId?'business is merged':account.deletedAt?'business is in trash':rawIssue(currentRows);
   const labels=[...new Set(parsed.data[accountId])],requested=[];
   for(const label of labels){const pairs=parseClassificationImport(label);if(label.includes(';')||pairs.length!==1){outcome('rejected',accountId,label,'label must contain exactly one classification pair; semicolons are not allowed');continue;}const pair=pairs[0];if(!pair||!pair.tipo){outcome('rejected',accountId,label,'empty vertical');continue;}requested.push({label,pair});}
   if(blocked){for(const {label} of requested)outcome('rejected',accountId,label,issue(accountId,blocked));continue;}
   const candidates=[];
   for(const {label,pair} of requested){
    const k=keyOf(pair);
    if(currentKeys.has(k)){outcome('unchanged',accountId,label,`sin cambios (ya tiene ${labelOf(pair)})`);continue;}
    if(pair.subtipo===null&&current.some(old=>old.tipo===pair.tipo&&old.subtipo)){outcome('unchanged',accountId,label,`sin cambios (ya tiene ${pair.tipo})`);continue;}
    if(pair.subtipo!==null&&current.some(old=>old.tipo===pair.tipo&&old.subtipo===null)){outcome('rejected',accountId,label,`reemplazaría "${pair.tipo}" sin subtipo: hacelo desde la ficha`);continue;}
    const vertical=await db.selectFrom('crmVerticals').select(['name','active']).where('name','=',pair.tipo).executeTakeFirst();
    let reason=vertical?.active?null:vertical?'vertical is inactive':'vertical does not exist';
    if(!reason&&pair.subtipo){const subtype=await db.selectFrom('crmSubtypes').select(['typeName','active']).where('name','=',pair.subtipo).where('typeName','=',pair.tipo).executeTakeFirst();reason=!subtype?'subtype does not exist for this vertical':!subtype.active?'subtype is inactive':null;}
    if(reason){outcome('rejected',accountId,label,reason);continue;}candidates.push({label,pair});
   }
   const merged=normalizeClassifications({pairs:[...current,...candidates.map(c=>c.pair)]}),additions=merged.filter(pair=>!currentKeys.has(keyOf(pair)));
   if(merged.length>8){for(const item of candidates)outcome('rejected',accountId,item.label,'maximum of 8 classifications after merging');continue;}
   if(!apply){for(const item of candidates)outcome('added',accountId,item.label,'would add');continue;}
   if(process.env.CRM_TEST_DATABASE==='1'&&process.env.CRM_TEST_LOADER_AFTER_PLAN){const hook=JSON.parse(process.env.CRM_TEST_LOADER_AFTER_PLAN);if(String(hook.accountId)===accountId){await db.insertInto('crmAccountClassifications').values({accountId,tipo:hook.tipo,subtipo:hook.subtipo??null,createdBy:actor.email}).execute();delete process.env.CRM_TEST_LOADER_AFTER_PLAN;}}
   try{
    const results=new Map(),willAdd=[];
    await db.transaction().execute(async trx=>{
     await trx.selectFrom('crmAccounts').select('id').where('id','=',accountId).forUpdate().executeTakeFirstOrThrow();
     const lockedAccount=await trx.selectFrom('crmAccounts').select(['mergedIntoId','deletedAt']).where('id','=',accountId).executeTakeFirstOrThrow();
     if(lockedAccount.mergedIntoId||lockedAccount.deletedAt)throw new Error(issue(accountId,lockedAccount.mergedIntoId?'business is merged':'business is in trash'));
     const lockedRows=await trx.selectFrom('crmAccountClassifications').selectAll().where('accountId','=',accountId).orderBy('id').execute(),lockedReason=rawIssue(lockedRows);
     if(lockedReason)throw new Error(issue(accountId,lockedReason));
     const locked=normalizeClassifications({pairs:lockedRows.map(({tipo,subtipo})=>({tipo,subtipo}))}),next=[...locked];
     for(const item of candidates){
      if(next.some(p=>keyOf(p)===keyOf(item.pair))||item.pair.subtipo===null&&next.some(p=>p.tipo===item.pair.tipo&&p.subtipo)){results.set(item,'unchanged');continue;}
      if(item.pair.subtipo!==null&&next.some(p=>p.tipo===item.pair.tipo&&p.subtipo===null)){results.set(item,'rejected');continue;}
      next.push(item.pair);willAdd.push(item);
     }
     const normalized=normalizeClassifications({pairs:next});if(normalized.length>8)throw new Error('maximum of 8 classifications after merging');
     if(willAdd.length){
      const beforeIds=new Set(lockedRows.map(row=>String(row.id)));
      await setAccountClassifications({trx,accountId,pairs:normalized,actor:{email:actor.email,displayName:actor.displayName},reason:'dedup2_secondary_verticals'});
      const afterRows=await trx.selectFrom('crmAccountClassifications').select('id').where('accountId','=',accountId).execute();
      if([...beforeIds].some(id=>!afterRows.some(row=>String(row.id)===id)))throw new Error('write removed an existing classification row');
     }
    });
    for(const item of candidates){const status=results.get(item);outcome(status==='unchanged'?'unchanged':status==='rejected'?'rejected':'added',accountId,item.label,status==='unchanged'?`sin cambios (ya tiene ${labelOf(item.pair)})`:status==='rejected'?`reemplazaría "${item.pair.tipo}" sin subtipo: hacelo desde la ficha`:'' );}
   }catch(error){for(const item of candidates)outcome('failed',accountId,item.label,error instanceof Error?error.message:'unknown error');}
  }catch(error){const message=error instanceof Error?error.message:'unknown error';for(const label of [...new Set(parsed.data[accountId])])outcome('failed',accountId,label,message);}
 }
 try{
  console.log('Final read-only verification:');
  const catalogOrder=(await db.selectFrom('crmVerticals').select('name').orderBy('sortOrder').orderBy('name').execute()).map(row=>row.name);
  console.log('Input businesses result:');
  for(const accountId of ids){const account=await db.selectFrom('crmAccounts').select(['mergedIntoId','deletedAt']).where('id','=',accountId).executeTakeFirst();if(!account||account.mergedIntoId||account.deletedAt)continue;const rows=await db.selectFrom('crmAccountClassifications').select(['tipo','subtipo']).where('accountId','=',accountId).execute(),display=displayClassification({pairs:rows,verticalOrder:catalogOrder});console.log(`H${accountId}: ${rows.map(labelOf).join('; ')||'(none)'}`);if(display){const mismatch=await db.selectFrom('crmAccounts').select(['tipo','subtipo']).where('id','=',accountId).executeTakeFirst();if(mismatch?.tipo!==display.tipo||mismatch?.subtipo!==display.subtipo)console.log(`  display mismatch: ${display.tipo}${display.subtipo?`/${display.subtipo}`:''}`);}}
  const offenders=await sql`SELECT a.id FROM crm_accounts a LEFT JOIN LATERAL (SELECT c.tipo,c.subtipo FROM crm_account_classifications c LEFT JOIN crm_verticals v ON v.name=c.tipo WHERE c.account_id=a.id ORDER BY v.sort_order NULLS LAST,c.tipo,(c.subtipo IS NOT NULL),c.subtipo LIMIT 1) d ON true WHERE a.merged_into_id IS NULL AND a.deleted_at IS NULL AND (a.tipo IS DISTINCT FROM d.tipo OR a.subtipo IS DISTINCT FROM d.subtipo) ORDER BY a.id LIMIT 20`.execute(db);
  const mismatch=await sql`SELECT count(*)::text AS count FROM crm_accounts a LEFT JOIN LATERAL (SELECT c.tipo,c.subtipo FROM crm_account_classifications c LEFT JOIN crm_verticals v ON v.name=c.tipo WHERE c.account_id=a.id ORDER BY v.sort_order NULLS LAST,c.tipo,(c.subtipo IS NOT NULL),c.subtipo LIMIT 1) d ON true WHERE a.merged_into_id IS NULL AND a.deleted_at IS NULL AND (a.tipo IS DISTINCT FROM d.tipo OR a.subtipo IS DISTINCT FROM d.subtipo)`.execute(db);
  console.log(`Display-copy offending ids (up to 20): ${offenders.rows.map(row=>row.id).join(', ')||'(none)'}`);
  console.log(`Display-copy mismatches: ${Number(mismatch.rows[0]?.count??0)}`);
 }catch(error){failed++;console.log(`Final verification failed: ${error instanceof Error?error.message:'unknown error'}`);}
 const candidateCount=ids.reduce((sum,id)=>sum+new Set(parsed.data[id]).size,0);
 console.log(`Summary: added=${added}, unchanged=${unchanged}, rejected=${rejected}, failed=${failed}; candidates=${candidateCount}.`);
 if(added+unchanged+rejected+failed!==candidateCount){console.log('Summary error: outcome totals do not match the number of candidates.');process.exitCode=1;}
 if(failed)process.exitCode=1;
};
main().catch(error=>{console.error(error instanceof Error?error.message:'Load failed.');process.exitCode=1;}).finally(()=>db.destroy());
