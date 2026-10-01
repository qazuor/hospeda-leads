import superjson from "superjson";
import { db } from "../helpers/db";
import { getServerUserSession } from "../helpers/getServerUserSession";
import type { OutputType, SavedLeadView } from "./saved_views_GET.schema";

export async function handle(request:Request){
  try{
    const {user}=await getServerUserSession(request);
    const row=await db.selectFrom("appSettings").select("value").where("key","=","lead_saved_views:"+user.id).executeTakeFirst();
    let views:SavedLeadView[]=[];
    if(row?.value){
      try{
        const parsed=JSON.parse(row.value);
        if(Array.isArray(parsed))views=parsed.filter(item=>item&&typeof item.name==="string"&&item.config&&typeof item.config==="object");
      }catch{}
    }
    return new Response(superjson.stringify({views} satisfies OutputType),{headers:{"Content-Type":"application/json"}});
  }catch(error){
    return new Response(superjson.stringify({error:error instanceof Error?error.message:"No se pudieron cargar las vistas"}),{status:400});
  }
}