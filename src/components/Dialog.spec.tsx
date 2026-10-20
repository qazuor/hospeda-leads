import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import 'dayjs/locale/es';
import { Dialog, DialogClose, DialogContent, DialogTitle } from './Dialog';
import { CrmDateInput } from './ui/CrmDateInput';

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
      <DialogContent onEscapeKeyDown={() => {}}><DialogTitle>Agendar</DialogTitle><label>Fecha<CrmDateInput value={value} onValueChange={setValue} /></label></DialogContent></Dialog></MantineProvider>; }
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
});
