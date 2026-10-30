import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {BusinessColumnGroupsEditor} from './BusinessColumnGroupsEditor';
import {DEFAULT_BUSINESS_COLUMN_GROUPS} from '../helpers/businessColumnGroups';

const api=vi.hoisted(()=>({get:vi.fn(),save:vi.fn()}));
vi.mock('../endpoints/business_column_groups.schema',()=>({getBusinessColumnGroups:api.get,saveBusinessColumnGroups:api.save}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
beforeAll(()=>{window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));});

function setup(){const client=new QueryClient({defaultOptions:{queries:{retry:false}}});return render(<MantineProvider><QueryClientProvider client={client}><BusinessColumnGroupsEditor/></QueryClientProvider></MantineProvider>);}

describe('BusinessColumnGroupsEditor visible line setting',()=>{
 it('sets and clears a line limit with Todos',async()=>{
  api.get.mockResolvedValue({groups:structuredClone(DEFAULT_BUSINESS_COLUMN_GROUPS)});api.save.mockResolvedValue({ok:true});setup();
  const limit=await screen.findByRole('combobox',{name:'Líneas visibles de Tipo'});fireEvent.change(limit,{target:{value:'2'}});
  fireEvent.click(screen.getByRole('button',{name:'Guardar columnas agrupadas'}));await waitFor(()=>expect(api.save).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({id:'classification',maxVisible:2})])));
  fireEvent.change(screen.getByRole('combobox',{name:'Líneas visibles de Tipo'}),{target:{value:'all'}});
  fireEvent.click(screen.getByRole('button',{name:'Guardar columnas agrupadas'}));await waitFor(()=>expect(api.save).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({id:'classification',maxVisible:undefined})])));
 });
});
