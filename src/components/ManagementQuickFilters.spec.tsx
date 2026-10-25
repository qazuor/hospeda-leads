import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {ManagementQuickFilters,nextStepPreset} from './ManagementQuickFilters';
import {BusinessQuickFilters} from './BusinessQuickFilters';
import {CURRENT_USER_FILTER_VALUE} from '../helpers/filterRules';
import type {AdvancedFilterGroup} from '../endpoints/leads_GET.schema';

afterEach(cleanup);
beforeAll(()=>{window.matchMedia=vi.fn().mockImplementation((query:string)=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));});
// 25/10/2026 01:30 Argentina (a Sunday) is still 25/10 locally although it is 04:30Z.
const sunday=new Date('2026-10-25T04:30:00Z'),wednesday=new Date('2026-10-21T15:00:00Z');

describe('nextStepPreset',()=>{
 it('uses the Argentina calendar day for overdue and today',()=>{
  expect(nextStepPreset('overdue',sunday)).toEqual([{field:'fechaProximaAccion',operator:'before',value:'2026-10-25',value2:''}]);
  expect(nextStepPreset('today',new Date('2026-10-26T02:00:00Z'))[0]).toMatchObject({operator:'on',value:'2026-10-25'});
 });
 it('runs «Esta semana» from today to Sunday and «Próximos 7 días» over seven days',()=>{
  expect(nextStepPreset('week',wednesday)[0]).toMatchObject({operator:'between',value:'2026-10-21',value2:'2026-10-25'});
  expect(nextStepPreset('week',sunday)[0]).toMatchObject({value:'2026-10-25',value2:'2026-10-25'});
  expect(nextStepPreset('7days',wednesday)[0]).toMatchObject({value:'2026-10-21',value2:'2026-10-27'});
  expect(nextStepPreset('none',wednesday)[0]).toMatchObject({operator:'empty'});
 });
});

describe('ManagementQuickFilters',()=>{
 const mount=(groups:AdvancedFilterGroup[],onChange=vi.fn())=>{render(<MantineProvider><ManagementQuickFilters groups={groups} stages={[{value:'main:contact',label:'Por contactar'}]} users={[{email:'ana@example.com',displayName:'Ana'},{email:'',displayName:'Sin email'}]} currentUser onChange={onChange}/></MantineProvider>);return onChange;};
 it('offers «Yo» and skips users without email in Responsable',async()=>{
  mount([]);
  fireEvent.click(screen.getByRole('button',{name:/Responsable/}));
  expect(await screen.findByText('Yo')).toBeTruthy();expect(screen.getByText('Ana')).toBeTruthy();expect(screen.queryByText('Sin email')).toBeNull();
 });
 it('replaces its own overdue rule instead of stacking another group',async()=>{
  const onChange=mount([{rules:[{field:'fechaProximaAccion',operator:'before',value:'2026-01-01',value2:''}]}]);
  fireEvent.click(screen.getByRole('button',{name:/Próximo paso/}));fireEvent.click(await screen.findByRole('button',{name:'Hoy'}));
  const next=onChange.mock.calls[0]![0] as AdvancedFilterGroup[];
  expect(next).toHaveLength(1);expect(next[0]!.rules[0]).toMatchObject({operator:'on'});
 });
 it('writes «Yo» as the current-user value',async()=>{
  const onChange=mount([]);
  fireEvent.click(screen.getByRole('button',{name:/Responsable/}));fireEvent.click(await screen.findByRole('checkbox',{name:'Yo'}));
  expect(onChange).toHaveBeenCalledWith([{rules:[{field:'assignedUserEmail',operator:'eq',value:CURRENT_USER_FILTER_VALUE}]}]);
 });
});

describe('ManagementQuickFilters applied values outside the catalog',()=>{
 it('shows a value applied by a tile even if it is not a stage option',async()=>{
  render(<MantineProvider><ManagementQuickFilters groups={[{rules:[{field:'estado',operator:'eq',value:'Suscripto'}]}]} stages={[{value:'main:contact',label:'Por contactar'}]} users={[]} onChange={vi.fn()}/></MantineProvider>);
  fireEvent.click(screen.getByRole('button',{name:/Etapa/}));
  expect(((await screen.findByRole('checkbox',{name:'Suscripto'})) as HTMLInputElement).checked).toBe(true);
 });
});

describe('BusinessQuickFilters ownership after the generalisation',()=>{
 it('keeps a builder «before» rule on Último contacto as foreign',async()=>{
  const onChange=vi.fn();
  render(<MantineProvider><BusinessQuickFilters groups={[{rules:[{field:'fechaUltimoContacto',operator:'before',value:'2026-01-01',value2:''}]}]} fields={[]} onChange={onChange}/></MantineProvider>);
  fireEvent.click(screen.getByRole('button',{name:/Último contacto/}));
  expect(await screen.findByText(/Editala en «Filtrar negocios»/)).toBeTruthy();
  expect(screen.queryByRole('button',{name:'Hoy'})).toBeNull();
 });
});
