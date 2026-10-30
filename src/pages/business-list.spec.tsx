import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

const tooltipRenders = vi.hoisted(() => ({ count: 0 }));
vi.mock('../components/Tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => { tooltipRenders.count++; return <>{children}</>; },
  TooltipTrigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) => <>{children}</>,
  TooltipContent: () => null,
  DisabledTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../components/InlineBusinessBadge',()=>({InlineBusinessBadge:({field}:{field:string})=><span data-testid={'editor-'+field}>{field}</span>}));
import { BusinessTableRow, dateCell, joinedValues } from './business-list';
import { businessCountsSummary } from '../components/BusinessCard';

beforeAll(() => {
  window.matchMedia = vi.fn().mockImplementation(query => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
});
afterEach(cleanup);

type RowProps = React.ComponentProps<typeof BusinessTableRow>;
const row = { id: '-7', accountId: '7', nombre: 'Hotel Río', telefono: '343 555', email: 'rio@example.test', canModify: true, opportunityCount: 0, contactCount: 1 } as unknown as RowProps['row'];
const columns = ['telefono', 'email'];
const pins = {};
const groups:RowProps['groups']=[];
const onToggle = vi.fn(), onOpen = vi.fn();
function Harness({ selected }: { tick: number; selected: boolean }) {
  return <MantineProvider><table><tbody><BusinessTableRow row={row} columns={columns} groups={groups} pins={pins} selected={selected} admin={false} users={undefined} onToggle={onToggle} onOpen={onOpen} /></tbody></table></MantineProvider>;
}

describe('BusinessTableRow', () => {
  it('skips re-rendering when the list re-renders with the same row props', () => {
    tooltipRenders.count = 0;
    const view = render(<Harness tick={1} selected={false} />);
    const initial = tooltipRenders.count;
    expect(initial).toBe(columns.length);
    view.rerender(<Harness tick={2} selected={false} />);
    expect(tooltipRenders.count).toBe(initial);
    view.rerender(<Harness tick={3} selected />);
    expect(tooltipRenders.count).toBe(initial * 2);
    expect((screen.getByRole('checkbox', { name: 'Seleccionar Hotel Río' }) as HTMLInputElement).checked).toBe(true);
  });
  it('renders configured member values stacked and keeps each inline editor',()=>{
    const groupedRow={...row,tipo:'Hospedaje',subtipo:'Cabañas',commercialProfile:'Consolidado',canModify:true,canModifyManagement:true};
    const group={id:'classification',name:'Tipo',members:['tipo','subtipo','commercialProfile']};
    render(<MantineProvider><table><tbody><BusinessTableRow row={groupedRow} columns={['group:classification']} groups={[group]} pins={{}} selected={false} admin={false} users={undefined} onToggle={onToggle} onOpen={onOpen}/></tbody></table></MantineProvider>);
    expect(screen.getByTestId('editor-tipo')).toBeTruthy();expect(screen.getByTestId('editor-subtipo')).toBeTruthy();expect(screen.getByTestId('editor-commercialProfile')).toBeTruthy();
    for(const label of ['Vertical','Subtipo','Perfil comercial'])expect(screen.getByText(label).className).toBeTruthy();
  });
  it('renders an empty member as a dash and keeps its inline editor available',()=>{
    const group={id:'classification',name:'Tipo',members:['tipo','subtipo','commercialProfile']};
    render(<MantineProvider><table><tbody><BusinessTableRow row={{...row,tipo:'Hospedaje',subtipo:null,commercialProfile:null,canModify:true,canModifyManagement:true}} columns={['group:classification']} groups={[group]} pins={{}} selected={false} admin={false} users={undefined} onToggle={onToggle} onOpen={onOpen}/></tbody></table></MantineProvider>);
    expect(screen.getByText('Subtipo').className).toBeTruthy();expect(screen.getByTestId('editor-subtipo')).toBeTruthy();expect(screen.getByTestId('editor-commercialProfile')).toBeTruthy();
  });
  it('keeps an empty group member visible as a dash when it is not editable',()=>{
    const group={id:'contact',name:'Contacto',members:['contactName','telefono']};
    render(<MantineProvider><table><tbody><BusinessTableRow row={{...row,contactName:'Ana',telefono:null,canModify:false}} columns={['group:contact']} groups={[group]} pins={{}} selected={false} admin={false} users={undefined} onToggle={onToggle} onOpen={onOpen}/></tbody></table></MantineProvider>);
    expect(screen.getByText('Persona de contacto')).toBeTruthy();expect(screen.getByText('Teléfono')).toBeTruthy();expect(screen.getByText('Ana')).toBeTruthy();expect(screen.getByText('—')).toBeTruthy();
  });
  it('limits table lines, opens every member in a permission-aware popover and returns focus on Escape',async()=>{
    const group={id:'classification',name:'Tipo',members:['tipo','subtipo','commercialProfile'],maxVisible:2};
    render(<MantineProvider><table><tbody><BusinessTableRow row={{...row,tipo:'Hospedaje',subtipo:'Cabañas',commercialProfile:'Consolidado',canModify:false,canModifyManagement:false}} columns={['group:classification']} groups={[group]} pins={{}} selected={false} admin={false} users={undefined} onToggle={onToggle} onOpen={onOpen}/></tbody></table></MantineProvider>);
    expect(screen.getByText('Vertical')).toBeTruthy();expect(screen.getByText('Subtipo')).toBeTruthy();expect(screen.queryByText('Perfil comercial')).toBeNull();
    const trigger=screen.getByRole('button',{name:'Ver los 1 datos más de Tipo'});expect(trigger.textContent).toBe('+1 más');trigger.focus();fireEvent.click(trigger);
    const content=await screen.findByLabelText('Datos de Tipo');expect(content.querySelector('[data-group-popover]')?.textContent).toContain('Perfil comercial');await waitFor(()=>expect(content.querySelector('[data-group-popover]')?.contains(document.activeElement)).toBe(true));expect(screen.queryByTestId('editor-commercialProfile')).toBeNull();
    fireEvent.keyDown(content,{key:'Escape'});await waitFor(()=>expect(screen.queryByLabelText('Datos de Tipo')).toBeNull());expect(document.activeElement).toBe(trigger);
  });
  it('shows all table members without a more button for Todos or a full line limit',()=>{
    const group={id:'classification',name:'Tipo',members:['tipo','subtipo','commercialProfile']};
    const view=render(<MantineProvider><table><tbody><BusinessTableRow row={row} columns={['group:classification']} groups={[group]} pins={{}} selected={false} admin={false} users={undefined} onToggle={onToggle} onOpen={onOpen}/></tbody></table></MantineProvider>);
    expect(screen.getByText('Perfil comercial')).toBeTruthy();expect(screen.queryByRole('button',{name:/Ver los/})).toBeNull();
    view.rerender(<MantineProvider><table><tbody><BusinessTableRow row={row} columns={['group:classification']} groups={[{...group,maxVisible:3}]} pins={{}} selected={false} admin={false} users={undefined} onToggle={onToggle} onOpen={onOpen}/></tbody></table></MantineProvider>);
    expect(screen.queryByRole('button',{name:/Ver los/})).toBeNull();
  });
  it('defines compact labels and single-line ellipsis for group values and editors',()=>{
    const css=readFileSync(resolve(__dirname,'../components/BusinessColumnGroupCell.module.css'),'utf8');
    expect(css).toMatch(/\.label\{[^}]*font-size:10px/);expect(css).toMatch(/\.label\{[^}]*white-space:nowrap[^}]*overflow:hidden[^}]*text-overflow:ellipsis/);
    expect(css).toMatch(/\.member>div\{[^}]*white-space:nowrap[^}]*overflow:hidden[^}]*text-overflow:ellipsis/);expect(css).toMatch(/\.more:focus-visible\{/);expect(css).toMatch(/\.popover\{[^}]*max-width:min\(340px,calc\(100vw - 24px\)\)/);
  });
});

