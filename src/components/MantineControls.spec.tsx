import React, { useState } from 'react';
import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { Button } from './Button';
import { Checkbox } from './Checkbox';
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from './Command';
import { Disclosure, DisclosureSummary } from './Disclosure';
import { SectionTabs, SectionTabList, SectionTab, SectionTabPanel } from './SectionTabs';

beforeAll(() => {
  window.matchMedia = vi.fn().mockImplementation(query => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);
const mount = (children: React.ReactNode) => render(<MantineProvider>{children}</MantineProvider>);

describe('Mantine migration preserves CRM interactions', () => {
  it('keeps link targets and disabled checkbox semantics', () => {
    const change = vi.fn();
    mount(<><Button asChild><a href="/guide">Leer guía</a></Button><label><Checkbox disabled checked onChange={change} />Dato protegido</label></>);
    expect(screen.getByRole('link', { name: 'Leer guía' }).getAttribute('href')).toBe('/guide');
    const checkbox = screen.getByRole('checkbox', { name: 'Dato protegido' }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true); expect(checkbox.disabled).toBe(true);
  });
  it('filters option labels and keywords and submits the keyboard selection', async () => {
    const select = vi.fn();
    mount(<Command><CommandInput aria-label="Buscar documento" /><CommandList><CommandEmpty>Sin documentos</CommandEmpty>
      <CommandItem value="one" keywords={['guía']} onSelect={select}>Primer documento</CommandItem>
      <CommandItem value="two" onSelect={select}>Otro documento</CommandItem>
    </CommandList></Command>);
    const search = screen.getByLabelText('Buscar documento');
    fireEvent.change(search, { target: { value: 'GUIA' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    fireEvent.keyDown(search, { key: 'ArrowDown', code: 'ArrowDown' }); fireEvent.keyDown(search, { key: 'Enter', code: 'Enter' });
    expect(select).toHaveBeenCalledWith('one');
    fireEvent.change(search, { target: { value: 'inexistente' } });
    await waitFor(() => expect(screen.queryAllByRole('option')).toHaveLength(0));
    expect(screen.getByText('Sin documentos')).toBeTruthy();
  });
  it('opens and closes disclosure sections using an accessible control', () => {
    mount(<Disclosure open><DisclosureSummary>Más información</DisclosureSummary><p>Información del negocio</p></Disclosure>);
    const control = screen.getByRole('button', { name: 'Más información' });
    expect(control.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(control); expect(control.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(control); expect(control.getAttribute('aria-expanded')).toBe('true');
  });
  it('requires resolving an unsaved message before changing tabs', async () => {
    function Example() { const [tab, setTab] = useState('message'); return <SectionTabs value={tab} onValueChange={setTab}>
      <SectionTabList><SectionTab value="message">Mensaje</SectionTab><SectionTab value="history">Historial</SectionTab></SectionTabList>
      <SectionTabPanel value="message"><p data-unsaved="true">Borrador sin guardar</p></SectionTabPanel>
      <SectionTabPanel value="history">Historial del negocio</SectionTabPanel>
    </SectionTabs>; }
    mount(<Example />);
    fireEvent.click(screen.getByRole('tab', { name: 'Historial' }));
    await screen.findByRole('dialog', { name: 'Tenés un mensaje sin guardar' });
    expect(screen.getByRole('tab', { name: 'Mensaje' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Volver al mensaje' }));
    expect(screen.getByRole('tab', { name: 'Mensaje' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: 'Historial' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Descartar y cambiar de sección' }));
    expect(screen.getByRole('tab', { name: 'Historial' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByText('Borrador sin guardar')).toBeNull();
  });
});
