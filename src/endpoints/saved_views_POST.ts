import superjson from "superjson";
import { db } from "../helpers/db";
import { getServerUserSession } from "../helpers/getServerUserSession";
import { schema, type OutputType } from "./saved_views_POST.schema";
import type { SavedLeadView } from "./saved_views_GET.schema";

export async function handle(request:Request){
  try{
    const {user}=await getServerUserSession(request);
    const input=schema.parse(superjson.parse(await request.text()));
    const key="lead_saved_views:"+user.id;
    const row=await db.selectFrom("appSettings").select("value").where("key","=",key).executeTakeFirst();
    let views:SavedLeadView[]=[];
    if(row?.value){
      try{const parsed=JSON.parse(row.value);if(Array.isArray(parsed))views=parsed}catch{}
    }
    if(input.action==="save"){
      views=[...views.filter(view=>view.name!==input.view.name),input.view];
    }else{
      views=views.filter(view=>view.name!==input.name);
    }
    await db.insertInto("appSettings").values({key,value:JSON.stringify(views)})
      .onConflict(oc=>oc.column("key").doUpdateSet({value:JSON.stringify(views),updatedAt:new Date()})).execute();
    return new Response(superjson.stringify({ok:true} satisfies OutputType),{headers:{"Content-Type":"application/json"}});
  }catch(error){
    return new Response(superjson.stringify({error:error instanceof Error?error.message:"No se pudo guardar la vista"}),{status:400});
  }
}