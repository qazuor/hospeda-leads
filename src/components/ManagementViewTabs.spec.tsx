import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {MantineProvider} from '@mantine/core';
import {ManagementViewTabs} from './ManagementViewTabs';
afterEach(cleanup);
beforeAll(()=>{window.matchMedia=vi.fn().mockImplementation((query:string)=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));});
describe('ManagementViewTabs',()=>{it('marks the active quick view and keeps saved view deletion available',()=>{let deleted='';render(<MantineProvider><ManagementViewTabs active="mine" savedViews={[{name:'Seguimiento'}]} onSelect={()=>{}} onDelete={name=>{deleted=name}} onSave={()=>{}}/></MantineProvider>);expect(screen.getByRole('button',{name:/Mis gestiones/}).getAttribute('aria-pressed')).toBe('true');fireEvent.click(screen.getByRole('button',{name:'Eliminar vista Seguimiento'}));expect(deleted).toBe('Seguimiento');});});
