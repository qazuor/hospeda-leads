import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({
  role: 'user',
  pipeline: {
    stages: [
      { name: 'main:contact', displayName: null, active: true, classification: 'open', managementType: 'main' },
      { name: 'main:lost', displayName: null, active: true, classification: 'lost', managementType: 'main' },
    ],
    insights: [{ id: '1', estado: 'main:contact', canModify: true }],
    managementReasons: [], users: [], events: [],
  },
}));
vi.mock('../endpoints/pipeline.schema', () => ({ getPipeline: vi.fn(async () => state.pipeline), postPipeline: vi.fn() }));
vi.mock('../helpers/useAuth', () => ({ useAuth: () => ({ authState: { type: 'authenticated', user: { role: state.role, email: 'ana@example.com' } } }) }));
import { StageBadgeButton } from './Pipeline';

beforeAll(() => {
  window.matchMedia = vi.fn().mockImplementation(query => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
});
afterEach(() => { cleanup(); state.role = 'user'; state.pipeline.insights = [{ id: '1', estado: 'main:contact', canModify: true }]; });

const lead = { id: '1', accountId: '9', estado: 'main:contact', managementType: 'main' } as never;
const renderBadge = (readOnly = false) => render(
  <MantineProvider><QueryClientProvider client={new QueryClient()}><MemoryRouter><StageBadgeButton lead={lead} readOnly={readOnly} /></MemoryRouter></QueryClientProvider></MantineProvider>,
);

describe('StageBadgeButton', () => {
  it('is a button that names the stage when the user may change it', async () => {
    renderBadge();
    expect(await screen.findByRole('button', { name: /^Etapa: Por contactar/ })).toBeTruthy();
  });
  it('is a plain badge when the server says the user cannot modify the management', async () => {
    state.pipeline.insights = [{ id: '1', estado: 'main:contact', canModify: false }];
    renderBadge();
    expect(await screen.findByText('Por contactar')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('is a plain badge in read-only mode', async () => {
    renderBadge(true);
    expect(await screen.findByText('Por contactar')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('shows the closed-management notice as visible text to a seller', async () => {
    state.pipeline.insights = [{ id: '1', estado: 'main:lost', canModify: true }];
    renderBadge();
    expect(await screen.findByText('Cerrada. Para reabrirla pedíselo a un administrador.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('lets an admin open the dialog on a closed management', async () => {
    state.role = 'admin';
    state.pipeline.insights = [{ id: '1', estado: 'main:lost', canModify: true }];
    renderBadge();
    expect(await screen.findByRole('button', { name: /^Etapa: Cerrada perdida/ })).toBeTruthy();
  });
});
