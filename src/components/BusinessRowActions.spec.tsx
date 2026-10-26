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

function renderActions({ admin, canModify, onPreview }: { admin: boolean; canModify: boolean; onPreview?:()=>void }) {
  return render(<MantineProvider><QueryClientProvider client={new QueryClient()}><MemoryRouter><BusinessRowActions accountId="1" name="Hotel Río" canModify={canModify} admin={admin} onPreview={onPreview}/></MemoryRouter></QueryClientProvider></MantineProvider>);
}
const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Más acciones de Hotel Río' }));

describe('BusinessRowActions', () => {
  it('shows Vista previa as a persistent icon action with its own handler', () => {
    const onPreview=vi.fn(); renderActions({admin:false,canModify:false,onPreview});
    fireEvent.click(screen.getByRole('button',{name:'Vista previa'})); expect(onPreview).toHaveBeenCalledOnce();
  });
  it('keeps Contactar and the actions menu without an Abrir button', () => {
    renderActions({ admin: false, canModify: true });
    expect(screen.queryByRole('button', { name: 'Abrir' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Contactar' }).textContent).toBe('');
    expect(screen.getByRole('button', { name: 'Contactar' }).getAttribute('aria-label')).toBe('Contactar');
    expect(screen.getByRole('button',{name:'Enviar a Papelera'})).toBeTruthy();
    expect(screen.queryByRole('button',{name:/Más acciones/})).toBeNull();
  });
  it('keeps Papelera visible as an icon for sellers without an overflow menu', () => {
    renderActions({ admin: false, canModify: true });
    expect(screen.getByRole('button', { name: 'Enviar a Papelera' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Más acciones/ })).toBeNull();
    expect(screen.queryByText(/Archivar negocio/)).toBeNull();
  });
  it('offers Archivar to admins, separated from Papelera', async () => {
    renderActions({ admin: true, canModify: true });
    openMenu();
    const items = await screen.findAllByRole('menuitem');
    expect(items.map(item => item.textContent)).toEqual(['Archivar negocio…']);
  });
  it('disables Contactar and the whole menu when the user cannot modify the business', () => {
    renderActions({ admin: false, canModify: false });
    expect((screen.getByRole('button', { name: 'Contactar' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Más acciones de Hotel Río' })).toBeNull();
  });
  it('keeps the menu enabled for admins who cannot modify (Archivar is still available)', () => {
    renderActions({ admin: true, canModify: false });
    expect((screen.getByRole('button', { name: 'Más acciones de Hotel Río' }) as HTMLButtonElement).disabled).toBe(false);
  });
  it('keeps Archivar in overflow only when the admin has a fourth action', async () => {
    renderActions({admin:true,canModify:true,onPreview:vi.fn()});openMenu();
    expect(await screen.findByRole('menuitem',{name:/Archivar negocio/})).toBeTruthy();
    expect(screen.queryByRole('menuitem',{name:/Enviar a Papelera/})).toBeNull();
  });
});
