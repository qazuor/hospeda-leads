import superjson from "superjson";
import { db } from "../helpers/db";
import { getServerUserSession } from "../helpers/getServerUserSession";
import type { OutputType } from "./profile_GET.schema";
import {errorResponse} from '../helpers/errorResponse';
export async function handle(request:Request){
  try{
    const {user}=await getServerUserSession(request);
    const profile=await db.selectFrom("users").select(["id","email","displayName","fullName","phone","sex","senderEmail","role"]).where("id","=",user.id).executeTakeFirstOrThrow();
    return new Response(superjson.stringify({profile} satisfies OutputType),{headers:{"Content-Type":"application/json"}});
  }catch(error){
    return errorResponse(error);
  }
}