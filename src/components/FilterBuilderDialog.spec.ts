import {describe,it,expect} from 'vitest';
import {PAST_DATE_FIELDS,RELATIVE_DATE_PRESETS,relativeDateRule} from './FilterBuilderDialog';
describe('relative date presets',()=>{
 it('offers 7 and 30 days as an inclusive between over Argentina days ending today',()=>{expect(RELATIVE_DATE_PRESETS.map(p=>p.label)).toEqual(['Últimos 7 días','Últimos 30 días']);const now=new Date('2026-10-08T01:00:00Z');const rule={field:'fechaUltimoContacto' as const,operator:'after' as const,value:'2026-01-01',value2:''};expect(relativeDateRule(rule,7,now)).toEqual({field:'fechaUltimoContacto',operator:'between',value:'2026-10-01',value2:'2026-10-07'});expect(relativeDateRule(rule,30,now)).toMatchObject({value:'2026-09-08',value2:'2026-10-07'});});
 it('are limited to past-date fields',()=>{expect(PAST_DATE_FIELDS).toEqual(['fechaUltimoContacto','fechaCreacion','createdAt','updatedAt']);expect(PAST_DATE_FIELDS).not.toContain('fechaProximaAccion');});
});
