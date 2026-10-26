import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { LiveModeSwitch } from './LiveModeSwitch';

const mocks = vi.hoisted(() => ({ state: { status: 'live', refreshing: false, lastCheckedAt: null as Date | null } }));
vi.mock('../helpers/liveMode', () => ({ useLiveMode: () => mocks.state }));
beforeAll(() => { window.matchMedia ??= (() => ({ matches: false, media: '', onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false })) as typeof window.matchMedia; });

afterEach(() => { cleanup(); mocks.state = { status: 'live', refreshing: false, lastCheckedAt: null }; });

describe('LiveModeSwitch status', () => {
  it('shows the connected state with a visible status dot by default', () => {
    render(<MantineProvider><LiveModeSwitch/></MantineProvider>);
    expect(screen.getByText('En vivo')).toBeTruthy();
    expect(screen.getByText('En vivo').previousElementSibling?.className).toContain('live');
    expect(screen.getByText('En vivo').previousElementSibling?.className).toContain('indicator');
  });

  it('shows refreshing only when data is being refreshed', () => {
    mocks.state = { status: 'live', refreshing: true, lastCheckedAt: null };
    render(<MantineProvider><LiveModeSwitch/></MantineProvider>);
    expect(screen.getByText('En vivo · Actualizando').previousElementSibling?.className).toContain('refreshing');
  });

  it('shows a failing check as a problem, never as disabled', () => {
    mocks.state = { status: 'error', refreshing: false, lastCheckedAt: null };
    render(<MantineProvider><LiveModeSwitch/></MantineProvider>);
    expect(screen.getByText('En vivo · Con problemas').previousElementSibling?.className).toContain('error');
  });

  it('shows no connection when the browser is offline and keeps one accessible name without a native title', () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { container } = render(<MantineProvider><LiveModeSwitch/></MantineProvider>);
    expect(screen.getByText('En vivo · Sin conexión')).toBeTruthy();
    expect(container.querySelector('[title]')).toBeNull();
    expect(container.querySelector('[aria-label]')).toBeTruthy();
    online.mockRestore();
  });
});
