import {localDay,calendarDay,CRM_TIME_ZONE} from "./workDates";
const parseDate=(value:unknown):Date|null=>{
  if(!value)return null;
  if(value instanceof Date)return Number.isNaN(value.getTime())?null:value;
  const raw=String(value);
  const d=/^\d{4}-\d{2}-\d{2}$/.test(raw)?new Date(raw+"T12:00:00Z"):new Date(raw);
  return Number.isNaN(d.getTime())?null:d;
};
const dayDiff=(a:Date,b:Date)=>Math.round((Date.parse(calendarDay(a))-Date.parse(localDay(b)))/86400000);
const instantDayDiff=(a:Date,b:Date)=>Math.round((Date.parse(localDay(a))-Date.parse(localDay(b)))/86400000);

export const toDateInput=(value:unknown)=>{
  const d=parseDate(value);
  if(!d)return "";
  return calendarDay(d);
};

export const formatDate=(value:unknown,withTime=false)=>{
  const d=parseDate(value);
  if(!d)return "Vacío";
  return withTime
    ? d.toLocaleString("es-AR",{day:"numeric",month:"short",year:"numeric",timeZone:CRM_TIME_ZONE,hour:"2-digit",minute:"2-digit",hourCycle:"h23"})
    : d.toLocaleDateString("es-AR",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"});
};

/** Date and time of an instant in Argentina time ("20 oct 2026, 13:11"). */
export const formatDateTime=(value:unknown)=>formatDate(value,true);
/** Calendar day of an instant (timestamp) in Argentina time, so late-evening events do not jump to the next UTC day. For timestamps only: NOT for SQL DATE values (a Date at UTC midnight would show the previous day); use `formatDate` for those. */
export const formatDay=(value:unknown)=>{
  const d=parseDate(value);
  if(!d)return "Vacío";
  return d.toLocaleDateString("es-AR",{day:"numeric",month:"short",year:"numeric",timeZone:CRM_TIME_ZONE});
};
/** Clock time of an instant in Argentina time, 24 hours ("13:11"). */
export const formatTime=(value:unknown)=>{
  const d=parseDate(value);
  if(!d)return "Vacío";
  return d.toLocaleTimeString("es-AR",{timeZone:CRM_TIME_ZONE,hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
};
/** Plain-words distance from an instant (timestamp) to `now`, by Argentina calendar days ("hoy", "ayer", "hace 6 días"). NOT for SQL DATE values (a Date at UTC midnight is read as the previous Argentina day). */
export const relativeAgo=(value:unknown,now:Date=new Date())=>{
  const d=parseDate(value);
  if(!d)return "";
  const diff=instantDayDiff(d,now);
  if(diff===0)return "hoy";
  if(diff===-1)return "ayer";
  if(diff===1)return "mañana";
  return diff<0?`hace ${-diff} días`:`en ${diff} días`;
};
/** "Vencida ayer" / "Vencida hace N días" for a due calendar day (SQL DATE or YYYY-MM-DD) before today, otherwise null. Reads the value's UTC calendar day, so it is NOT for timestamps (use `relativeAgo`). */
export const overdueLabel=(value:unknown,now:Date=new Date())=>{
  const d=parseDate(value);
  if(!d)return null;
  const diff=dayDiff(d,now);
  if(diff>=0)return null;
  return diff===-1?"Vencida ayer":`Vencida hace ${-diff} días`;
};

export type NextActionTone="empty"|"overdue"|"today"|"soon"|"future";
export const nextActionInfo=(value:unknown)=>{
  const d=parseDate(value);
  if(!d)return {label:"Sin próxima acción",tone:"empty" as NextActionTone,title:"Sin fecha"};
  const diff=dayDiff(d,new Date());
  const dateLabel=d.toLocaleDateString("es-AR",{timeZone:"UTC",weekday:"short",day:"numeric",month:"short"});
  if(diff<0){
    return {label:overdueLabel(d)!,tone:"overdue" as NextActionTone,title:formatDate(d)};
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
// SQL DATE is a calendar day; postgres.js parses it at UTC midnight.
// Preserve that day instead of converting it to the browser's local time.
export const dateOnlyInput=(value:unknown)=>{
  if(value instanceof Date)return Number.isNaN(value.getTime())?"":value.toISOString().slice(0,10);
  const raw=String(value??"");
  return /^\d{4}-\d{2}-\d{2}/.test(raw)?raw.slice(0,10):"";
};
