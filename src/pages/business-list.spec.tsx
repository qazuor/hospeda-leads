import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

const tooltipRenders = vi.hoisted(() => ({ count: 0 }));
vi.mock('../components/Tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => { tooltipRenders.count++; return <>{children}</>; },
  TooltipTrigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) => <>{children}</>,
  TooltipContent: () => null,
  DisabledTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
import { BusinessTableRow, dateCell, joinedValues } from './business-list';
import { businessCountsSummary } from '../components/BusinessCard';

beforeAll(() => {
  window.matchMedia = vi.fn().mockImplementation(query => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
});
afterEach(cleanup);

type RowProps = React.ComponentProps<typeof BusinessTableRow>;
const row = { id: '-7', accountId: '7', nombre: 'Hotel Río', telefono: '343 555', email: 'rio@example.test', canModify: true, opportunityCount: 0, contactCount: 1 } as unknown as RowProps['row'];
const columns = ['telefono', 'email'];
const pins = {};
const onToggle = vi.fn(), onOpen = vi.fn();
function Harness({ selected }: { tick: number; selected: boolean }) {
  return <MantineProvider><table><tbody><BusinessTableRow row={row} columns={columns} pins={pins} selected={selected} admin={false} users={undefined} onToggle={onToggle} onOpen={onOpen} /></tbody></table></MantineProvider>;
}

describe('BusinessTableRow', () => {
  it('skips re-rendering when the list re-renders with the same row props', () => {
    tooltipRenders.count = 0;
    const view = render(<Harness tick={1} selected={false} />);
    const initial = tooltipRenders.count;
    expect(initial).toBe(columns.length);
    view.rerender(<Harness tick={2} selected={false} />);
    expect(tooltipRenders.count).toBe(initial);
    view.rerender(<Harness tick={3} selected />);
    expect(tooltipRenders.count).toBe(initial * 2);
    expect((screen.getByRole('checkbox', { name: 'Seleccionar Hotel Río' }) as HTMLInputElement).checked).toBe(true);
  });
});

describe('business list date and count helpers', () => {
  const utcMidnight = new Date('2026-11-01T00:00:00Z');
  it('shows DATE columns as the calendar day, not the Argentina instant', () => {
    expect(dateCell('fechaProximaAccion', utcMidnight)).toMatch(/^1 (de )?nov/i);
    expect(dateCell('createdAt', utcMidnight)).toMatch(/^31 (de )?oct/i);
  });
  it('joins multi-management DATE values with the calendar-day formatter', () => {
    expect(joinedValues('fechaUltimoContacto', [utcMidnight, utcMidnight])).toMatch(/^1 (de )?nov.* · 1 (de )?nov/i);
    expect(joinedValues('ciudad', ['Colón', 'Paraná'])).toBe('Colón · Paraná');
  });
  it('uses singular and plural forms in the counts summary', () => {
    expect(businessCountsSummary({ opportunityCount: 1, contactCount: 1, commercialStatus: 'client' })).toBe('1 gestión · 1 persona · Cliente');
    expect(businessCountsSummary({ opportunityCount: 2, contactCount: 3 })).toBe('2 gestiones · 3 personas · Potencial cliente');
    expect(businessCountsSummary({ opportunityCount: 0, contactCount: 0 })).toBe('Potencial cliente');
    expect(businessCountsSummary({ opportunityCount: 0, contactCount: 1 }, true)).toBe('0 gestiones · 1 persona · Potencial cliente');
  });
});
