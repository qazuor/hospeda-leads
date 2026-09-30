import superjson from "superjson";
import { db } from "../helpers/db";
import { getServerUserSession } from "../helpers/getServerUserSession";
import type { DuplicateGroup, OutputType } from "./leads_duplicates_GET.schema";

export async function handle(request:Request){
  try{
    await getServerUserSession(request);
    const rows=await db.selectFrom("leads").select(["id","nombre","ciudad","telefono","email"]).where("deletedAt","is",null).execute();
    const groups:DuplicateGroup[]=[];
    const build=(reason:string,keyOf:(row:any)=>string)=>{
      const map=new Map<string,typeof rows>();
      for(const row of rows){
        const key=keyOf(row);
        if(!key) continue;
        const list=map.get(key)??[];
        list.push(row);
        map.set(key,list);
      }
      for(const [key,list] of map){
        if(list.length>1) groups.push({reason,key,leads:list.map(x=>({...x,id:String(x.id)}))});
      }
    };
    build("Mismo nombre y ciudad",r=>r.nombre?.trim()?r.nombre.trim().toLowerCase()+"|"+(r.ciudad??"").trim().toLowerCase():"");
    build("Mismo email",r=>r.email?.trim()?.toLowerCase()??"");
    build("Mismo teléfono",r=>{const p=(r.telefono??"").replace(/\D/g,"");return p.length>=6?p:""});
    groups.sort((a,b)=>b.leads.length-a.leads.length);
    return new Response(superjson.stringify({groups} satisfies OutputType));
  }catch(error){
    return new Response(superjson.stringify({error:error instanceof Error?error.message:"No se pudieron buscar duplicados"}),{status:400});
  }
}