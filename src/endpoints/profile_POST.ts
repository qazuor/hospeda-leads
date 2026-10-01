import superjson from "superjson";
import { db } from "../helpers/db";
import { getServerUserSession } from "../helpers/getServerUserSession";
import { schema, type OutputType } from "./profile_POST.schema";
export async function handle(request:Request){
  try{
    const {user}=await getServerUserSession(request);
    const input=schema.parse(superjson.parse(await request.text()));
    const updated=await db.updateTable("users").set({
      displayName:input.displayName,fullName:input.fullName,phone:input.phone,sex:input.sex,updatedAt:new Date()
    }).where("id","=",user.id).returning(["id","email","displayName","avatarUrl","role"]).executeTakeFirstOrThrow();
    return new Response(superjson.stringify({ok:true,user:updated} satisfies OutputType),{headers:{"Content-Type":"application/json"}});
  }catch(error){
    return new Response(superjson.stringify({error:error instanceof Error?error.message:"No se pudo guardar el perfil"}),{status:400});
  }
}