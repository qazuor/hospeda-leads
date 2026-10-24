import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppLayout, usePageCrumb } from './AppLayout';

vi.mock('../helpers/useAuth', () => ({ useAuth: () => ({ authState: { type: 'authenticated', user: { id: 1, email: 'admin@example.com', displayName: 'Admin Test', role: 'admin' } }, logout: vi.fn() }) }));
vi.mock('../helpers/themeMode', () => ({ useThemeMode: () => ({ mode: 'light', switchToLightMode: vi.fn(), switchToDarkMode: vi.fn(), switchToAutoMode: vi.fn() }) }));
vi.mock('./LiveModeSwitch', () => ({ LiveModeSwitch: () => null }));
vi.mock('./ProfileDialog', () => ({ ProfileDialog: () => null }));

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false })) as typeof window.matchMedia;
});
afterEach(cleanup);

/** A page whose name is available on its first render, like a business already in the query cache. */
const CachedBusiness = () => { usePageCrumb('Casa del Río'); return <main><h1>Casa del Río</h1></main>; };

describe('AppLayout breadcrumbs', () => {
  it('keeps a page crumb that is set on the first render', () => {
    // Arrange / Act
    render(<MantineProvider><MemoryRouter initialEntries={['/accounts/1']}><Routes><Route element={<AppLayout/>}><Route path="/accounts/:accountId" element={<CachedBusiness/>}/></Route></Routes></MemoryRouter></MantineProvider>);
    // Assert
    const trail = screen.getByRole('navigation', { name: 'Ruta' });
    expect(trail.textContent).toContain('Negocios');
    expect(trail.querySelector('[aria-current="page"]')?.textContent).toBe('Casa del Río');
  });
});
