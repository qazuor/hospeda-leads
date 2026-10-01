import {sql,type Kysely,type Transaction} from "kysely";
import type {DB} from "./schema";
export async function getOpportunityStages(executor:Kysely<DB>|Transaction<DB>){
 const {rows}=await sql<{name:string}>`SELECT name FROM crm_stages WHERE active OR name IN (SELECT estado FROM leads WHERE estado IS NOT NULL) ORDER BY sort_order,name`.execute(executor);
 return rows.map(s=>s.name);
}
