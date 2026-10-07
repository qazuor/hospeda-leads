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
    await db.transaction().execute(async trx=>{
      // Initialize before locking so concurrent first saves serialize too.
      await trx.insertInto("appSettings").values({key,value:"[]"}).onConflict(oc=>oc.column("key").doNothing()).execute();
      const row=await trx.selectFrom("appSettings").select("value").where("key","=",key).forUpdate().executeTakeFirstOrThrow();
      let views:SavedLeadView[]=[];
      if(row.value){try{const parsed=JSON.parse(row.value);if(Array.isArray(parsed))views=parsed;}catch{throw new Error("No pude leer tus vistas guardadas. No se modificaron.");}}
      if(input.action==="save"){
        if(views.some(v=>v.name===input.view.name))throw new Error("Ya tenés una vista con ese nombre. Elegí otro o editá la existente.");
        views.push(input.view);
      }else if(input.action==="update"){
        const index=views.findIndex(v=>v.name===input.name);
        if(index<0)throw new Error("Esta vista ya no existe. Actualizá la lista y volvé a intentarlo.");
        if(views.some((v,i)=>i!==index&&v.name===input.view.name))throw new Error("Ya tenés una vista con ese nombre. Elegí otro.");
        views[index]=input.view;
      }else{
        views=views.filter(view=>view.name!==input.name);
      }
      await trx.updateTable("appSettings").set({value:JSON.stringify(views),updatedAt:new Date()}).where("key","=",key).execute();
    });
    return new Response(superjson.stringify({ok:true} satisfies OutputType),{headers:{"Content-Type":"application/json"}});
  }catch(error){
    return new Response(superjson.stringify({error:error instanceof Error?error.message:"No se pudo guardar la vista"}),{status:400});
  }
}