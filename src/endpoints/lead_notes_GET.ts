import superjson from "superjson";
import { db } from "../helpers/db";
import { getServerUserSession } from "../helpers/getServerUserSession";
import type { OutputType } from "./lead_notes_GET.schema";

export async function handle(request:Request){
  try{
    await getServerUserSession(request);
    const url=new URL(request.url);
    const leadId=url.searchParams.get("leadId");
    if(!leadId)throw new Error("Falta leadId");
    const rows=await db.selectFrom("leadNotes").selectAll().where("leadId","=",leadId).orderBy("createdAt","desc").execute();
    const out={notes:rows.map(x=>({...x,id:String(x.id),leadId:String(x.leadId)}))} satisfies OutputType;
    return new Response(superjson.stringify(out),{headers:{"Content-Type":"application/json"}});
  }catch(error){
    return new Response(superjson.stringify({error:error instanceof Error?error.message:"No se pudieron cargar las notas"}),{status:400});
  }
}