import {sql,type Kysely} from 'kysely';import {createHash} from 'node:crypto';
import type {DB} from './schema';
/** Hard limits of spec 101 D1 (owner, 31/10/2026): misses (unknown tokens, wrong or missing slugs, malformed links) per client in a sliding window. */
export const SHARE_UNKNOWN_LIMIT=5,SHARE_UNKNOWN_WINDOW_MINUTES=60;
/** How often (at most) one process deletes attempts older than the window. */
const CLEANUP_INTERVAL_MS=10*60000;
/** sha256 of the client key (`shareClientKey`): the database never keeps the IP in clear. */
export const shareClientHash=({clientKey}:{clientKey:string}):string=>createHash('sha256').update('crm-share-attempt:'+clientKey,'utf8').digest('hex');
let lastCleanup=0;
/**
 * Records one miss of a public link lookup under the persisted budget (spec 101 D1): at most {@link SHARE_UNKNOWN_LIMIT} misses per client key
 * in the last {@link SHARE_UNKNOWN_WINDOW_MINUTES} minutes, counted in `crm_sales_material_share_attempts`. Returns `limited` when the client
 * had already spent its budget (then nothing is recorded and the caller answers 429; otherwise the caller answers 404).
 * Only misses come here: a valid link is resolved first and never spends or checks budget (owner decision «Los válidos siempre abren»).
 * A transaction-level advisory lock per client serializes its misses, so parallel requests cannot overshoot the limit.
 * Rows older than the window are deleted at most once every 10 minutes per process; a failed cleanup is retried later and never fails the request.
 */
export async function recordShareMiss(db:Kysely<DB>,{clientKey,now=Date.now}:{clientKey:string;now?:()=>number}):Promise<{limited:boolean}>{
 const hash=shareClientHash({clientKey});
 const outcome=await db.transaction().execute(async e=>{
  await sql`SELECT pg_advisory_xact_lock(hashtext('crm_sales_material_share_attempts'),hashtext(${hash}))`.execute(e);
  const spent=(await sql<{n:number}>`SELECT count(*)::int AS n FROM crm_sales_material_share_attempts WHERE client_hash=${hash} AND attempted_at>now()-make_interval(mins=>${SHARE_UNKNOWN_WINDOW_MINUTES}::int)`.execute(e)).rows[0]!.n;
  if(spent>=SHARE_UNKNOWN_LIMIT)return {limited:true};
  await sql`INSERT INTO crm_sales_material_share_attempts(client_hash) VALUES(${hash})`.execute(e);
  return {limited:false};
 });
 if(now()-lastCleanup>=CLEANUP_INTERVAL_MS){
  lastCleanup=now();
  try{await sql`DELETE FROM crm_sales_material_share_attempts WHERE attempted_at<now()-make_interval(mins=>${SHARE_UNKNOWN_WINDOW_MINUTES}::int)`.execute(db);}catch{lastCleanup=0;}
 }
 return outcome;
}
