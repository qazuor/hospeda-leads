import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CommercialDetail } from '../endpoints/commercial.schema';

const auth = vi.hoisted(() => ({ user: { id: 3, email: 'owner@example.com', role: 'user' } }));
const getDetail = vi.hoisted(() => vi.fn());
vi.mock('../helpers/useAuth', () => ({ useAuth: () => ({ authState: { type: 'authenticated', user: auth.user } }) }));
vi.mock('../endpoints/commercial.schema', () => ({ getCommercialDetail: getDetail }));
vi.mock('./BusinessContactDialog', () => ({ BusinessContactDialog: () => <div>contact dialog</div> }));
vi.mock('./CommercialEditor', () => ({ CommercialEditor: () => <div>editor</div> }));
import { BusinessPreviewDrawer, type BusinessPreviewRow } from './BusinessPreviewDrawer';

const detail = (account: Partial<CommercialDetail['account']> = {}) => ({
  account: { id: '7', nombre: 'Hotel Río', status: 'contacted', tipo: 'Hotel', ciudad: 'Colón', assignedUserEmail: 'owner@example.com', whatsapp: '+54 9 3447 111111', email: null, telefono: null, doNotContact: false, archivedAt: null, ...account },
  contacts: [{ id: 'c1', name: 'Luis Gómez', isPrimary: true }], opportunities: [], journal: [], leadJournal: [], managementJournal: [],
}) as unknown as CommercialDetail;
const row: BusinessPreviewRow = { accountId: '7', nombre: 'Hotel Río', nextActionTitle: 'Llamar para confirmar', fechaProximaAccion: '2099-01-10' };

beforeAll(() => {
  window.matchMedia = vi.fn().mockImplementation(query => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
beforeEach(() => { getDetail.mockReset(); auth.user = { id: 3, email: 'owner@example.com', role: 'user' }; });
afterEach(cleanup);

function renderDrawer(client = new QueryClient({ defaultOptions: { queries: { retry: false } } }), onOpenRecord: (row: BusinessPreviewRow) => void = () => {}) {
  render(<MantineProvider><QueryClientProvider client={client}><MemoryRouter initialEntries={['/accounts']}><Routes>
    <Route path="/accounts" element={<BusinessPreviewDrawer row={row} opened onClose={() => {}} onOpenRecord={onOpenRecord} returnFocusTo={null} users={[{ email: 'owner@example.com', displayName: 'Ana Pérez' }]}/>}/>
    <Route path="/accounts/:id" element={<p>business record</p>}/>
  </Routes></MemoryRouter></QueryClientProvider></MantineProvider>);
  return client;
}

describe('BusinessPreviewDrawer', () => {
  it('shows a loading state while the detail is pending', () => {
    getDetail.mockReturnValue(new Promise(() => {}));
    renderDrawer();
    expect(screen.getByRole('status', { name: 'Cargando vista previa' })).toBeTruthy();
  });

  it('is a dialog labelled by the business name with readable data from the detail and the row', async () => {
    getDetail.mockResolvedValue(detail());
    renderDrawer();
    expect(await screen.findByText('H7')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Hotel Río' })).toBeTruthy();
    expect(screen.queryByText('contacted')).toBeNull();
    expect(screen.getByText('Ana Pérez')).toBeTruthy();
    expect(screen.getByText('Llamar para confirmar')).toBeTruthy();
    expect(screen.getByText('+54 9 3447 111111')).toBeTruthy();
    expect(screen.getByText('Luis Gómez')).toBeTruthy();
  });

  it('shares the row actions query key so the detail is not fetched twice', async () => {
    getDetail.mockResolvedValue(detail());
    const client = renderDrawer();
    await screen.findByText('H7');
    expect(client.getQueryData(['commercial-detail', '7'])).toBeTruthy();
    expect(getDetail).toHaveBeenCalledTimes(1);
  });

  it('offers Reintentar after an error and fetches again', async () => {
    getDetail.mockRejectedValueOnce(new Error('Sin conexión')).mockResolvedValueOnce(detail());
    renderDrawer();
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('H7')).toBeTruthy();
    expect(getDetail).toHaveBeenCalledTimes(2);
  });

  it('disables Contactar and Editar for a seller who is not responsible', async () => {
    auth.user = { id: 4, email: 'other@example.com', role: 'user' };
    getDetail.mockResolvedValue(detail());
    renderDrawer();
    await screen.findByText('H7');
    expect((screen.getByRole('button', { name: 'Contactar' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Editar' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('marks restricted channels as No contactar', async () => {
    getDetail.mockResolvedValue(detail({ doNotContact: true }));
    renderDrawer();
    expect(await screen.findByText('No contactar')).toBeTruthy();
  });

  it('hands the row to onOpenRecord from Abrir ficha so the list can remember its anchor', async () => {
    getDetail.mockResolvedValue(detail());
    const onOpenRecord = vi.fn();
    renderDrawer(undefined, onOpenRecord);
    await screen.findByText('H7');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir ficha' }));
    expect(onOpenRecord).toHaveBeenCalledWith(row);
  });

  it('lists only open managements', async () => {
    getDetail.mockResolvedValue({ ...detail(), opportunities: [
      { id: 'o1', opportunityName: 'Plan anual', estado: 'main:interested', managementType: 'main', deletedAt: null },
      { id: 'o2', opportunityName: 'Plan viejo', estado: 'main:lost', managementType: 'main', deletedAt: null },
    ] } as unknown as CommercialDetail);
    renderDrawer();
    await screen.findByText('H7');
    expect(screen.getByText(/Plan anual/)).toBeTruthy();
    expect(screen.queryByText(/Plan viejo/)).toBeNull();
  });

  it('lets an admin edit an archived business but not contact it', async () => {
    auth.user = { id: 1, email: 'admin@example.com', role: 'admin' };
    getDetail.mockResolvedValue(detail({ archivedAt: new Date('2026-10-01T12:00:00Z') } as Partial<CommercialDetail['account']>));
    renderDrawer();
    await screen.findByText('H7');
    expect((screen.getByRole('button', { name: 'Editar' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: 'Contactar' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not let the responsible seller edit a No contactar business', async () => {
    getDetail.mockResolvedValue(detail({ doNotContact: true }));
    renderDrawer();
    await screen.findByText('H7');
    expect((screen.getByRole('button', { name: 'Editar' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
