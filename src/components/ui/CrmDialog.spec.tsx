import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider, Menu } from '@mantine/core';
import 'dayjs/locale/es';
import { CrmDialog } from './CrmDialog';
import { CrmDateInput } from './CrmDateInput';

beforeAll(() => {
  window.matchMedia = vi.fn().mockImplementation(query => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});
afterEach(cleanup);

describe('CrmDialog Escape', () => {
  it('closes the dialog on Escape when nothing floating is open', () => {
    const onClose = vi.fn();
    render(<MantineProvider><CrmDialog opened onClose={onClose} title="Contactar"><input aria-label="Dato" /></CrmDialog></MantineProvider>);
    fireEvent.keyDown(screen.getByLabelText('Dato'), { key: 'Escape', code: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes an open menu first and only then the dialog', async () => {
    const onClose = vi.fn();
    render(<MantineProvider><CrmDialog opened onClose={onClose} title="Con menú">
      <Menu><Menu.Target><button>Acciones</button></Menu.Target><Menu.Dropdown><Menu.Item>Editar</Menu.Item></Menu.Dropdown></Menu></CrmDialog></MantineProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Acciones' }));
    const item = await screen.findByRole('menuitem', { name: 'Editar' });
    fireEvent.keyDown(item, { key: 'Escape', code: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Con menú')).toBeTruthy();
    fireEvent.keyDown(screen.getByText('Con menú'), { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('closes only an open date picker first and keeps what was typed', async () => {
    const onClose = vi.fn();
    function Example() { const [value, setValue] = React.useState(''); return <MantineProvider><CrmDialog opened onClose={onClose} title="Agendar">
      <input aria-label="Nota" defaultValue="escrito" /><label>Fecha<CrmDateInput value={value} onValueChange={setValue} /></label></CrmDialog></MantineProvider>; }
    render(<Example />);
    const input = screen.getByLabelText('Fecha');
    fireEvent.click(input);
    const open = () => input.getAttribute('data-picker-open') === 'true';
    await waitFor(() => expect(open()).toBe(true));
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(open()).toBe(false));
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Nota') as HTMLInputElement).value).toBe('escrito');
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores Escape while busy', () => {
    const onClose = vi.fn();
    render(<MantineProvider><CrmDialog opened busy onClose={onClose} title="Ocupado"><input aria-label="Dato" /></CrmDialog></MantineProvider>);
    fireEvent.keyDown(screen.getByLabelText('Dato'), { key: 'Escape', code: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not touch the document when the focus-restore timer fires after the environment is gone', () => {
    const view = render(<MantineProvider><CrmDialog opened onClose={() => {}} title="Cerrar"><input aria-label="Dato" /></CrmDialog></MantineProvider>);
    const timers = vi.spyOn(window, 'setTimeout');
    view.unmount();
    const restore = timers.mock.calls.filter(([, delay]) => delay === 10).map(([callback]) => callback as () => void);
    timers.mockRestore();
    expect(restore.length).toBeGreaterThan(0);
    vi.stubGlobal('document', undefined);
    try { for (const callback of restore) expect(callback).not.toThrow(); } finally { vi.unstubAllGlobals(); }
  });
});