describe('business list date and count helpers', () => {
  const utcMidnight = new Date('2026-11-01T00:00:00Z');
  it('shows DATE columns as the calendar day, not the Argentina instant', () => {
    expect(dateCell('fechaProximaAccion', utcMidnight)).toMatch(/^1 (de )?nov/i);
    expect(dateCell('createdAt', utcMidnight)).toMatch(/^31 (de )?oct/i);
  });
  it('joins multi-management DATE values with the calendar-day formatter', () => {
    expect(joinedValues('fechaUltimoContacto', [utcMidnight, utcMidnight])).toMatch(/^1 (de )?nov.* · 1 (de )?nov/i);
    expect(joinedValues('ciudad', ['Colón', 'Paraná'])).toBe('Colón · Paraná');
  });
  it('uses singular and plural forms in the counts summary', () => {
    expect(businessCountsSummary({ opportunityCount: 1, contactCount: 1, commercialStatus: 'client' })).toBe('1 gestión · 1 persona · Cliente');
    expect(businessCountsSummary({ opportunityCount: 2, contactCount: 3 })).toBe('2 gestiones · 3 personas · Potencial cliente');
    expect(businessCountsSummary({ opportunityCount: 0, contactCount: 0 })).toBe('Potencial cliente');
    expect(businessCountsSummary({ opportunityCount: 0, contactCount: 1 }, true)).toBe('0 gestiones · 1 persona · Potencial cliente');
  });
});
