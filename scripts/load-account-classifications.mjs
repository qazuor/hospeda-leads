import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {db} from '../src/helpers/db.tsx';
import {loadAccountClassifications} from './lib/accountClassificationLoader.mjs';

const args=process.argv.slice(2),fileIndex=args.indexOf('--file'),apply=args.includes('--apply'),actorIndex=args.indexOf('--actor');
const fail=message=>{throw new Error(message);};
const inputSchema=z.record(z.string().regex(/^\d+$/),z.array(z.string()));
const main=async()=>{
 if(fileIndex<0||!args[fileIndex+1])fail('Usage: node --import tsx scripts/load-account-classifications.mjs --file <json> [--apply --actor <email>]');
 if(apply&&(actorIndex<0||!args[actorIndex+1]))fail('--apply requires --actor <email>.');
 const parsed=inputSchema.safeParse(JSON.parse(await readFile(args[fileIndex+1],'utf8')));
 if(!parsed.success)fail('Input must be an object mapping numeric account IDs to arrays of classification strings.');
 const ids=Object.keys(parsed.data),canonical=new Set();
 for(const id of ids){const key=BigInt(id).toString();if(canonical.has(key))fail(`Input contains account IDs that resolve to the same account (including ${id}).`);canonical.add(key);}
 const result=await loadAccountClassifications({db,entries:parsed.data,actor:actorIndex>=0?args[actorIndex+1]:null,apply,log:console.log});
 if(result.totals.added+result.totals.unchanged+result.totals.rejected+result.totals.failed!==result.candidateCount){console.log('Summary error: outcome totals do not match the number of candidates.');process.exitCode=1;}
 if(result.exitCode)process.exitCode=1;
};
main().catch(error=>{console.error(error instanceof Error?error.message:'Load failed.');process.exitCode=1;}).finally(()=>db.destroy());
