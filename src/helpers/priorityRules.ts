import type {PriorityRule,PrioritySuggestion} from '../endpoints/pipeline.schema';
export interface PriorityFacts {stage:string|null;classification:string;pending:boolean;nextDay:string|null;lastContactDay:string|null;closeDay:string|null}
const rank={baja:1,media:2,alta:3};
const daysBetween=(from:string,to:string)=>Math.floor((Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000);
/** No clock or DB inside the evaluator: pass Argentina's calendar day explicitly. */
export function suggestPriority(rules:PriorityRule[],facts:PriorityFacts,today:string):PrioritySuggestion{
 if(facts.classification!=='open')return {priority:null,factors:[]};
 const factors=rules.filter(r=>r.active&&(!r.stages.length||r.stages.includes(facts.stage??''))).filter(r=>{
  switch(r.factor){
   case 'overdue':return !!facts.nextDay&&facts.nextDay<today;
   case 'missing_followup':return !facts.pending;
   case 'stage':return !!facts.stage&&r.stages.includes(facts.stage);
   case 'stale_contact':return !!facts.lastContactDay&&daysBetween(facts.lastContactDay,today)>=r.days;
   case 'close_soon':return !!facts.closeDay&&daysBetween(today,facts.closeDay)>=0&&daysBetween(today,facts.closeDay)<=r.days;
  }
 }).map(r=>({id:r.id,name:r.name,priority:r.priority}));
 const priority=factors.reduce<PrioritySuggestion['priority']>((p,f)=>!p||rank[f.priority]>rank[p]?f.priority:p,null);
 return {priority,factors};
}
