export const CRM_TIME_ZONE="America/Argentina/Buenos_Aires";
/** Calendar dates never depend on the browser/server time zone. */
export function localDay(value:Date=new Date()):string {
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:CRM_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value);
 const get=(key:string)=>parts.find(p=>p.type===key)!.value;
 return `${get('year')}-${get('month')}-${get('day')}`;
}
export function calendarDay(value:unknown):string {
 if(value instanceof Date)return value.toISOString().slice(0,10);
 return String(value??'').slice(0,10);
}
export function localDateTime(value:Date|string=new Date()):string {
 const date=new Date(value);
 const time=new Intl.DateTimeFormat('en-GB',{timeZone:CRM_TIME_ZONE,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);
 return `${localDay(date)}T${time}`;
}
// Local operation is explicitly Argentina, including historical timezone rules.
export function argentinaInstant(input:string):Date {
 const [day,time]=input.split('T');
 const guess=new Date(`${day}T${time}:00Z`);
 const offset=new Intl.DateTimeFormat('en-US',{timeZone:CRM_TIME_ZONE,timeZoneName:'longOffset'}).formatToParts(guess).find(p=>p.type==='timeZoneName')!.value.replace('GMT','')||'+00:00';
 return new Date(`${day}T${time}:00${offset}`);
}
export function taskBucket(dueDate:string,dueAt:Date|string|null,now=new Date()):'overdue'|'today'|'upcoming' {
 const today=localDay(now);
 if(dueDate<today||(dueAt&&new Date(dueAt)<now))return 'overdue';
 return dueDate===today?'today':'upcoming';
}
export function prettyInstant(value:Date|string){return new Date(value).toLocaleString('es-AR',{timeZone:CRM_TIME_ZONE,dateStyle:'medium',timeStyle:'short',hourCycle:'h23'});}
