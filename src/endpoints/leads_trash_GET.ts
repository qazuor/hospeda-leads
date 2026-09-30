import superjson from "superjson";
import { sql } from "kysely";
import { db } from "../helpers/db";
import { getServerUserSession } from "../helpers/getServerUserSession";
import { schema, type OutputType } from "./leads_trash_GET.schema";

export async function handle(request:Request){
  try{
    const {user}=await getServerUserSession(request);
    if(user.role!=="admin")return new Response(superjson.stringify({error:"Solo administradores pueden acceder a la papelera."}),{status:403});
    const input=schema.parse(Object.fromEntries(new URL(request.url).searchParams));
    let query=db.selectFrom("leads").where("deletedAt","is not",null);
    if(input.q){
      const s="%"+input.q.toLowerCase()+"%";
      query=query.where(eb=>eb.or([
        eb(sql<string>`lower(nombre)`,"like",s),
        eb(sql<string>`lower(coalesce(contact_name,''))`,"like",s),
        eb(sql<string>`lower(coalesce(email,''))`,"like",s),
        eb(sql<string>`lower(coalesce(ciudad,''))`,"like",s),
        eb(sql<string>`lower(coalesce(tipo,''))`,"like",s)
      ]));
    }
    const count=await query.select(({fn})=>fn.countAll<string>().as("count")).executeTakeFirstOrThrow();
    const rows=await query.selectAll().orderBy("deletedAt","desc").orderBy("id","desc").limit(input.pageSize).offset((input.page-1)*input.pageSize).execute();
    const out={rows,total:Number(count.count),page:input.page,pageSize:input.pageSize} satisfies OutputType;
    return new Response(superjson.stringify(out),{headers:{"Content-Type":"application/json"}});
  }catch(error){
    return new Response(superjson.stringify({error:error instanceof Error?error.message:"No se pudo cargar la papelera"}),{status:400});
  }
}