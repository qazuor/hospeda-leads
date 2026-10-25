import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {useState} from 'react';
import {BusinessQuickFilters} from './BusinessQuickFilters';
import type {AdvancedFilterGroup} from '../endpoints/leads_GET.schema';

afterEach(cleanup);
beforeAll(()=>{window.matchMedia=vi.fn().mockImplementation((query:string)=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));});
const fields=[{key:'businessStatus',options:[{value:'new',label:'Nuevo'},{value:'reviewed',label:'Revisado'}]},{key:'assignedUserEmail',options:[{value:'a@example.com',label:'Yo'},{value:'b@example.com',label:'Beto'}]},{key:'ciudad',options:[{value:'Colón',label:'Colón'}]}];
function mount(groups:AdvancedFilterGroup[],onChange=vi.fn()){render(<MantineProvider><BusinessQuickFilters groups={groups} fields={fields} onChange={onChange}/></MantineProvider>);return onChange;}

describe('BusinessQuickFilters',()=>{
 it('writes two checked values as one OR group',async()=>{const change=vi.fn();function Controlled(){const [groups,setGroups]=useState<AdvancedFilterGroup[]>([]);return <BusinessQuickFilters groups={groups} fields={fields} onChange={next=>{change(next);setGroups(next)}}/>;}render(<MantineProvider><Controlled/></MantineProvider>);fireEvent.click(screen.getByRole('button',{name:'Estado'}));fireEvent.click(await screen.findByLabelText('Nuevo'));fireEvent.click(screen.getByLabelText('Revisado'));expect(change).toHaveBeenLastCalledWith([{rules:[{field:'businessStatus',operator:'eq',value:'new'},{field:'businessStatus',operator:'eq',value:'reviewed'}]}]);});
 it('clears the owned category group',async()=>{const change=mount([{rules:[{field:'businessStatus',operator:'eq',value:'new'}]}]);fireEvent.click(screen.getByRole('button',{name:/Estado/}));fireEvent.click(await screen.findByText('Limpiar'));expect(change).toHaveBeenLastCalledWith([]);});
 it('preserves a foreign group for the same field and points to the builder',async()=>{const foreign=[{rules:[{field:'businessStatus' as const,operator:'neq' as const,value:'new'}]}];const change=mount(foreign);fireEvent.click(screen.getByRole('button',{name:/Estado/}));expect(await screen.findByText(/regla avanzada/)).toBeTruthy();expect(change).not.toHaveBeenCalled();});
 it('switches date presets by replacing the owned group',async()=>{const change=mount([{rules:[{field:'fechaUltimoContacto',operator:'on',value:'2026-10-24'}]}]);fireEvent.click(screen.getByRole('button',{name:/Último contacto/}));fireEvent.click(await screen.findByRole('button',{name:'Ayer'}));await waitFor(()=>expect(change).toHaveBeenLastCalledWith([{rules:[{field:'fechaUltimoContacto',operator:'on',value:expect.any(String),value2:''}]}]));});
 it('falls back to the value when an option has no label instead of crashing',async()=>{
  // Arrange
  render(<MantineProvider><BusinessQuickFilters groups={[]} fields={[{key:'assignedUserEmail',options:[{value:'sin-nombre@example.com'} as {value:string;label?:string},{} as {value:string}]}]} onChange={vi.fn()}/></MantineProvider>);
  // Act
  fireEvent.click(screen.getByRole('button',{name:/Responsable/}));
  // Assert
  expect(await screen.findByText('sin-nombre@example.com')).toBeTruthy();
 });
 it('offers the fixed business statuses when the field definitions carry no options',async()=>{
  // Arrange
  render(<MantineProvider><BusinessQuickFilters groups={[]} fields={[{key:'businessStatus'}]} onChange={vi.fn()}/></MantineProvider>);
  // Act
  fireEvent.click(screen.getByRole('button',{name:/Estado/}));
  // Assert
  expect(await screen.findAllByRole('checkbox')).not.toHaveLength(0);
 });
});
