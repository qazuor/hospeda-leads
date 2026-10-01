import {describe,it,expect} from 'vitest';
import {suggestPriority,type PriorityFacts} from './priorityRules';
import type {PriorityRule} from '../endpoints/pipeline.schema';
const facts:PriorityFacts={stage:'En tratativas',classification:'open',pending:false,nextDay:null,lastContactDay:null,closeDay:null};
const rule=(factor:PriorityRule['factor'],priority:PriorityRule['priority']='media',days=7,stages:string[]=[]):PriorityRule=>({id:factor,name:factor,factor,priority,days,stages,active:true});
describe('Prioridad transparente',()=>{
 it('usa todas las razones aplicables y la prioridad más alta, sin mutar la entrada',()=>{const input={...facts,nextDay:'2026-09-30',pending:true};const rules=[rule('overdue','alta'),rule('missing_followup'),rule('stage','baja',0,['En tratativas'])];expect(suggestPriority(rules,input,'2026-10-01')).toEqual({priority:'alta',factors:[{id:'overdue',name:'overdue',priority:'alta'},{id:'stage',name:'stage',priority:'baja'}]});expect(input.pending).toBe(true);});
 it('no inventa antigüedad para fechas incompletas',()=>expect(suggestPriority([rule('stale_contact'),rule('close_soon')],facts,'2026-10-01')).toEqual({priority:null,factors:[]}));
 it('respeta días límite, etapas y reglas desactivadas',()=>{const rules=[rule('stale_contact','alta',30),rule('close_soon','media',7),{...rule('missing_followup'),active:false}];expect(suggestPriority(rules,{...facts,lastContactDay:'2026-09-01',closeDay:'2026-10-08'},'2026-10-01').factors).toHaveLength(2);expect(suggestPriority(rules,{...facts,lastContactDay:'2026-09-02',closeDay:'2026-10-09'},'2026-10-01').priority).toBeNull();expect(suggestPriority([rule('stage','alta',0,['Cargado'])],facts,'2026-10-01').priority).toBeNull();});
 it.each(['won','lost'])('no sugiere prioridad para %s',classification=>expect(suggestPriority([rule('missing_followup')],{...facts,classification},'2026-10-01').priority).toBeNull());
 it('vencimiento sin hora exige día anterior; cierre pasado no es inminente',()=>{expect(suggestPriority([rule('overdue')],{...facts,nextDay:'2026-10-01'},'2026-10-01').priority).toBeNull();expect(suggestPriority([rule('close_soon')],{...facts,closeDay:'2026-09-30'},'2026-10-01').priority).toBeNull();});
});
