import {CrmDateInput,CrmMonthInput,parseCalendarInput} from './ui/CrmDateInput';
import 'dayjs/locale/es';
import React, { useState } from 'react';
import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { Button } from './Button';
import { Checkbox } from './Checkbox';
import { NativeSelect } from './NativeSelect';
import { Input } from './Input';
import { Dialog, DialogContent, DialogTitle } from './Dialog';
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
    mount(<Command label="Buscar documento"><CommandInput aria-label="Buscar documento" /><CommandList><CommandEmpty>Sin documentos</CommandEmpty>
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
  it('focuses the requested result field and removes closed dialog controls', async () => {
    function Example() { const [open, setOpen] = useState(true); return <>
      <Input aria-label="Buscar negocios" placeholder="Buscar negocios" />
      <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogTitle>Registrar resultado</DialogTitle>
        <Input aria-label="Primero en el formulario" placeholder="Buscar negocios" />
        <label>¿Qué pasó?<NativeSelect autoFocus><option>Conversamos</option></NativeSelect></label>
        <Button onClick={() => setOpen(false)}>Cancelar resultado</Button>
      </DialogContent></Dialog>
    </>; }
    mount(<Example />);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('combobox', { name: '¿Qué pasó?' })));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar resultado' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getAllByPlaceholderText('Buscar negocios')).toHaveLength(1);
  });
  it('closes only the nested dialog on Escape and releases its parent afterwards', async () => {
    mount(<Dialog defaultOpen><DialogContent><DialogTitle>Preparar email</DialogTitle>
      <Dialog defaultOpen><DialogContent><DialogTitle>Editar enlace anidado</DialogTitle><Input autoFocus aria-label="URL anidada" /></DialogContent></Dialog>
    </DialogContent></Dialog>);
    const input=await screen.findByRole('textbox',{name:'URL anidada'});
    fireEvent.keyDown(input,{key:'Escape',code:'Escape'});
    await waitFor(()=>expect(screen.queryByText('Editar enlace anidado')).toBeNull());
    expect(screen.getByText('Preparar email')).toBeTruthy();
    fireEvent.keyDown(document.body,{key:'Escape',code:'Escape'});
    await waitFor(()=>expect(screen.queryByText('Preparar email')).toBeNull());
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
  it('shows local dates while preserving ISO values and rejecting impossible days', () => {
    const change=vi.fn();
    mount(<label>Fecha<CrmDateInput value="2027-01-18" onValueChange={change}/></label>);
    const input=screen.getByLabelText('Fecha') as HTMLInputElement;
    expect(input.value).toBe('18/01/2027');
    fireEvent.change(input,{target:{value:'21/02/2027'}});
    expect(change).toHaveBeenLastCalledWith('2027-02-21');
    fireEvent.change(input,{target:{value:'2027-03-22'}});
    expect(change).toHaveBeenLastCalledWith('2027-03-22');
    expect(parseCalendarInput('31/02/2027')).toBeNull();
    expect(parseCalendarInput('29/02/2028')).toBe('2028-02-29');
  });
  it('keeps native file selection and the original change event behind Spanish labels', () => {
    const change=vi.fn();const file=new File(['texto'],'documento.txt',{type:'text/plain'});
    mount(<label>Documento<Input type="file" aria-label="Documento" accept=".txt" onChange={change}/></label>);
    const input=screen.getByLabelText('Documento') as HTMLInputElement;
    fireEvent.change(input,{target:{files:[file]}});
    expect(change).toHaveBeenCalledOnce();expect(change.mock.calls[0][0].target.files[0]).toBe(file);
    expect(screen.getByText('documento.txt')).toBeTruthy();expect(input.accept).toBe('.txt');
  });
  it('shows Spanish months and emits the unchanged month contract', async () => {
    const change=vi.fn();mount(<CrmMonthInput value="2027-01" onValueChange={change}/>);
    const picker=screen.getByLabelText('Mes');expect(picker.textContent).toContain('enero 2027');
    fireEvent.click(picker);fireEvent.click(await screen.findByRole('button',{name:'febrero'}));
    expect(change).toHaveBeenLastCalledWith('2027-02');
  });

  it('shows a Spanish inline message instead of the native bubble and clears it on edit', () => {
    mount(<form><label>Nombre<Input required /></label><label>Tipo<NativeSelect required><option value="">Elegir</option><option value="a">A</option></NativeSelect></label></form>);
    const name = screen.getByLabelText('Nombre') as HTMLInputElement; const kind = screen.getByLabelText('Tipo') as HTMLSelectElement;
    const notCancelled = fireEvent.invalid(name); expect(notCancelled).toBe(false);
    expect(screen.getByText('Completá este dato.')).toBeTruthy();
    fireEvent.invalid(kind); expect(screen.getByText('Elegí una opción.')).toBeTruthy();
    fireEvent.change(name, { target: { value: 'Ana' } });
    expect(screen.queryByText('Completá este dato.')).toBeNull();
  });
  it('does not invent a reason for a disabled button without one', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount(<><Button disabled>Guardar</Button><Button disabled disabledReason="Falta elegir el negocio.">Enviar</Button></>);
    expect(screen.getByRole('button', { name: 'Guardar' }).closest('span[tabindex]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Enviar' }).closest('span[tabindex]')).not.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
  it('keeps the same button node and focus when the disabled reason toggles', () => {
    const view = mount(<Button disabledReason="Falta elegir el negocio.">Guardar</Button>);
    const button = screen.getByRole('button', { name: 'Guardar' }); button.focus();
    view.rerender(<MantineProvider><Button disabled disabledReason="Falta elegir el negocio.">Guardar</Button></MantineProvider>);
    view.rerender(<MantineProvider><Button disabled>Guardar</Button></MantineProvider>);
    expect(screen.getByRole('button', { name: 'Guardar' })).toBe(button);
    view.rerender(<MantineProvider><Button disabledReason="Falta elegir el negocio.">Guardar</Button></MantineProvider>);
    expect(screen.getByRole('button', { name: 'Guardar' })).toBe(button);
  });
  it('maps validity to specific Spanish messages, links them and focuses the first invalid field', () => {
    mount(<form><label>Email<Input type="email" defaultValue="x" /></label><label>Corto<Input minLength={5} defaultValue="ab" /></label><label>Cant<Input type="number" max={3} defaultValue="9" /></label></form>);
    const email = screen.getByLabelText('Email') as HTMLInputElement;
    const scroll = vi.fn(); email.scrollIntoView = scroll;
    // jsdom does not flag typeMismatch from defaultValue until validity runs; invoke the real checks.
    fireEvent.invalid(email);
    expect(screen.getByText('Revisá el formato (ej.: nombre@dominio.com).')).toBeTruthy();
    expect(document.activeElement).toBe(email); expect(scroll).toHaveBeenCalledWith({ block: 'center' });
    const described = email.getAttribute('aria-describedby'); expect(described).toBeTruthy();
    expect(document.getElementById(described!)?.textContent).toContain('Revisá el formato');
    const short = screen.getByLabelText('Corto') as HTMLInputElement; short.value = 'ab'; short.setAttribute('minlength', '5');
    fireEvent.invalid(screen.getByLabelText('Cant')); expect(screen.getByText('El valor máximo es 3.')).toBeTruthy();
  });
  it('clears the inline message on blur once the value is valid', () => {
    mount(<form><label>Nombre<Input required /></label></form>);
    const name = screen.getByLabelText('Nombre') as HTMLInputElement;
    fireEvent.invalid(name); expect(screen.getByText('Completá este dato.')).toBeTruthy();
    name.value = 'Ana'; fireEvent.blur(name);
    expect(screen.queryByText('Completá este dato.')).toBeNull();
  });

});
