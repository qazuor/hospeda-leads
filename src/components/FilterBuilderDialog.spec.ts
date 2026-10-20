import {describe,it,expect} from 'vitest';
import {RELATIVE_DATE_PRESETS,relativeDateRule} from './FilterBuilderDialog';
describe('relative date presets',()=>{
 it('offers 7 and 30 days and writes an after rule on the Argentina calendar day',()=>{expect(RELATIVE_DATE_PRESETS.map(p=>p.label)).toEqual(['Últimos 7 días','Últimos 30 días']);const now=new Date('2026-10-08T01:00:00Z');const rule={field:'fechaUltimoContacto' as const,operator:'between' as const,value:'2026-01-01',value2:'2026-02-01'};expect(relativeDateRule(rule,7,now)).toEqual({field:'fechaUltimoContacto',operator:'after',value:'2026-09-30',value2:''});expect(relativeDateRule(rule,30,now).value).toBe('2026-09-07');});
});
