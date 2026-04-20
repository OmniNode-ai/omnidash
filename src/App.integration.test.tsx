import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach } from 'vitest';
import { Providers } from './providers/Providers';
import { RegistryProvider } from './registry/RegistryProvider';
import { App } from './App';
import { useFrameStore } from './store/store';
import { eventBus } from './events/eventBus';
import { createEmptyDashboard } from '@shared/types/dashboard';
import type { RegistryManifest } from './registry/types';

const manifest: RegistryManifest = {
  manifestVersion: '1.0',
  generatedAt: '2026-04-10T00:00:00Z',
  components: {},
};

function renderApp() {
  return render(
    <Providers>
      <RegistryProvider manifest={manifest}>
        <App />
      </RegistryProvider>
    </Providers>
  );
}

describe('Part 1 smoke proof — frame liveness, provider wiring, theme switching, local state/event behavior', () => {
  beforeEach(() => {
    useFrameStore.setState({ editMode: false, activeDashboard: null, globalFilters: {} });
    const dash = createEmptyDashboard('Integration Test Dashboard', 'jonah');
    useFrameStore.getState().setActiveDashboard(dash);
  });

  it('renders frame layout with header and main area', () => {
    renderApp();
    // "Dashboards" appears in both the sidebar nav label and the header breadcrumb.
    const dashboardsEls = screen.getAllByText('Dashboards');
    expect(dashboardsEls.length).toBeGreaterThan(0);
    // Dashboard name appears in both sidebar list and DashboardView toolbar.
    const nameEls = screen.getAllByText('Integration Test Dashboard');
    expect(nameEls.length).toBeGreaterThan(0);
  });

  it('theme toggle switches between dark and light', async () => {
    renderApp();
    const themeBtn = screen.getByRole('button', { name: /theme/i });
    expect(themeBtn.textContent).toBe('dark');

    await userEvent.click(themeBtn);
    expect(themeBtn.textContent).toBe('light');
    expect(document.body.classList.contains('theme-light')).toBe(true);

    await userEvent.click(themeBtn);
    expect(themeBtn.textContent).toBe('dark');
    expect(document.body.classList.contains('theme-dark')).toBe(true);
  });

  it('zustand store starts in view mode', () => {
    expect(useFrameStore.getState().editMode).toBe(false);
  });

  it('mitt event bus is functional', () => {
    let received = false;
    const handler = () => { received = true; };
    eventBus.on('component:node_selected', handler);
    eventBus.emit('component:node_selected', { nodeId: 'test', source: 'proof' });
    expect(received).toBe(true);
    eventBus.off('component:node_selected', handler);
  });
});
