import superjson from "superjson";
import { db } from "../helpers/db";
import { getServerUserSession } from "../helpers/getServerUserSession";
import type { OutputType } from "./live_version_GET.schema";

export async function handle(request:Request){
  try{
    await getServerUserSession(request);
    const row=await db.selectFrom("appSettings").select("value").where("key","=","crm_live_version").executeTakeFirst();
    return new Response(
      superjson.stringify({version:row?.value??"0"} satisfies OutputType),
      {headers:{"Content-Type":"application/json","Cache-Control":"no-store"}}
    );
  }catch(error){
    return new Response(superjson.stringify({error:error instanceof Error?error.message:"No se pudo comprobar cambios"}),{status:401});
  }
}