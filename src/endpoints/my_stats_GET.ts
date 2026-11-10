import superjson from 'superjson';
import {sql,type Transaction} from 'kysely';
import {db} from '../helpers/db';
import type {DB} from '../helpers/schema';
import {getServerUserSession} from '../helpers/getServerUserSession';
import {NotAuthenticatedError} from '../helpers/getSetServerSession';
import {crmError,fallbackStatus} from '../helpers/crmErrors';
import {CONTACT_EVIDENCE_STATUSES} from '../helpers/contactEvidence';
import {buildMyStatsSeries,myStatsCloseRate,validateMyStatsPeriod} from '../helpers/myStats';
import {schema,type OutputType} from './my_stats_GET.schema';

const reply=(data:unknown,status=200)=>new Response(superjson.stringify(data),{status,headers:{'Content-Type':'application/json'}});
/** Returns aggregate statistics for the session user only. */
export async function handle(request:Request){
 try{
  const {user}=await getServerUserSession(request),params=new URL(request.url).searchParams;
  // The role check runs before validation: any `user` from a seller is a 403, even a malformed one.
  if(params.has('user')&&user.role!=='admin')return reply({error:'Solo un administrador puede ver las estadísticas de otra persona.'},403);
  const input=schema.parse(Object.fromEntries(params.entries())),{from,to}=input,period=validateMyStatsPeriod(from,to);
  const result=await db.transaction().execute(async trx=>{
   await sql`SET TRANSACTION READ ONLY`.execute(trx);
   const email=input.user===undefined?user.email:(await trx.selectFrom('users').select('email').where('id','=',Number(input.user)).where('deactivatedAt','is',null).executeTakeFirst())?.email;
   if(!email)throw new Error('Ese usuario no existe o está inactivo.');
   const today=(await sql<{today:string}>`SELECT to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires','YYYY-MM-DD') today`.execute(trx)).rows[0]!.today;
   const liveAccounts=sql`a.deleted_at IS NULL AND a.merged_into_id IS NULL AND a.archived_at IS NULL`;
   const [work,businesses,managements,losses,contacts,series,firstContact]=await Promise.all([
    sql<{completed:string;overdue:string;today:string}>`SELECT count(*) FILTER(WHERE t.status='completed' AND t.completed_at>=${period.start} AND t.completed_at<${period.end} AND a.deleted_at IS NULL AND (t.lead_id IS NULL OR l.deleted_at IS NULL)) completed,count(*) FILTER(WHERE t.status='pending' AND (t.due_date<${today}::date OR (t.due_at IS NOT NULL AND t.due_at<now())) AND ${liveAccounts} AND (t.lead_id IS NULL OR l.deleted_at IS NULL)) overdue,count(*) FILTER(WHERE t.status='pending' AND t.due_date=${today}::date AND (t.due_at IS NULL OR t.due_at>=now()) AND ${liveAccounts} AND (t.lead_id IS NULL OR l.deleted_at IS NULL)) today FROM crm_tasks t JOIN crm_accounts a ON a.id=t.account_id LEFT JOIN leads l ON l.id=t.lead_id WHERE t.assigned_user_email=${email} AND t.deleted_at IS NULL`.execute(trx),
    sql<{status:string;count:string;dnc:string}>`SELECT a.status,count(*)::text count,count(*) FILTER(WHERE a.do_not_contact)::text dnc FROM crm_accounts a WHERE a.assigned_user_email=${email} AND ${liveAccounts} GROUP BY a.status`.execute(trx),
    sql<{open:string;stale:string}>`SELECT count(*) FILTER(WHERE s.classification='open') open,count(*) FILTER(WHERE s.classification='open' AND coalesce(l.stage_since,l.created_at)<now()-interval '30 days' AND NOT EXISTS(SELECT 1 FROM crm_activities x WHERE x.lead_id=l.id AND x.deleted_at IS NULL AND x.occurred_at>=now()-interval '30 days') AND NOT EXISTS(SELECT 1 FROM crm_pipeline_events x WHERE x.lead_id=l.id AND x.created_at>=now()-interval '30 days') AND NOT EXISTS(SELECT 1 FROM crm_tasks x WHERE x.lead_id=l.id AND x.deleted_at IS NULL AND x.status='completed' AND x.completed_at>=now()-interval '30 days')) stale FROM leads l JOIN crm_accounts a ON a.id=l.account_id JOIN crm_stages s ON s.name=l.estado WHERE l.assigned_user_email=${email} AND l.deleted_at IS NULL AND ${liveAccounts}`.execute(trx),
    sql<{reason:string;count:string}>`WITH last_close AS (SELECT DISTINCT ON (e.lead_id) e.lead_id,e.classification,e.reason_id FROM crm_pipeline_events e JOIN leads l ON l.id=e.lead_id JOIN crm_accounts a ON a.id=e.account_id WHERE e.actor_email=${email} AND e.classification IN ('won','lost') AND e.created_at>=${period.start} AND e.created_at<${period.end} AND l.deleted_at IS NULL AND a.deleted_at IS NULL ORDER BY e.lead_id,e.created_at DESC,e.id DESC) SELECT coalesce(r.name,'Sin motivo') reason,count(*)::text count FROM last_close c LEFT JOIN crm_loss_reasons r ON r.id=c.reason_id WHERE c.classification='lost' GROUP BY r.name ORDER BY count(*) DESC`.execute(trx),
    evidenceEvents(trx,email,period.start,period.end),
    sql<{period:string;contacts:string;won:string}>`WITH ev AS (${evidenceUnion({email:email,start:period.start,end:period.end})}), last_close AS (SELECT DISTINCT ON(e.lead_id) e.lead_id,e.classification,e.created_at FROM crm_pipeline_events e JOIN leads l ON l.id=e.lead_id JOIN crm_accounts a ON a.id=e.account_id WHERE e.actor_email=${email} AND e.classification IN('won','lost') AND e.created_at>=${period.start} AND e.created_at<${period.end} AND l.deleted_at IS NULL AND a.deleted_at IS NULL ORDER BY e.lead_id,e.created_at DESC,e.id DESC), wins AS (SELECT (created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date d,count(*) n FROM last_close WHERE classification='won' GROUP BY 1), days AS (SELECT (at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date d,count(*) n FROM ev GROUP BY 1) SELECT coalesce(days.d,wins.d)::text period,coalesce(days.n,0)::text contacts,coalesce(wins.n,0)::text won FROM days FULL JOIN wins USING(d) ORDER BY 1`.execute(trx),
    sql<{average:string|null;samples:string}>`WITH mine AS (SELECT l.id,l.created_at FROM leads l JOIN crm_accounts a ON a.id=l.account_id WHERE l.assigned_user_email=${email} AND l.deleted_at IS NULL AND a.deleted_at IS NULL AND l.created_at>=${period.start} AND l.created_at<${period.end}), ev AS (${evidenceUnion({email:null,start:null,end:null})}), firsts AS (SELECT m.id,m.created_at,min(e.at) first_at FROM mine m JOIN ev e ON e.lead_id=m.id GROUP BY m.id,m.created_at) SELECT avg(greatest(0,(first_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date-(created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date))::text average,count(*)::text samples FROM firsts`.execute(trx)
   ]);
   const contactCounts=contacts.rows[0]??{events:'0',businesses:'0'},closeRows=(await sql<{won:string;lost:string}>`WITH lc AS (SELECT DISTINCT ON(e.lead_id) e.lead_id,e.classification FROM crm_pipeline_events e JOIN leads l ON l.id=e.lead_id JOIN crm_accounts a ON a.id=e.account_id WHERE e.actor_email=${email} AND e.classification IN('won','lost') AND e.created_at>=${period.start} AND e.created_at<${period.end} AND l.deleted_at IS NULL AND a.deleted_at IS NULL ORDER BY e.lead_id,e.created_at DESC,e.id DESC) SELECT count(*) FILTER(WHERE classification='won')::text won,count(*) FILTER(WHERE classification='lost')::text lost FROM lc`.execute(trx)).rows[0];
   const byStatus=businesses.rows.map(r=>({status:r.status??'Sin estado',count:Number(r.count)}));
   const won=Number(closeRows.won),lost=Number(closeRows.lost);
   return {period:{from,to},asOf:today,work:{completed:Number(work.rows[0]?.completed??0),overdue:Number(work.rows[0]?.overdue??0),today:Number(work.rows[0]?.today??0)},businesses:{total:byStatus.reduce((sum,r)=>sum+r.count,0),doNotContact:businesses.rows.reduce((sum,r)=>sum+Number(r.dnc??0),0),byStatus},managements:{open:Number(managements.rows[0]?.open??0),won,lost,closeRate:myStatsCloseRate(won,lost),lossReasons:losses.rows.map(r=>({reason:r.reason,count:Number(r.count)})),stale:Number(managements.rows[0]?.stale??0)},contacts:{events:Number(contactCounts.events),businesses:Number(contactCounts.businesses),firstContactAverageDays:firstContact.rows[0]?.average===null?null:Number(firstContact.rows[0]?.average??0),firstContactSamples:Number(firstContact.rows[0]?.samples??0)},series:buildMyStatsSeries(from,to,series.rows.map(r=>({period:r.period,contacts:Number(r.contacts),won:Number(r.won)})))} satisfies OutputType;
  });
  return reply(result);
 }catch(e){return reply({error:crmError(e)},e instanceof NotAuthenticatedError?401:fallbackStatus(e));}
}
/** Contact evidence counts events by their recorded actor, not by current business assignment. */
async function evidenceEvents(trx:Transaction<DB>,email:string,start:Date,end:Date){
 return sql<{events:string;businesses:string}>`WITH events AS (${evidenceUnion({email,start,end})}) SELECT count(*)::text events,count(DISTINCT account_id)::text businesses FROM events`.execute(trx);
}
/** Evidence filters: the actor (null = anyone) and an optional `[start,end)` window. */
type EvidenceScope={email:string|null;start:Date|null;end:Date|null};
/**
 * One row per real contact, following `contactEvidence.ts`, without counting one interaction twice:
 * an activity linked to a message is represented by the message; an inbound registered as a response by the response;
 * the activity created when a response resolves a task by that response. A send is dated when it was completed,
 * so a later reply does not move it to another period. Rows of businesses in the trash are dropped (spec 109 D3).
 */
