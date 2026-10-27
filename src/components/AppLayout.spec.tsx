import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { AppLayout, usePageCrumb } from './AppLayout';
import { PageHeader } from './PageHeader';

vi.mock('../helpers/useAuth', () => ({ useAuth: () => ({ authState: { type: 'authenticated', user: { id: 1, email: 'admin@example.com', displayName: 'Admin Test', role: 'admin' } }, logout: vi.fn() }) }));
vi.mock('../helpers/themeMode', () => ({ useThemeMode: () => ({ mode: 'light', switchToLightMode: vi.fn(), switchToDarkMode: vi.fn(), switchToAutoMode: vi.fn() }) }));
vi.mock('./LiveModeSwitch', () => ({ LiveModeSwitch: () => null }));
vi.mock('./ProfileDialog', () => ({ ProfileDialog: () => null }));

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false })) as typeof window.matchMedia;
});
afterEach(cleanup);

/** A page whose name is available on its first render, like a business already in the query cache. */
const CachedBusiness = () => { usePageCrumb('Casa del Río'); return <main><PageHeader eyebrow="NEGOCIO" title="Casa del Río" description="Detalle del negocio." topic="businesses"/><Link to="/plain">Otra página</Link></main>; };

describe('AppLayout breadcrumbs', () => {
  it('keeps a page crumb that is set on the first render', () => {
    // Arrange / Act
    render(<MantineProvider><MemoryRouter initialEntries={['/accounts/1']}><Routes><Route element={<AppLayout/>}><Route path="/accounts/:accountId" element={<CachedBusiness/>}/></Route></Routes></MemoryRouter></MantineProvider>);
    // Assert
    const trail = screen.getByRole('navigation', { name: 'Ruta' });
    expect(trail.textContent).toContain('Negocios');
    expect(trail.querySelector('[aria-current="page"]')?.textContent).toBe('Casa del Río');
  });
  it('keeps the user menu in the top bar with the WhatsApp script destination inside it', async () => {
    render(<MantineProvider><MemoryRouter initialEntries={['/accounts/1']}><Routes><Route element={<AppLayout/>}><Route path="/accounts/:accountId" element={<CachedBusiness/>}/></Route></Routes></MemoryRouter></MantineProvider>);
    const triggers=screen.getAllByRole('button',{name:'Admin Test'});
    expect(triggers.length).toBeGreaterThan(0);
    const desktopTrigger=triggers[0];
    expect(desktopTrigger.querySelector('span[class*="avatar"]')).toBeNull();
    expect(desktopTrigger.textContent).toContain('Admin Test');
    const topbarActions=document.querySelector('header nav[aria-label="Ruta"]')?.parentElement?.querySelector('div[class*="topbarActions"]');
    expect(topbarActions?.contains(desktopTrigger)).toBe(true);
    expect(document.querySelector('aside')?.querySelector('[aria-label="User script de WhatsApp"]')).toBeNull();
    fireEvent.click(triggers[0]);
    expect(await screen.findByRole('menuitem',{name:'User script de WhatsApp'})).toBeTruthy();
  });
  it('keeps help in the page header without a duplicate topbar button', () => {
    render(<MantineProvider><MemoryRouter initialEntries={['/accounts/1']}><Routes><Route element={<AppLayout/>}><Route path="/accounts/:accountId" element={<CachedBusiness/>}/></Route></Routes></MemoryRouter></MantineProvider>);
    expect(screen.getAllByRole('link', { name: 'Cómo funciona' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Ayuda sobre negocios y gestiones' })).toBeNull();
  });
});
