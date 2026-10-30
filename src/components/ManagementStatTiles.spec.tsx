import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,describe,expect,it} from 'vitest';
import {ManagementStatTiles} from './ManagementStatTiles';
afterEach(cleanup);
describe('ManagementStatTiles',()=>{it('marks the active view and invokes the selected quick view',()=>{let selected='';render(<ManagementStatTiles stats={{total:10,pendientes:5,paraHoy:2,vencidos:1,misPendientesHoy:3,suscriptos:0}} active="today" onSelect={view=>{selected=view}}/>);expect(screen.getByRole('button',{name:/Gestiones con acción hoy/}).getAttribute('aria-pressed')).toBe('true');fireEvent.click(screen.getByRole('button',{name:/Gestiones abiertas/}));expect(selected).toBe('pending');});});
