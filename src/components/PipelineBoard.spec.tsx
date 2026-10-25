import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const pipeline = vi.hoisted(() => ({
  stages: [{ name: 'main:contact', displayName: 'main:contact', active: true, classification: 'open', managementType: 'main' }],
  insights: [{ id: 1, canModify: true, pendingFollowup: false, stageSince: null }],
  users: [{ email: 'ana@example.com', displayName: 'Ana' }, { email: 'bea@example.com', displayName: 'bea@example.com' }],
}));
vi.mock('../endpoints/pipeline.schema', () => ({ getPipeline: vi.fn(async () => pipeline), postPipeline: vi.fn() }));
vi.mock('../helpers/useAuth', () => ({ useAuth: () => ({ authState: { type: 'authenticated', user: { role: 'seller', email: 'ana@example.com' } } }) }));
import { PipelineBoard } from './Pipeline';

beforeAll(() => {
  window.matchMedia = vi.fn().mockImplementation(query => ({ matches: query==='(max-width: 700px)'&&window.innerWidth<=700, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
});
afterEach(() => { cleanup(); pipeline.insights = [{ id: 1, canModify: true, pendingFollowup: false, stageSince: null }]; });

const lead = (extra: Record<string, unknown> = {}) => ({ id: 1, accountId: 9, nombre: 'Hotel Sol', estado: 'main:contact', managementType: 'main', assignedUserEmail: 'ana@example.com', prioridad: null, tipo: 'Hotel', opportunityName: 'Alta', ...extra }) as never;
const renderBoard = (props: Partial<React.ComponentProps<typeof PipelineBoard>> = {}) => render(
  <MantineProvider><QueryClientProvider client={new QueryClient()}><MemoryRouter><PipelineBoard leads={[lead()]} onOpen={() => {}} {...props} /></MemoryRouter></QueryClientProvider></MantineProvider>,
);

describe('PipelineBoard', () => {
  it('shows server totals, the truncation banner and no raw keys or emails on cards', async () => {
    renderBoard({ boardTotals: { open: 700, won: 3, lost: 2, total: 705, groups: [{ estado: 'main:contact', managementType: 'main', count: 700 }] }, truncated: true });
    expect(await screen.findByText('700')).toBeTruthy();
    expect(screen.getByText('Mostrando 1 de 700')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Mostramos las primeras 1 de 705. Filtrá para ver el resto.');
    expect(screen.queryByText('main:contact')).toBeNull();
    expect(screen.queryByText(/example\.com/)).toBeNull();
  });
  it('shows the priority line only when a priority is set', async () => {
    renderBoard({ leads: [lead({ prioridad: 'alta' })] });
    expect(await screen.findByText('Prioridad manual: alta')).toBeTruthy();
    cleanup();
    renderBoard();
    await screen.findByText('Hotel Sol');
    expect(screen.queryByText(/Prioridad/)).toBeNull();
  });
  it('never shows an email for an unresolved responsible or in the disabled reason', async () => {
    pipeline.insights = [{ id: 1, canModify: false, pendingFollowup: false, stageSince: null }];
    renderBoard({ leads: [lead({ assignedUserEmail: 'ghost@example.com' })] });
    await screen.findByText('Hotel Sol');
    expect(screen.getByText('Otra persona del equipo')).toBeTruthy();
    expect(screen.getByRole('article').textContent).not.toMatch(/@/);
    fireEvent.focus(screen.getByRole('button', { name: 'Cambiar etapa' }).parentElement as HTMLElement);
    const reason = await screen.findByText(/Solo .* puede cambiar la etapa/);
    expect(reason.textContent).toBe('Solo Otra persona del equipo o un administrador puede cambiar la etapa.');
  });
  it('reduces the server groups for the team-stages view', async () => {
    renderBoard({ boardTotals: { open: 700, won: 0, lost: 0, total: 700, groups: [{ estado: 'main:contact', managementType: 'main', count: 700 }] } });
    fireEvent.click(await screen.findByText('Ver etapas del equipo'));
    expect((await screen.findAllByText('700')).length).toBeGreaterThan(0);
  });
  it('renders default expanded mobile sections and toggles the accordion', async()=>{
    Object.defineProperty(window,'innerWidth',{configurable:true,value:390});renderBoard();await screen.findByText('Hotel Sol');const open=screen.getByRole('button',{name:/Abierta/});expect(open.getAttribute('aria-expanded')).toBe('true');fireEvent.click(open);expect(open.getAttribute('aria-expanded')).toBe('false');expect(screen.getByRole('button',{name:/Ganada/}).getAttribute('aria-expanded')).toBe('false');Object.defineProperty(window,'innerWidth',{configurable:true,value:1024});
  });
  it('opens a preview from card body and keyboard but not its name or stage action, then restores focus on Escape',async()=>{
    pipeline.insights=[{id:1,canModify:false,pendingFollowup:true,stageSince:null}];const onOpen=vi.fn();renderBoard({onOpen});const card=await screen.findByRole('article',{name:'Alta · Hotel Sol'});fireEvent.click(screen.getByRole('button',{name:'Alta'}));expect(onOpen).toHaveBeenCalledTimes(1);expect(screen.queryByRole('dialog')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Cambiar etapa'}));expect(screen.queryByRole('dialog')).toBeNull();fireEvent.click(card);const dialog=await screen.findByRole('dialog',{name:'Alta'});expect(dialog).toBeTruthy();expect(screen.getByRole('button',{name:'Abrir gestión'})).toBeTruthy();fireEvent.keyDown(dialog,{key:'Escape'});await waitFor(()=>expect(document.activeElement).toBe(card));
    fireEvent.keyDown(card,{key:'Enter'});expect(await screen.findByRole('dialog',{name:'Alta'})).toBeTruthy();
  });
  it('closes the preview when the management leaves the list after a refetch',async()=>{
    const client=new QueryClient();const tree=(leads:never[])=><MantineProvider><QueryClientProvider client={client}><MemoryRouter><PipelineBoard leads={leads} onOpen={()=>{}}/></MemoryRouter></QueryClientProvider></MantineProvider>;
    const {rerender}=render(tree([lead()]));fireEvent.click(await screen.findByRole('article',{name:'Alta · Hotel Sol'}));expect(await screen.findByRole('dialog',{name:'Alta'})).toBeTruthy();
    rerender(tree([lead({id:2,opportunityName:'Otra'})]));await waitFor(()=>expect(screen.queryByRole('dialog',{name:'Alta'})).toBeNull());
  });
});
