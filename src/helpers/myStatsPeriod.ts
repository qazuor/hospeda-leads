import {localDay} from './workDates';

/** Supported statistics period selections. */
export type StatsPreset='today'|'week'|'month'|'range';
/** Resolved calendar bounds and validation state for a statistics period. */
export type StatsPeriod={preset:StatsPreset;from:string;to:string;valid:boolean;message:string|null};
const addDays=(day:string,amount:number)=>{const value=new Date(`${day}T12:00:00Z`);value.setUTCDate(value.getUTCDate()+amount);return value.toISOString().slice(0,10)};
const validDay=(value:string|null)=>!!value&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(`${value}T00:00:00Z`))&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
/** Resolves a preset using Argentina calendar days. */
export function presetPeriod(preset:Exclude<StatsPreset,'range'>,now=new Date()):StatsPeriod{
 const to=localDay(now),monthStart=`${to.slice(0,7)}-01`;
 if(preset==='today')return {preset,from:to,to,valid:true,message:null};
 if(preset==='week'){const weekday=new Date(`${to}T12:00:00Z`).getUTCDay();return {preset,from:addDays(to,-((weekday+6)%7)),to,valid:true,message:null};}
 return {preset,from:monthStart,to,valid:true,message:null};
}
/** Parses the page query string; malformed values safely use the current month. */
export function parseStatsPeriod(params:URLSearchParams,now=new Date()):StatsPeriod{
 const period=params.get('period');
 if(period==='today'||period==='week'||period==='month')return presetPeriod(period,now);
 if(params.has('from')||params.has('to')){
  const from=params.get('from')??'',to=params.get('to')??'';
  if(!validDay(from)||!validDay(to))return presetPeriod('month',now);
  if(from>to)return {preset:'range',from,to,valid:false,message:'La fecha inicial debe ser anterior o igual a la final.'};
  const days=(Date.parse(`${to}T00:00:00Z`)-Date.parse(`${from}T00:00:00Z`))/86400000+1;
  if(days>366)return {preset:'range',from,to,valid:false,message:'El rango no puede superar los 366 días.'};
  return {preset:'range',from,to,valid:true,message:null};
 }
 return presetPeriod('month',now);
}
/** Serializes presets and custom ranges for shareable page URLs. */
export function serializeStatsPeriod(period:StatsPeriod):string{
 return period.preset==='range'?new URLSearchParams({from:period.from,to:period.to}).toString():new URLSearchParams({period:period.preset}).toString();
}
/** Validates a custom range and returns the inline error when it cannot be requested. */
export function validateStatsRange(from:string,to:string):string|null{
 if(!validDay(from)||!validDay(to))return 'Elegí las dos fechas del rango.';
 if(from>to)return 'La fecha inicial debe ser anterior o igual a la final.';
 if((Date.parse(`${to}T00:00:00Z`)-Date.parse(`${from}T00:00:00Z`))/86400000+1>366)return 'El rango no puede superar los 366 días.';
 return null;
}
