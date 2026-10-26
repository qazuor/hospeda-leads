import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider, Menu } from '@mantine/core';
import 'dayjs/locale/es';
import { Dialog, DialogClose, DialogContent, DialogTitle } from './Dialog';
import { CrmDateInput } from './ui/CrmDateInput';
import styles from './Dialog.module.css';

beforeAll(() => {
  window.matchMedia = vi.fn().mockImplementation(query => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});
afterEach(cleanup);

let closeRenders = 0;
const CloseProbe = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>((props, ref) => { closeRenders++; return <button ref={ref} {...props}>Cerrar</button>; });
const MemoBody = React.memo(function MemoBody() { return <DialogClose asChild><CloseProbe /></DialogClose>; });
function Owner({ open, version, calls }: { open: boolean; version: number; calls: Array<[number, boolean]> }) {
  // A new onOpenChange closure on every owner render, like inline handlers in pages.
  return <MantineProvider><Dialog open={open} onOpenChange={next => calls.push([version, next])}><MemoBody /></Dialog></MantineProvider>;
}

describe('Dialog context', () => {
  it('keeps its context stable across owner re-renders and still calls the latest handler', () => {
    const calls: Array<[number, boolean]> = [];
    closeRenders = 0;
    const view = render(<Owner open version={1} calls={calls} />);
    const initial = closeRenders;
    view.rerender(<Owner open version={2} calls={calls} />);
    expect(closeRenders).toBe(initial);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(calls).toEqual([[2, false]]);
  });

  it('notifies consumers when the open state changes', () => {
    closeRenders = 0;
    const view = render(<Owner open version={1} calls={[]} />);
    const initial = closeRenders;
    view.rerender(<Owner open={false} version={1} calls={[]} />);
    expect(closeRenders).toBeGreaterThan(initial);
  });
});

describe('Dialog Escape', () => {
  it('closes only the open date picker on the first Escape and the dialog on the second', async () => {
    const calls: boolean[] = [];
    function Example() { const [value, setValue] = React.useState(''); return <MantineProvider><Dialog defaultOpen onOpenChange={next => calls.push(next)}>
      <DialogContent><DialogTitle>Agendar</DialogTitle><label>Fecha<CrmDateInput value={value} onValueChange={setValue} /></label></DialogContent></Dialog></MantineProvider>; }
    render(<Example />);
    const input = screen.getByLabelText('Fecha');
    fireEvent.click(input);
    const open = () => input.getAttribute('data-picker-open') === 'true';
    await waitFor(() => expect(open()).toBe(true));
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(open()).toBe(false));
    expect(calls).toEqual([]);
    expect(screen.getByText('Agendar')).toBeTruthy();
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });
    expect(calls).toEqual([false]);
  });

  it('closes the dialog on Escape when nothing floating is open', () => {
    const calls: boolean[] = [];
    render(<MantineProvider><Dialog defaultOpen onOpenChange={next => calls.push(next)}><DialogContent><DialogTitle>Simple</DialogTitle><input aria-label="Dato" /></DialogContent></Dialog></MantineProvider>);
    fireEvent.keyDown(screen.getByLabelText('Dato'), { key: 'Escape', code: 'Escape' });
    expect(calls).toEqual([false]);
  });

  it('closes only an open menu inside the dialog, then the dialog', async () => {
    const calls: boolean[] = [];
    render(<MantineProvider><Dialog defaultOpen onOpenChange={next => calls.push(next)}><DialogContent><DialogTitle>Con menú</DialogTitle>
      <Menu><Menu.Target><button>Acciones</button></Menu.Target><Menu.Dropdown><Menu.Item>Editar</Menu.Item></Menu.Dropdown></Menu></DialogContent></Dialog></MantineProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Acciones' }));
    const item = await screen.findByRole('menuitem', { name: 'Editar' });
    fireEvent.keyDown(item, { key: 'Escape', code: 'Escape' });
    expect(calls).toEqual([]);
    expect(screen.getByText('Con menú')).toBeTruthy();
    fireEvent.keyDown(screen.getByText('Con menú'), { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(calls).toEqual([false]));
  });

  it('closes only the topmost of two stacked sibling dialogs per Escape, ignoring a collapsed menu left mounted', async () => {
    const editor: boolean[] = [], prompt: boolean[] = [];
    function Stack() { const [asked, setAsked] = React.useState(false); return <MantineProvider>
      <Dialog defaultOpen onOpenChange={next => editor.push(next)}><DialogContent><DialogTitle>Editor</DialogTitle><button onClick={() => setAsked(true)}>Salir</button>
        <Menu keepMounted><Menu.Target><button aria-expanded="false">Más</button></Menu.Target><Menu.Dropdown><Menu.Item>Editar</Menu.Item></Menu.Dropdown></Menu></DialogContent></Dialog>
      {asked && <Dialog open onOpenChange={next => { prompt.push(next); if (!next) setAsked(false); }}><DialogContent><DialogTitle>Tenés cambios</DialogTitle><button>Volver</button></DialogContent></Dialog>}
    </MantineProvider>; }
    render(<Stack />);
    fireEvent.click(screen.getByRole('button', { name: 'Salir' }));
    const back = await screen.findByRole('button', { name: 'Volver' });
    fireEvent.keyDown(back, { key: 'Escape', code: 'Escape' });
    expect(prompt).toEqual([false]); expect(editor).toEqual([]);
    await waitFor(() => expect(screen.queryByText('Tenés cambios')).toBeNull());
    fireEvent.keyDown(screen.getByText('Editor'), { key: 'Escape', code: 'Escape' });
    expect(editor).toEqual([false]);
  });
});

describe('Dialog side panel', () => {
  it('opens long forms as a side panel and keeps short dialogs centered', async () => {
    render(<MantineProvider><Dialog open><DialogContent side><DialogTitle>Nuevo negocio</DialogTitle><p>Formulario</p></DialogContent></Dialog></MantineProvider>);
    const panel = await screen.findByRole('dialog', { name: 'Nuevo negocio' });
    expect(panel.getAttribute('data-side')).toBe('true');
    expect(panel.className).toContain(styles.side);
    expect(panel.parentElement?.className).toContain(styles.sideInner);
    cleanup();
    render(<MantineProvider><Dialog open><DialogContent><DialogTitle>Enviar a Papelera</DialogTitle></DialogContent></Dialog></MantineProvider>);
    const confirm = await screen.findByRole('dialog', { name: 'Enviar a Papelera' });
    expect(confirm.hasAttribute('data-side')).toBe(false);
    expect(confirm.className).not.toContain(styles.side);
    expect(confirm.parentElement?.className).not.toContain(styles.sideInner);
  });
  it('leaves no transform on the side panel or its ancestors so the fixed footer and close button stay pinned', () => {
    render(<MantineProvider><Dialog open><DialogContent side><DialogTitle>Nuevo negocio</DialogTitle><p>Formulario</p></DialogContent></Dialog></MantineProvider>);
    const panel = screen.getByRole('dialog');
    for (let node: HTMLElement | null = panel; node && node !== document.body; node = node.parentElement) expect(node.style.transform).toBe('');
  });
});
