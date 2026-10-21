/** What Hoy says about the day: progress while work is left, "finished" only when nothing at all is left (tasks or contacts still waiting for "¿Cómo salió?"). */
export function dayProgress({overdue,today,done,waiting}:{overdue:number;today:number;done:number;waiting:number}):{kind:'finished'|'progress'|'none';done:number;total:number}{
 const left=overdue+today,total=done+left;
 if(!left&&!waiting&&done>0)return {kind:'finished',done,total};
 return {kind:total>0?'progress':'none',done,total};
}
