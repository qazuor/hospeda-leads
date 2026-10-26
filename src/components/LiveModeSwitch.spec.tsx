import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { LiveModeSwitch } from './LiveModeSwitch';

const mocks = vi.hoisted(() => ({ state: { enabled: true, status: 'live', checkingNow: false, lastCheckedAt: null as Date | null } }));
vi.mock('../helpers/liveMode', () => ({ useLiveMode: () => mocks.state }));
beforeAll(() => { window.matchMedia ??= (() => ({ matches: false, media: '', onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false })) as typeof window.matchMedia; });

afterEach(() => { cleanup(); mocks.state = { enabled: true, status: 'live', checkingNow: false, lastCheckedAt: null }; });

describe('LiveModeSwitch status', () => {
  it('shows the connected state with a visible status dot by default', () => {
    render(<MantineProvider><LiveModeSwitch/></MantineProvider>);
    expect(screen.getByText('En vivo')).toBeTruthy();
    expect(screen.getByText('En vivo').previousElementSibling?.className).toContain('live');
    expect(screen.getByText('En vivo').previousElementSibling?.className).toContain('indicator');
  });

  it('shows refreshing and unavailable status labels', () => {
    mocks.state = { enabled: true, status: 'checking', checkingNow: false, lastCheckedAt: null };
    const { rerender } = render(<MantineProvider><LiveModeSwitch/></MantineProvider>);
    expect(screen.getByText('En vivo · Actualizando')).toBeTruthy();
    mocks.state = { enabled: false, status: 'off', checkingNow: false, lastCheckedAt: null };
    rerender(<MantineProvider><LiveModeSwitch/></MantineProvider>);
    expect(screen.getByText('En vivo · Sin conexión')).toBeTruthy();
  });
});
