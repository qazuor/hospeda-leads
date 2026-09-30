import superjson from "superjson";
import { db } from "../helpers/db";
import { getServerUserSession } from "../helpers/getServerUserSession";
import type { Bucket, OutputType } from "./analytics_GET.schema";

const top=(rows:any[],key:string,limit=12):Bucket[]=>{
  const m=new Map<string,number>();
  for(const row of rows){const v=String(row[key]??"").trim();if(v)m.set(v,(m.get(v)??0)+1)}
  return Array.from(m,([name,count])=>({name,count})).sort((a,b)=>b.count-a.count).slice(0,limit);
};

export async function handle(request:Request){
  try{
    const {user}=await getServerUserSession(request);
    if(user.role!=="admin")return new Response(superjson.stringify({error:"Solo administradores pueden ver Estadísticas."}),{status:403});
    const [rows,verticals]=await Promise.all([
      db.selectFrom("leads").select(["estado","ciudad","tipo","subtipo","origen","prioridad","telefono","email","sitioWeb","fechaCreacion","fechaProximaAccion"]).where("deletedAt","is",null).execute(),
      db.selectFrom("crmVerticals").select("name").where("active","=",true).orderBy("sortOrder").execute()
    ]);
    const now=new Date();
    const day=new Map<string,number>();
    for(const row of rows){
      if(row.fechaCreacion){const d=new Date(row.fechaCreacion).toISOString().slice(0,10);day.set(d,(day.get(d)??0)+1)}
    }
    const out:OutputType={
      total:rows.length,
      pending:rows.filter(r=>r.estado!=="Suscripto").length,
      subscribed:rows.filter(r=>r.estado==="Suscripto").length,
      overdue:rows.filter(r=>r.fechaProximaAccion&&new Date(r.fechaProximaAccion)<now&&r.estado!=="Suscripto").length,
      withPhone:rows.filter(r=>!!r.telefono?.trim()).length,
      withEmail:rows.filter(r=>!!r.email?.trim()).length,
      withWebsite:rows.filter(r=>!!r.sitioWeb?.trim()).length,
      byCity:top(rows,"ciudad",15),
      byStatus:top(rows,"estado",12),
      byType:verticals.map(v=>({name:v.name,count:rows.filter(r=>r.tipo===v.name).length})),
      bySubtype:top(rows,"subtipo",15),
      byOrigin:top(rows,"origen",12),
      byPriority:top(rows,"prioridad",5),
      createdByDay:Array.from(day,([date,count])=>({date,count})).sort((a,b)=>a.date.localeCompare(b.date)).slice(-30)
    };
    return new Response(superjson.stringify(out),{headers:{"Content-Type":"application/json"}});
  }catch(error){
    return new Response(superjson.stringify({error:error instanceof Error?error.message:"No se pudieron cargar estadísticas"}),{status:400});
  }
}