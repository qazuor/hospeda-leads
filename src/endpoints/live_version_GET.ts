import superjson from "superjson";
import { db } from "../helpers/db";
import { getServerUserSession } from "../helpers/getServerUserSession";
import type { OutputType } from "./live_version_GET.schema";

const LEGACY_KEY="crm_live_version";
const DOMAIN_PREFIX="crm_live_version:";

export async function handle(request:Request){
  try{
    await getServerUserSession(request);
    const rows=await db.selectFrom("appSettings").select(["key","value"]).where(eb=>eb.or([eb("key","=",LEGACY_KEY),eb("key","like",DOMAIN_PREFIX+"%")])).execute();
    const domains:Record<string,string>={};
    for(const row of rows)if(row.key.startsWith(DOMAIN_PREFIX))domains[row.key.slice(DOMAIN_PREFIX.length)]=row.value;
    return new Response(
      superjson.stringify({version:rows.find(row=>row.key===LEGACY_KEY)?.value??"0",domains} satisfies OutputType),
      {headers:{"Content-Type":"application/json","Cache-Control":"no-store"}}
    );
  }catch(error){
    return new Response(superjson.stringify({error:error instanceof Error?error.message:"No se pudo comprobar cambios"}),{status:401});
  }
}