import superjson from "superjson";
import { db } from "../helpers/db";
import { getServerUserSession } from "../helpers/getServerUserSession";
import type { OutputType } from "./profile_GET.schema";
export async function handle(request:Request){
  try{
    const {user}=await getServerUserSession(request);
    const profile=await db.selectFrom("users").select(["id","email","displayName","fullName","phone","sex","senderEmail","role"]).where("id","=",user.id).executeTakeFirstOrThrow();
    return new Response(superjson.stringify({profile} satisfies OutputType),{headers:{"Content-Type":"application/json"}});
  }catch(error){
    return new Response(superjson.stringify({error:error instanceof Error?error.message:"No se pudo cargar el perfil"}),{status:400});
  }
}