import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const pipeline = vi.hoisted(() => ({
  stages: [{ name: 'main:contact', displayName: 'main:contact', active: true, classification: 'open', managementType: 'main' }],
  insights: [{ id: 1, canModify: true, pendingFollowup: false, stageSince: null }],
  users: [{ email: 'ana@example.com', displayName: 'Ana' }],
}));
vi.mock('../endpoints/pipeline.schema', () => ({ getPipeline: vi.fn(async () => pipeline), postPipeline: vi.fn() }));
vi.mock('../helpers/useAuth', () => ({ useAuth: () => ({ authState: { type: 'authenticated', user: { role: 'seller', email: 'ana@example.com' } } }) }));
import { PipelineBoard } from './Pipeline';

beforeAll(() => {
  window.matchMedia = vi.fn().mockImplementation(query => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
});
afterEach(cleanup);

const lead = (extra: Record<string, unknown> = {}) => ({ id: 1, accountId: 9, nombre: 'Hotel Sol', estado: 'main:contact', managementType: 'main', assignedUserEmail: 'ana@example.com', prioridad: null, tipo: 'Hotel', opportunityName: 'Alta', ...extra }) as never;
const renderBoard = (props: Partial<React.ComponentProps<typeof PipelineBoard>> = {}) => render(
  <MantineProvider><QueryClientProvider client={new QueryClient()}><MemoryRouter><PipelineBoard leads={[lead()]} onOpen={() => {}} {...props} /></MemoryRouter></QueryClientProvider></MantineProvider>,
);

describe('PipelineBoard', () => {
  it('shows server totals, the truncation banner and no raw keys or emails on cards', async () => {
    renderBoard({ boardTotals: { open: 700, won: 3, lost: 2, total: 705 }, truncated: true });
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
});
