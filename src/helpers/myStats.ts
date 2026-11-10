import {argentinaInstant,localDay} from './workDates';

/** Validates an inclusive Argentina calendar period, bounded to 366 days. */
export function validateMyStatsPeriod(from:string,to:string):{from:string;to:string;start:Date;end:Date}{
 const validDay=(value:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const date=new Date(`${value}T12:00:00Z`);return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;};
 if(!validDay(from)||!validDay(to))throw new Error('Elegí fechas válidas para el período.');
 const days=(Date.parse(`${to}T12:00:00Z`)-Date.parse(`${from}T12:00:00Z`))/86400000+1;
 if(from>to||days>366)throw new Error('El rango debe ser válido y no puede superar 366 días.');
 return {from,to,start:argentinaInstant(from+'T00:00'),end:argentinaInstant(addDays(to,1)+'T00:00')};
}
const addDays=(day:string,n:number)=>{const d=new Date(`${day}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
export type MyStatsSeriesPoint={period:string;contacts:number;won:number};
/** Builds a zero-filled Argentina day or Monday-week series from aggregate rows. */
export function buildMyStatsSeries(from:string,to:string,rows:MyStatsSeriesPoint[]):{granularity:'day'|'week';points:MyStatsSeriesPoint[]}{
 const range=validateMyStatsPeriod(from,to),granularity=(Date.parse(`${to}T12:00:00Z`)-Date.parse(`${from}T12:00:00Z`))/86400000+1>62?'week':'day';
 const keys:string[]=[];let current=from;
 if(granularity==='week'){const d=new Date(`${from}T12:00:00Z`),weekday=(d.getUTCDay()+6)%7;current=addDays(from,-weekday);}
 while(current<=to){keys.push(current);current=addDays(current,granularity==='day'?1:7);}
 const counts=new Map<string,MyStatsSeriesPoint>();
 for(const row of rows){const date=new Date(`${row.period}T12:00:00Z`);if(granularity==='week')date.setUTCDate(date.getUTCDate()-((date.getUTCDay()+6)%7));const key=granularity==='week'?date.toISOString().slice(0,10):row.period,prior=counts.get(key);counts.set(key,{period:key,contacts:(prior?.contacts??0)+row.contacts,won:(prior?.won??0)+row.won});}
 void range;
 return {granularity,points:keys.map(period=>{const found=counts.get(period);return {period,contacts:found?.contacts??0,won:found?.won??0};})};
}
/** Returns the close rate in percent, or null when no management closed. */
export function myStatsCloseRate(won:number,lost:number):number|null{return won+lost===0?null:Math.round(won/(won+lost)*1000)/10;}
/** Average visibility threshold for first-contact samples. */
export function myStatsFirstContactLabel(sampleCount:number):'few_data'|'available'{return sampleCount<3?'few_data':'available';}
/** Current Argentina calendar day. */
export function myStatsToday(now=new Date()):string{return localDay(now);}
