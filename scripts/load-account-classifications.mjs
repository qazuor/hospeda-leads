import {z} from 'zod';
import {sql} from 'kysely';
import {db} from '../src/helpers/db.tsx';
import {parseClassificationImport} from '../src/helpers/classificationImport.ts';
import {setAccountClassifications,normalizeClassifications} from '../src/helpers/accountClassification.ts';

const inputSchema=z.record(z.string().regex(/^\d+$/),z.array(z.string()));
const args=process.argv.slice(2),fileIndex=args.indexOf('--file'),apply=args.includes('--apply'),actorIndex=args.indexOf('--actor');
const fail=message=>{throw new Error(message);};
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
 for(const [accountId,labels] of Object.entries(parsed.data)){
  const uniqueLabels=[...new Set(labels)],requested=[];
  for(const label of uniqueLabels){const pair=parseClassificationImport(label)[0];if(!pair||!pair.tipo){console.log(`H${accountId} rejected ${JSON.stringify(label)}: empty vertical.`);rejected++;continue;}requested.push(pair);}
  const account=await db.selectFrom('crmAccounts').selectAll().where('id','=',accountId).executeTakeFirst();
  const currentRows=account?await db.selectFrom('crmAccountClassifications').select(['tipo','subtipo']).where('accountId','=',accountId).orderBy('id').execute():[];
  const current=normalizeClassifications({pairs:currentRows}),currentKey=new Set(current.map(p=>JSON.stringify([p.tipo,p.subtipo])));
  console.log(`H${accountId} ${account?`${account.nombre} [${account.mergedIntoId?'merged':account.deletedAt?'trash':'active'}]`:'[missing]'}; current=${current.map(p=>p.tipo+(p.subtipo?'/'+p.subtipo:'')).join('; ')||'(none)'}`);
  if(!account||account.mergedIntoId||account.deletedAt){for(const pair of requested){console.log(`  rejected ${pair.tipo}${pair.subtipo?'/'+pair.subtipo:''}: ${!account?'business does not exist':account.mergedIntoId?'business is merged':'business is in trash'}.`);rejected++;}continue;}
  const candidates=[];
  for(const pair of requested){const label=pair.tipo+(pair.subtipo?'/'+pair.subtipo:'');if(currentKey.has(JSON.stringify([pair.tipo,pair.subtipo]))){console.log(`  sin cambios ${label}`);unchanged++;continue;}
   const vertical=await db.selectFrom('crmVerticals').select(['name','active']).where('name','=',pair.tipo).executeTakeFirst();
   let reason=vertical?.active?null:vertical?'vertical is inactive.':'vertical does not exist.';
   if(!reason&&pair.subtipo){const subtype=await db.selectFrom('crmSubtypes').select(['typeName','active']).where('name','=',pair.subtipo).executeTakeFirst();reason=!subtype?'subtype does not exist.':subtype.typeName!==pair.tipo?'subtype does not belong to this vertical.':!subtype.active?'subtype is inactive.':null;}
   if(reason){console.log(`  rejected ${label}: ${reason}`);rejected++;continue;}candidates.push(pair);
  }
  let merged=normalizeClassifications({pairs:[...current,...candidates]});
  const removedExisting=current.filter(pair=>!merged.some(next=>next.tipo===pair.tipo&&next.subtipo===pair.subtipo));
  if(removedExisting.length){const conflicts=candidates.filter(pair=>removedExisting.some(old=>old.tipo===pair.tipo));for(const pair of conflicts){console.log(`  rejected ${pair.tipo}${pair.subtipo?'/'+pair.subtipo:''}: adding it would remove an existing pair during normalization.`);rejected++;}const conflictKeys=new Set(conflicts.map(pair=>JSON.stringify([pair.tipo,pair.subtipo])));merged=normalizeClassifications({pairs:[...current,...candidates.filter(pair=>!conflictKeys.has(JSON.stringify([pair.tipo,pair.subtipo])))]});}
  const additions=merged.filter(pair=>!currentKey.has(JSON.stringify([pair.tipo,pair.subtipo])));
  if(merged.length>8){for(const pair of additions){console.log(`  rejected ${pair.tipo}${pair.subtipo?'/'+pair.subtipo:''}: maximum of 8 classifications after merging.`);rejected++;}continue;}
  if(additions.length)console.log(`  add=${additions.map(p=>p.tipo+(p.subtipo?'/'+p.subtipo:'')).join('; ')}`);
  if(!apply||!additions.length)continue;
  try{await db.transaction().execute(async trx=>setAccountClassifications({trx,accountId,pairs:merged,actor:{email:actor.email,displayName:actor.displayName},reason:'dedup2_secondary_verticals'}));added+=additions.length;}
  catch(error){failed+=additions.length;console.log(`  failed: ${error instanceof Error?error.message:'unknown error'}`);}
 }
 console.log('Final read-only verification:');
 let displayMismatches=0;
 for(const accountId of Object.keys(parsed.data)){
  const pairs=await db.selectFrom('crmAccountClassifications').select(['tipo','subtipo']).where('accountId','=',accountId).orderBy('id').execute();
  const actual=pairs.map(p=>p.tipo+(p.subtipo?'/'+p.subtipo:''));console.log(`H${accountId}: ${actual.join('; ')||'(none)'}`);
 }
 // The runbook asks for the whole-table count, including accounts outside this input file.
 const mismatch=await sql`SELECT count(*)::text AS count FROM crm_accounts a LEFT JOIN LATERAL (SELECT c.tipo,c.subtipo FROM crm_account_classifications c LEFT JOIN crm_verticals v ON v.name=c.tipo WHERE c.account_id=a.id ORDER BY v.sort_order NULLS LAST,c.tipo,(c.subtipo IS NOT NULL),c.subtipo LIMIT 1) d ON true WHERE a.tipo IS DISTINCT FROM d.tipo OR a.subtipo IS DISTINCT FROM d.subtipo`.execute(db);
 displayMismatches=Number(mismatch.rows[0]?.count??0);
 console.log(`Display-copy mismatches: ${displayMismatches}`);
 console.log(`Summary: added=${added}, unchanged=${unchanged}, rejected=${rejected}, failed=${failed}.`);
 if(failed)process.exitCode=1;
};
main().catch(error=>{console.error(error instanceof Error?error.message:'Load failed.');process.exitCode=1;}).finally(()=>db.destroy());
