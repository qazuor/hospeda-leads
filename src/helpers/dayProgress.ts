/** What Hoy says about the day: progress while work is left, "finished" only when nothing at all is left (tasks or contacts still waiting for "¿Cómo salió?"). */
export function dayProgress({overdue,today,done,waiting}:{overdue:number;today:number;done:number;waiting:number}):{kind:'finished'|'progress'|'none';done:number;total:number}{
 const left=overdue+today,total=done+left;
 if(!left&&!waiting&&done>0)return {kind:'finished',done,total};
 return {kind:total>0?'progress':'none',done,total};
}
/**
 * What Hoy says when a bucket passes the server cap (work.ts URGENT_CAP): tasks are sorted by date and time, so the oldest
 * overdue (and the earliest of today) stay and the rest are hidden. Hoy has no other full list, so it points to the filters.
 */
export function urgentCapNotice({overdue,today,cap,admin}:{overdue:number;today:number;cap:number;admin:boolean}):string[]{
 const lines=[];
 if(overdue>cap)lines.push(`Vencidas: ves las ${cap} más antiguas de ${overdue}. ${overdue-cap===1?'La más reciente no aparece':`Las ${overdue-cap} más recientes no aparecen`} en esta lista.`);
 if(today>cap)lines.push(`Para hoy: ves las ${cap} primeras según el horario, de ${today}. ${today-cap===1?'La otra no aparece':`Las otras ${today-cap} no aparecen`} en esta lista.`);
 if(lines.length)lines.push(`Para verlas, filtrá por ${admin?'responsable, localidad o rubro':'localidad o rubro'} en «Filtros de trabajo», o completá o reprogramá las más antiguas.`);
 return lines;
}
