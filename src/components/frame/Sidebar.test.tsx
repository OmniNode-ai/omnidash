// OMN-21166 defers OMN-43 dashboard controls while preserving saved layouts.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Providers } from '@/providers/Providers';
import { RegistryProvider } from '@/registry/RegistryProvider';
import { Sidebar } from './Sidebar';
import { useFrameStore } from '@/store/store';
import type { RegistryManifest } from '@/registry/types';

const minimalManifest: RegistryManifest = {
  manifestVersion: '1.0',
  generatedAt: '2026-04-20T00:00:00Z',
  components: {},
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <RegistryProvider manifest={minimalManifest}>
        {children}
      </RegistryProvider>
    </Providers>
  );
}

function renderSidebar() {
  return render(<Sidebar />, { wrapper: Wrapper });
}

describe('Sidebar — deferred dashboard controls (OMN-21166)', () => {
  beforeEach(() => {
    // Reset to empty state before each test to avoid list pollution.
    // sidebarCollapsed: false because jsdom sets window.innerWidth=0 which
    // would otherwise initialise the sidebar as collapsed, hiding nav text.
    useFrameStore.setState({
      editMode: false,
      activeDashboard: null,
      activeDashboardId: null,
      dashboards: [],
      globalFilters: {},
      sidebarCollapsed: false,
      showDeveloperTools: false,
    });
  });

  it('shows core navigation rather than an empty builder prompt', () => {
    renderSidebar();
    expect(screen.getByRole('link', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.queryByText(/no dashboards yet/i)).not.toBeInTheDocument();
  });

  it('does not offer creation or rename controls in the MVP', () => {
    renderSidebar();
    expect(screen.queryByRole('button', { name: /new dashboard/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(useFrameStore.getState().dashboards).toHaveLength(0);
  });

  it('preserves saved dashboards without exposing builder navigation', async () => {
    useFrameStore.getState().createDashboard('Board A');
    useFrameStore.getState().createDashboard('Board B');
    const saved = useFrameStore.getState().dashboards;
    const active = useFrameStore.getState().activeDashboardId;
    renderSidebar();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Show developer tools' }));
    expect(screen.queryByText('Board A')).not.toBeInTheDocument();
    expect(screen.queryByText('Board B')).not.toBeInTheDocument();
    expect(useFrameStore.getState().dashboards).toEqual(saved);
    expect(useFrameStore.getState().activeDashboardId).toBe(active);
  });

  it('keeps the selected saved layout when rendering the MVP navigation', () => {
    useFrameStore.getState().createDashboard('Active Board');
    const id = useFrameStore.getState().dashboards[0].id;
    useFrameStore.getState().setActiveDashboardById(id);
    renderSidebar();
    expect(screen.queryByText('Active Board')).not.toBeInTheDocument();
    expect(useFrameStore.getState().activeDashboardId).toBe(id);
  });

  it('does NOT render sidebar-foot (no health monitoring / version source)', () => {
    renderSidebar();
    expect(screen.queryByText('All systems normal')).not.toBeInTheDocument();
    expect(screen.queryByText(/v2\./)).not.toBeInTheDocument();
  });

  it('does NOT render the workspace chip (removed — no workspaces concept)', () => {
    renderSidebar();
    expect(screen.queryByText('Platform Eng')).not.toBeInTheDocument();
  });
});