function evidenceUnion({email,start,end}:EvidenceScope){
 const actor=(column:string)=>email===null?sql`TRUE`:sql`${sql.ref(column)}=${email}`;
 const window=(at:ReturnType<typeof sql.raw>)=>sql`${start===null?sql`TRUE`:sql`${at}>=${start}`} AND ${end===null?sql`TRUE`:sql`${at}<${end}`}`;
 const sentAt=sql.raw('coalesce(m.completed_at,m.created_at)');
 return sql`SELECT 'message'::text kind,m.account_id,m.lead_id,${sentAt} at FROM crm_messages m JOIN crm_accounts a ON a.id=m.account_id LEFT JOIN leads l ON l.id=m.lead_id WHERE ${actor('m.owner_email')} AND m.status=ANY(${[...CONTACT_EVIDENCE_STATUSES]}::text[]) AND ${window(sentAt)} AND a.deleted_at IS NULL AND (m.lead_id IS NULL OR l.deleted_at IS NULL)
 UNION ALL SELECT 'activity',x.account_id,x.lead_id,x.occurred_at FROM crm_activities x JOIN crm_accounts a ON a.id=x.account_id LEFT JOIN crm_messages m ON m.activity_id=x.id LEFT JOIN leads l ON l.id=x.lead_id WHERE ${actor('x.actor_email')} AND x.deleted_at IS NULL AND ${window(sql.raw('x.occurred_at'))} AND a.deleted_at IS NULL AND (x.lead_id IS NULL OR l.deleted_at IS NULL) AND m.id IS NULL AND (x.outcome IS NULL OR x.outcome<>'no_answer')
  AND NOT (x.task_id IS NOT NULL AND EXISTS(SELECT 1 FROM crm_communication_journal j WHERE j.account_id=x.account_id AND j.action='response_task_resolved' AND j.after_value->>'activityId'=x.id::text))
 UNION ALL SELECT 'response',r.account_id,r.lead_id,r.occurred_at FROM crm_communication_responses r JOIN crm_accounts a ON a.id=r.account_id LEFT JOIN leads l ON l.id=r.lead_id WHERE ${actor('r.actor_email')} AND ${window(sql.raw('r.occurred_at'))} AND a.deleted_at IS NULL AND (r.lead_id IS NULL OR l.deleted_at IS NULL)
 UNION ALL SELECT 'inbound',i.account_id,i.lead_id,i.received_at FROM crm_inbound_messages i JOIN crm_accounts a ON a.id=i.account_id LEFT JOIN leads l ON l.id=i.lead_id WHERE ${actor('i.captured_by_email')} AND i.status IN('pending_review','registered') AND i.response_id IS NULL AND i.is_automatic=false AND ${window(sql.raw('i.received_at'))} AND a.deleted_at IS NULL AND (i.lead_id IS NULL OR l.deleted_at IS NULL)`;
}
