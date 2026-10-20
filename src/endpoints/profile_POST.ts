import superjson from "superjson";
import { db } from "../helpers/db";
import { getServerUserSession } from "../helpers/getServerUserSession";
import { schema, type OutputType } from "./profile_POST.schema";
import {errorResponse} from '../helpers/errorResponse';
import {parseBody} from '../helpers/parseBody';
export async function handle(request:Request){
  try{
    const {user}=await getServerUserSession(request);
    const input=schema.parse(await parseBody(request));
    const updated=await db.updateTable("users").set({
      displayName:input.displayName,fullName:input.fullName,phone:input.phone,sex:input.sex,updatedAt:new Date()
    }).where("id","=",user.id).returning(["id","email","displayName","fullName","avatarUrl","role"]).executeTakeFirstOrThrow();
    return new Response(superjson.stringify({ok:true,user:updated} satisfies OutputType),{headers:{"Content-Type":"application/json"}});
  }catch(error){
    return errorResponse(error);
  }
}