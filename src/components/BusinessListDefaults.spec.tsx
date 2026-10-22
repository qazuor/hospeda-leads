import React from 'react';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {basePreferences,type TeamDefaults} from '../helpers/businessListPreferences';

const api=vi.hoisted(()=>({getDefaults:vi.fn(),saveDefaults:vi.fn(),getGroups:vi.fn()}));
vi.mock('../endpoints/business_list_defaults.schema',()=>({getBusinessListDefaults:api.getDefaults,saveBusinessListDefaults:api.saveDefaults}));
vi.mock('../endpoints/business_column_groups.schema',()=>({getBusinessColumnGroups:api.getGroups}));
vi.mock('./BusinessColumnGroupsEditor',()=>({BusinessColumnGroupsEditor:()=>null}));
import {BusinessListDefaults} from './BusinessListDefaults';

beforeAll(()=>{window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));});
afterEach(()=>{cleanup();vi.clearAllMocks();});

function defaults():TeamDefaults{
 const preferences=basePreferences();
 preferences.columns=[...preferences.columns,'group:contact'];
 preferences.widths['group:contact']=240;
 preferences.pins['group:contact']='left';
 preferences.sortBy='group:contact';
 const systemViewId='custom:00000000-0000-4000-8000-000000000001';
 return {preferences,presets:[],initialPresetId:null,systemViews:[{id:systemViewId,name:'Vista compartida',enabled:true,preferences}]};
}
function setup(){
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 render(<MantineProvider><QueryClientProvider client={client}><BusinessListDefaults/></QueryClientProvider></MantineProvider>);
}
function editPresentation(){fireEvent.change(screen.getByRole('combobox',{name:'Presentación inicial'}),{target:{value:'grid'}});}

const expectGroupPreferences=(saved:TeamDefaults)=>{
 expect(saved.preferences.columns).toContain('group:contact');
 expect(saved.preferences.widths['group:contact']).toBe(240);
 expect(saved.preferences.pins['group:contact']).toBe('left');
 expect(saved.preferences.sortBy).toBe('group:contact');
 const systemView=saved.systemViews?.find(view=>view.id==='custom:00000000-0000-4000-8000-000000000001');
 expect(systemView?.preferences).toMatchObject({columns:expect.arrayContaining(['group:contact']),widths:{'group:contact':240},pins:{'group:contact':'left'},sortBy:'group:contact'});
};

describe('BusinessListDefaults grouped column references',()=>{
 it('preserves group preferences while definitions are still loading and through edits and save',async()=>{
  let resolveGroups!:(value:{groups:[]})=>void;
  api.getDefaults.mockResolvedValue({defaults:defaults()});
  api.saveDefaults.mockResolvedValue({ok:true});
  api.getGroups.mockReturnValue(new Promise(resolve=>{resolveGroups=resolve;}));
  setup();
  expect((await screen.findByRole('status')).textContent).toContain('Las preferencias guardadas se conservan');
  editPresentation();
  fireEvent.click(screen.getByRole('button',{name:'Guardar configuraciones por defecto'}));
  await waitFor(()=>expect(api.saveDefaults).toHaveBeenCalled());
  expectGroupPreferences(api.saveDefaults.mock.calls[0][0] as TeamDefaults);
  resolveGroups({groups:[]});
 });

 it('shows an error when saving team defaults fails',async()=>{
  api.getDefaults.mockResolvedValue({defaults:defaults()});
  api.getGroups.mockResolvedValue({groups:[]});
  api.saveDefaults.mockRejectedValue(new Error('No se pudieron guardar los cambios'));
  setup();
  await screen.findByRole('combobox',{name:'Presentación inicial'});
  fireEvent.click(screen.getByRole('button',{name:'Guardar configuraciones por defecto'}));
  expect((await screen.findByRole('alert')).textContent).toContain('No se pudieron guardar los cambios');
 });

 it('preserves group preferences after definitions fail and makes retry and save available',async()=>{
  api.getDefaults.mockResolvedValue({defaults:defaults()});
  api.saveDefaults.mockResolvedValue({ok:true});
  api.getGroups.mockRejectedValue(new Error('No se pudo conectar'));
  setup();
  expect((await screen.findByRole('alert')).textContent).toContain('No pude cargar las definiciones de columnas agrupadas');
  expect(screen.getByRole('button',{name:'Reintentar definiciones'})).toBeTruthy();
  editPresentation();
  fireEvent.click(screen.getByRole('button',{name:'Guardar configuraciones por defecto'}));
  await waitFor(()=>expect(api.saveDefaults).toHaveBeenCalled());
  expectGroupPreferences(api.saveDefaults.mock.calls[0][0] as TeamDefaults);
 });
});
