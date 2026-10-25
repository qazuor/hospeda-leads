import {describe,expect,it} from 'vitest';
import {groupBusinessRows,lastContactHealth,lastContactPreset,setOwnedQuickFilter} from './businessListQuickFilters';
import type {AdvancedFilterGroup} from '../endpoints/leads_GET.schema';

describe('business list quick filters',()=>{
 it('adds and removes only its owned equality group, keeping foreign groups and exclusions',()=>{
  const foreign:AdvancedFilterGroup[]=[{rules:[{field:'ciudad',operator:'eq',value:'Colón'}]},{rules:[{field:'assignedUserEmail',operator:'neq',value:'a@b.com'}]}];
  const next=setOwnedQuickFilter(foreign,'businessStatus',[{field:'businessStatus',operator:'eq',value:'new'},{field:'businessStatus',operator:'eq',value:'reviewed'}]);
  expect(next).toHaveLength(3);expect(next[2]?.rules).toHaveLength(2);expect(setOwnedQuickFilter(next,'businessStatus',[])).toEqual(foreign);
 });
 it('does not merge multiple equality groups on the same field',()=>{const groups:AdvancedFilterGroup[]=[{rules:[{field:'ciudad',operator:'eq',value:'A'}]},{rules:[{field:'ciudad',operator:'eq',value:'B'}]}];expect(setOwnedQuickFilter(groups,'ciudad',[{field:'ciudad',operator:'eq',value:'C'}])).toEqual(groups);});
 it('replaces owned last-contact presets without touching other groups',()=>{
  const foreign:AdvancedFilterGroup[]=[{rules:[{field:'fechaUltimoContacto',operator:'gte',value:'2026-01-01'}]},{rules:[{field:'ciudad',operator:'neq',value:'Paraná'}]}];
  const preset=(value:string):AdvancedFilterGroup=>({rules:[{field:'fechaUltimoContacto',operator:'on',value}]});
  const first=setOwnedQuickFilter(foreign,'fechaUltimoContacto',preset('2026-10-24').rules);
  expect(setOwnedQuickFilter(first,'fechaUltimoContacto',preset('2026-10-23').rules)).toEqual([...foreign,preset('2026-10-23')]);
  const owned=setOwnedQuickFilter([], 'fechaUltimoContacto',[{field:'fechaUltimoContacto',operator:'empty',value:''}]);
  expect(setOwnedQuickFilter(owned,'fechaUltimoContacto',[])).toEqual([]);
 });
 it('uses Argentina calendar dates for date presets at UTC midnight',()=>{
  const now=new Date('2026-10-25T02:30:00.000Z');
  expect(lastContactPreset('today',now)[0]?.value).toBe('2026-10-24');
  expect(lastContactPreset('yesterday',now)[0]?.value).toBe('2026-10-23');
  expect(lastContactPreset('week',now)[0]).toMatchObject({value:'2026-10-19',value2:'2026-10-24'});
  expect(lastContactPreset('7days',now)[0]).toMatchObject({value:'2026-10-18',value2:'2026-10-24'});
  expect(lastContactPreset('30days',now)[0]).toMatchObject({value:'2026-09-25',value2:'2026-10-24'});
  expect(lastContactPreset('never',now)[0]?.operator).toBe('empty');
 });
 it('maps health thresholds and groups rows by Argentina due day without reordering',()=>{
  const now=new Date('2026-10-25T02:30:00.000Z');
  expect(lastContactHealth(null,now)).toBe('slate');expect(lastContactHealth('2026-10-17',now)).toBe('green');expect(lastContactHealth('2026-09-23',now)).toBe('red');expect(lastContactHealth('2026-09-24',now)).toBe('orange');
  const rows=[{id:1,fechaProximaAccion:'2026-10-26'},{id:2,fechaProximaAccion:'2026-10-23'},{id:3,fechaProximaAccion:null},{id:4,fechaProximaAccion:'2026-10-24'}];
  expect(groupBusinessRows(rows,now).map(group=>[group.label,group.rows.map(row=>row.id)])).toEqual([['Vencidos',[2]],['Hoy',[4]],['Próximos',[1]],['Sin próximo paso',[3]]]);
 });
 it('converts Date instants to Argentina calendar days for next steps',()=>{
  const rows=[{id:1,fechaProximaAccion:new Date('2026-10-25T00:00:00Z')}];
  expect(groupBusinessRows(rows,new Date('2026-10-25T18:00:00.000Z'))).toEqual([{label:'Hoy',rows}]);
 });
});
