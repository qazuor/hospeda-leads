import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../helpers/useAuth', () => ({ useAuth: () => ({ authState: { type: 'authenticated', user: { id: 3, email: 'owner@example.com', role: 'user' } } }) }));
import { BusinessRowActions } from './BusinessRowActions';

beforeAll(() => {
  window.matchMedia = vi.fn().mockImplementation(query => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

function renderActions({ admin, canModify }: { admin: boolean; canModify: boolean }) {
  return render(<MantineProvider><QueryClientProvider client={new QueryClient()}><MemoryRouter><BusinessRowActions accountId="1" name="Hotel Río" canModify={canModify} admin={admin} onOpen={vi.fn()} /></MemoryRouter></QueryClientProvider></MantineProvider>);
}
const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Más acciones de Hotel Río' }));

describe('BusinessRowActions', () => {
  it('shows Abrir and Contactar as text buttons plus a menu', () => {
    renderActions({ admin: false, canModify: true });
    expect(screen.getByRole('button', { name: 'Abrir' }).textContent).toContain('Abrir');
    expect(screen.getByRole('button', { name: 'Contactar' }).textContent).toContain('Contactar');
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });
  it('does not render Archivar for sellers and keeps Papelera in the menu', async () => {
    renderActions({ admin: false, canModify: true });
    openMenu();
    expect(await screen.findByRole('menuitem', { name: /Enviar a Papelera/ })).toBeTruthy();
    expect(screen.queryByText(/Archivar negocio/)).toBeNull();
  });
  it('offers Archivar to admins, separated from Papelera', async () => {
    renderActions({ admin: true, canModify: true });
    openMenu();
    const items = await screen.findAllByRole('menuitem');
    expect(items.map(item => item.textContent)).toEqual(['Archivar negocio…', 'Enviar a Papelera…']);
    expect(document.querySelector('.mantine-Menu-divider')).toBeTruthy();
  });
  it('disables Contactar and the whole menu when the user cannot modify the business', () => {
    renderActions({ admin: false, canModify: false });
    expect((screen.getByRole('button', { name: 'Contactar' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Más acciones de Hotel Río' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('keeps the menu enabled for admins who cannot modify (Archivar is still available)', () => {
    renderActions({ admin: true, canModify: false });
    expect((screen.getByRole('button', { name: 'Más acciones de Hotel Río' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
