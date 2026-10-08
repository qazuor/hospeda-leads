import React from 'react';
import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { FilterLegend } from './FilterLegend';

beforeAll(() => {
  window.matchMedia = vi.fn().mockImplementation(query => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);
describe('filter badges only change values', () => {
  it('keeps the text field and exclusion operator fixed', () => {
    const change = vi.fn();
    render(<MantineProvider><FilterLegend groups={[{ rules: [{ field: 'notes', operator: 'not_contains', value: 'llamada' }] }]} fields={[{ key: 'notes', label: 'Notas', kind: 'notes' }]} search="Actual" onChange={change} onEdit={() => {}} onClear={() => {}} /></MantineProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar valor del filtro Notas no contiene llamada' }));
    expect(screen.queryByLabelText('Campo del filtro')).toBeNull(); expect(screen.queryByLabelText('Condición del filtro')).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Valor del filtro' }), { target: { value: 'correo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar valor' }));
    expect(change).toHaveBeenCalledWith([{ rules: [{ field: 'notes', operator: 'not_contains', value: 'correo' }] }], 'Actual');
  });
  it('edits both range endpoints while retaining the range operator', () => {
    const change = vi.fn();
    render(<MantineProvider><FilterLegend groups={[{ rules: [{ field: 'id', operator: 'between', value: '1', value2: '9' }] }]} fields={[{ key: 'id', label: 'ID', kind: 'number' }]} onChange={change} onEdit={() => {}} onClear={() => {}} /></MantineProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar valor del filtro ID entre 1 y 9' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Valor del filtro' }), { target: { value: '2' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Hasta del filtro' }), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar valor' }));
    expect(change).toHaveBeenCalledWith([{ rules: [{ field: 'id', operator: 'between', value: '2', value2: '8' }] }], '');
  });
});
