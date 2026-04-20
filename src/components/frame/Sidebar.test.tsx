// Tests for the OMN-43 Sidebar component: create / switch / rename / delete dashboard flows.
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

describe('Sidebar — dashboard CRUD flows (OMN-43)', () => {
  beforeEach(() => {
    // Reset to empty state before each test to avoid list pollution.
    useFrameStore.setState({
      editMode: false,
      activeDashboard: null,
      activeDashboardId: null,
      dashboards: [],
      globalFilters: {},
    });
  });

  it('renders an empty state when there are no dashboards', () => {
    renderSidebar();
    expect(screen.getByText(/no dashboards yet/i)).toBeInTheDocument();
  });

  it('clicking + creates a new dashboard and puts it in rename mode', async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole('button', { name: /new dashboard/i }));

    const state = useFrameStore.getState();
    expect(state.dashboards.length).toBe(1);
    expect(state.activeDashboard?.name).toBe('Untitled Dashboard');

    // Should show inline rename input
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('switching between two dashboards changes activeDashboard', async () => {
    // Pre-seed two dashboards in the store
    useFrameStore.getState().createDashboard('Board A');
    useFrameStore.getState().createDashboard('Board B');

    const user = userEvent.setup();
    renderSidebar();

    // Both dashboard names appear
    expect(screen.getByText('Board A')).toBeInTheDocument();
    expect(screen.getByText('Board B')).toBeInTheDocument();

    // Click Board A to switch
    await user.click(screen.getByText('Board A'));
    expect(useFrameStore.getState().activeDashboard?.name).toBe('Board A');

    // Click Board B to switch
    await user.click(screen.getByText('Board B'));
    expect(useFrameStore.getState().activeDashboard?.name).toBe('Board B');
  });

  it('active dashboard shows the ▸ marker', async () => {
    useFrameStore.getState().createDashboard('Active Board');
    const id = useFrameStore.getState().dashboards[0].id;
    useFrameStore.getState().setActiveDashboardById(id);

    renderSidebar();

    // The active marker character ▸ should appear for the active dashboard
    expect(screen.getByText('▸')).toBeInTheDocument();
  });

  it('renders "All systems normal" in the sidebar footer', () => {
    renderSidebar();
    expect(screen.getByText('All systems normal')).toBeInTheDocument();
  });

  it('renders the workspace chip with "Platform Eng"', () => {
    renderSidebar();
    expect(screen.getByText('Platform Eng')).toBeInTheDocument();
  });
});
