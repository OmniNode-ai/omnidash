// OMN-24616 AC4 (decision D3): the local pages have no command palette.
// The audit found a hidden Ctrl/Cmd+K palette on the local pages offering seven node ids, three of which do not
// exist, posting to a route the local server does not serve. The palette stays where its route exists.
// Failure modes:
//   C1  Ctrl+K opens the palette on a local page
//   C2  the palette is removed from the canvas dashboard too, where its route exists
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import { Providers } from '@/providers/Providers';
import { RegistryProvider } from '@/registry/RegistryProvider';
import { App } from '@/App';
import { useFrameStore } from '@/store/store';
import { createEmptyDashboard } from '@shared/types/dashboard';
import type { RegistryManifest } from '@/registry/types';

const manifest: RegistryManifest = { manifestVersion: '1.0', generatedAt: '2026-04-10T00:00:00Z', components: {} };

function app(path: string) {
  window.history.replaceState(null, '', path);
  render(<Providers><RegistryProvider manifest={manifest}><App /></RegistryProvider></Providers>);
}

beforeAll(async () => { await import('@/pages/DashboardView'); }, 60000);
afterEach(() => cleanup());

describe('OMN-24616 AC4 (D3): no command palette on the local pages', () => {
  it('C1: Ctrl+K on Overview opens no palette', async () => {
    app('/overview');
    await act(async () => { fireEvent.keyDown(window, { key: 'k', ctrlKey: true }); });
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull();
  });

  it('C2: Ctrl+K on the canvas dashboard still opens it', async () => {
    useFrameStore.setState({ editMode: false, activeDashboard: null, globalFilters: {}, activePage: 'dashboard' });
    useFrameStore.getState().setActiveDashboard(createEmptyDashboard('My Dashboard', 'jonah'));
    app('/dashboard');
    await screen.findAllByText('My Dashboard');
    await act(async () => { fireEvent.keyDown(window, { key: 'k', ctrlKey: true }); });
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
  });
});
