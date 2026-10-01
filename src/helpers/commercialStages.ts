import type { Kysely, Transaction } from "kysely";
import type { DB } from "./schema";

export async function getOpportunityStages(executor:Kysely<DB>|Transaction<DB>){
  const [setting,historical]=await Promise.all([
    executor.selectFrom("appSettings").select("value").where("key","=","crm_opportunity_stages").executeTakeFirst(),
    executor.selectFrom("leads").select("estado").distinct().where("estado","is not",null).execute()
  ]);
  const configured=setting?JSON.parse(setting.value):[];
  return [...new Set<string>([...(Array.isArray(configured)?configured.filter(x=>typeof x==="string"&&x.trim()):[]),...historical.map(x=>x.estado!).filter(Boolean)])];
}
