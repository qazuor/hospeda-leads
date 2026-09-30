import superjson from "superjson";
import { db } from "../helpers/db";
import { getServerUserSession } from "../helpers/getServerUserSession";
import { schema, type Bucket, type OutputType } from "./analytics_GET.schema";

const top=(rows:any[],key:string,limit=12):Bucket[]=>{
  const m=new Map<string,number>();
  for(const row of rows){const v=String(row[key]??"").trim();if(v)m.set(v,(m.get(v)??0)+1)}
  return Array.from(m,([name,count])=>({name,count})).sort((a,b)=>b.count-a.count).slice(0,limit);
};

export async function handle(request:Request){
  try{
    const {user}=await getServerUserSession(request);
    if(user.role!=="admin")return new Response(superjson.stringify({error:"Solo administradores pueden ver Estadísticas."}),{status:403});
    const input=schema.parse(Object.fromEntries(new URL(request.url).searchParams));
    let query=db.selectFrom("leads").where("deletedAt","is",null);
    if(input.from)query=query.where("fechaCreacion",">=",new Date(input.from+"T00:00:00"));
    if(input.to)query=query.where("fechaCreacion","<=",new Date(input.to+"T23:59:59.999"));
    if(input.responsible)query=query.where("assignedUserEmail","=",input.responsible);
    if(input.type)query=query.where("tipo","=",input.type);
    if(input.city)query=query.where("ciudad","=",input.city);
    const [rows,verticals,users]=await Promise.all([
      query.select(["estado","ciudad","tipo","subtipo","origen","prioridad","telefono","email","sitioWeb","fechaCreacion","fechaProximaAccion","fechaUltimoContacto","updatedAt","assignedUserEmail"]).execute(),
      db.selectFrom("crmVerticals").select("name").where("active","=",true).orderBy("sortOrder").execute(),
      db.selectFrom("users").select(["email","displayName"]).execute()
    ]);
    const userNames=new Map(users.map(item=>[item.email,item.displayName]));
    const normalized=rows.map(row=>({...row,responsibleName:row.assignedUserEmail?userNames.get(row.assignedUserEmail)||row.assignedUserEmail:"Sin responsable"}));
    const now=new Date(),inactiveLimit=new Date(Date.now()-30*86400000),day=new Map<string,number>();
    for(const row of rows){if(row.fechaCreacion){const d=new Date(row.fechaCreacion).toISOString().slice(0,10);day.set(d,(day.get(d)??0)+1)}}
    const subscribed=rows.filter(r=>r.estado==="Suscripto").length;
    const out:OutputType={
      total:rows.length,pending:rows.filter(r=>r.estado!=="Suscripto").length,subscribed,
      overdue:rows.filter(r=>r.fechaProximaAccion&&new Date(r.fechaProximaAccion)<now&&r.estado!=="Suscripto").length,
      withPhone:rows.filter(r=>!!r.telefono?.trim()).length,withEmail:rows.filter(r=>!!r.email?.trim()).length,withWebsite:rows.filter(r=>!!r.sitioWeb?.trim()).length,
      noContact:rows.filter(r=>!r.fechaUltimoContacto).length,contacted:rows.filter(r=>!!r.fechaUltimoContacto).length,
      inactive30:rows.filter(r=>r.estado!=="Suscripto"&&new Date(r.updatedAt)<inactiveLimit).length,
      conversionRate:rows.length?Math.round(subscribed*1000/rows.length)/10:0,
      byCity:top(rows,"ciudad",15),byStatus:top(rows,"estado",12),
      byType:verticals.map(v=>({name:v.name,count:rows.filter(r=>r.tipo===v.name).length})),
      bySubtype:top(rows,"subtipo",15),byOrigin:top(rows,"origen",12),byPriority:top(rows,"prioridad",5),
      byResponsible:top(normalized,"responsibleName",12),
      byTypeConversion:verticals.map(v=>{const subset=rows.filter(r=>r.tipo===v.name),s=subset.filter(r=>r.estado==="Suscripto").length;return {name:v.name,total:subset.length,subscribed:s,rate:subset.length?Math.round(s*1000/subset.length)/10:0}}),
      createdByDay:Array.from(day,([date,count])=>({date,count})).sort((a,b)=>a.date.localeCompare(b.date)).slice(-60)
    };
    return new Response(superjson.stringify(out),{headers:{"Content-Type":"application/json"}});
  }catch(error){
    return new Response(superjson.stringify({error:error instanceof Error?error.message:"No se pudieron cargar estadísticas"}),{status:400});
  }
}