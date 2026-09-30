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
      query.select(["id","estado","ciudad","tipo","subtipo","origen","prioridad","telefono","email","sitioWeb","fechaCreacion","fechaProximaAccion","fechaUltimoContacto","createdAt","updatedAt","assignedUserEmail"]).execute(),
      db.selectFrom("crmVerticals").select("name").where("active","=",true).orderBy("sortOrder").execute(),
      db.selectFrom("users").select(["email","displayName"]).execute()
    ]);
    const userNames=new Map(users.map(item=>[item.email,item.displayName]));
    const normalized=rows.map(row=>({...row,responsibleName:row.assignedUserEmail?userNames.get(row.assignedUserEmail)||row.assignedUserEmail:"Sin responsable"}));
    const ids=rows.map(row=>String(row.id));
    const journalRows=ids.length?await db.selectFrom("leadJournal").select(["leadId","action","fieldName","oldValue","newValue","createdAt"]).where("leadId","in",ids).orderBy("createdAt").execute():[];
    const journalByLead=new Map<string,typeof journalRows>();
    for(const entry of journalRows){if(entry.leadId===null)continue;const key=String(entry.leadId);const list=journalByLead.get(key)??[];list.push(entry);journalByLead.set(key,list)}
    const now=new Date(),inactiveLimit=new Date(Date.now()-30*86400000),weekLimit=new Date(Date.now()-7*86400000),day=new Map<string,number>();
    const firstContactDays:number[]=[];
    const statusDurations=new Map<string,{days:number;samples:number}>();
    const addStatusDuration=(name:string|null|undefined,start:Date,end:Date)=>{
      const key=(name??"").trim();if(!key)return;
      const days=Math.max(0,(end.getTime()-start.getTime())/86400000);
      const current=statusDurations.get(key)??{days:0,samples:0};current.days+=days;current.samples+=1;statusDurations.set(key,current);
    };
    for(const lead of rows){
      const events=journalByLead.get(String(lead.id))??[];
      const firstContact=events.find(entry=>entry.action==="contact_logged"||entry.action==="email_sent"||(entry.fieldName==="fechaUltimoContacto"&&!!entry.newValue));
      if(firstContact){
        const created=new Date(lead.createdAt),contacted=new Date(firstContact.createdAt);
        if(contacted>=created)firstContactDays.push((contacted.getTime()-created.getTime())/86400000);
      }
      const stateEvents=events.filter(entry=>entry.fieldName==="estado");
      let stateStart=new Date(lead.createdAt);
      let currentState=stateEvents[0]?.oldValue||lead.estado;
      for(const entry of stateEvents){
        const at=new Date(entry.createdAt);addStatusDuration(entry.oldValue||currentState,stateStart,at);
        currentState=entry.newValue||currentState;stateStart=at;
      }
      addStatusDuration(lead.estado||currentState,stateStart,now);
    }
    for(const row of rows){if(row.fechaCreacion){const d=new Date(row.fechaCreacion).toISOString().slice(0,10);day.set(d,(day.get(d)??0)+1)}}
    const subscribed=rows.filter(r=>r.estado==="Suscripto").length;
    const out:OutputType={
      total:rows.length,pending:rows.filter(r=>r.estado!=="Suscripto").length,subscribed,
      overdue:rows.filter(r=>r.fechaProximaAccion&&new Date(r.fechaProximaAccion)<now&&r.estado!=="Suscripto").length,
      withPhone:rows.filter(r=>!!r.telefono?.trim()).length,withEmail:rows.filter(r=>!!r.email?.trim()).length,withWebsite:rows.filter(r=>!!r.sitioWeb?.trim()).length,
      noContact:rows.filter(r=>!r.fechaUltimoContacto).length,contacted:rows.filter(r=>!!r.fechaUltimoContacto).length,
      inactive30:rows.filter(r=>r.estado!=="Suscripto"&&new Date(r.updatedAt)<inactiveLimit).length,
      new7:rows.filter(r=>new Date(r.createdAt)>=weekLimit).length,
      conversionRate:rows.length?Math.round(subscribed*1000/rows.length)/10:0,
      avgDaysToFirstContact:firstContactDays.length?Math.round(firstContactDays.reduce((a,b)=>a+b,0)/firstContactDays.length*10)/10:null,
      firstContactSamples:firstContactDays.length,
      byCity:top(rows,"ciudad",15),byStatus:top(rows,"estado",12),
      byType:verticals.map(v=>({name:v.name,count:rows.filter(r=>r.tipo===v.name).length})),
      bySubtype:top(rows,"subtipo",15),byOrigin:top(rows,"origen",12),byPriority:top(rows,"prioridad",5),
      byResponsible:top(normalized,"responsibleName",12),
      byTypeConversion:verticals.map(v=>{const subset=rows.filter(r=>r.tipo===v.name),s=subset.filter(r=>r.estado==="Suscripto").length;return {name:v.name,total:subset.length,subscribed:s,rate:subset.length?Math.round(s*1000/subset.length)/10:0}}),
      byResponsibleConversion:Array.from(new Set(normalized.map(r=>r.responsibleName))).map(name=>{const subset=normalized.filter(r=>r.responsibleName===name),s=subset.filter(r=>r.estado==="Suscripto").length;return {name,total:subset.length,subscribed:s,rate:subset.length?Math.round(s*1000/subset.length)/10:0}}).sort((a,b)=>b.total-a.total),
      avgDaysByStatus:Array.from(statusDurations,([name,value])=>({name,days:Math.round(value.days/value.samples*10)/10,samples:value.samples})).sort((a,b)=>b.days-a.days),
      createdByDay:Array.from(day,([date,count])=>({date,count})).sort((a,b)=>a.date.localeCompare(b.date)).slice(-60)
    };
    return new Response(superjson.stringify(out),{headers:{"Content-Type":"application/json"}});
  }catch(error){
    return new Response(superjson.stringify({error:error instanceof Error?error.message:"No se pudieron cargar estadísticas"}),{status:400});
  }
}