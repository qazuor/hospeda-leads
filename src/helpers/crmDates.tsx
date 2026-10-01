const parseDate=(value:unknown):Date|null=>{
  if(!value)return null;
  if(value instanceof Date)return Number.isNaN(value.getTime())?null:value;
  const raw=String(value);
  const d=/^\d{4}-\d{2}-\d{2}$/.test(raw)?new Date(raw+"T12:00:00"):new Date(raw);
  return Number.isNaN(d.getTime())?null:d;
};
const dayStart=(d:Date)=>new Date(d.getFullYear(),d.getMonth(),d.getDate());
const dayDiff=(a:Date,b:Date)=>Math.round((dayStart(a).getTime()-dayStart(b).getTime())/86400000);

export const toDateInput=(value:unknown)=>{
  const d=parseDate(value);
  if(!d)return "";
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
};

export const formatDate=(value:unknown,withTime=false)=>{
  const d=parseDate(value);
  if(!d)return "Vacío";
  return withTime
    ? d.toLocaleString("es-AR",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})
    : d.toLocaleDateString("es-AR",{day:"numeric",month:"short",year:"numeric"});
};

export type NextActionTone="empty"|"overdue"|"today"|"soon"|"future";
export const nextActionInfo=(value:unknown)=>{
  const d=parseDate(value);
  if(!d)return {label:"Sin próxima acción",tone:"empty" as NextActionTone,title:"Sin fecha"};
  const diff=dayDiff(d,new Date());
  const dateLabel=d.toLocaleDateString("es-AR",{weekday:"short",day:"numeric",month:"short"});
  if(diff<0){
    const days=Math.abs(diff);
    return {label:days===1?"Vencida ayer":`Vencida hace ${days} días`,tone:"overdue" as NextActionTone,title:formatDate(d)};
  }
  if(diff===0)return {label:"Hoy",tone:"today" as NextActionTone,title:formatDate(d)};
  if(diff===1)return {label:"Mañana",tone:"soon" as NextActionTone,title:formatDate(d)};
  if(diff<=7)return {label:dateLabel,tone:"soon" as NextActionTone,title:formatDate(d)};
  return {label:dateLabel,tone:"future" as NextActionTone,title:formatDate(d)};
};

export const journalValue=(field:string|null,value:unknown)=>{
  if(value===null||value===undefined||value==="")return "Vacío";
  if(["fechaCreacion","fechaUltimoContacto","fechaProximaAccion","createdAt","updatedAt"].includes(field??""))return formatDate(value);
  if(field==="clientePotencialRecurrente"){
    if(String(value)==="true")return "Sí";
    if(String(value)==="false")return "No";
  }
  return String(value);
};