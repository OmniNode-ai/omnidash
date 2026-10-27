// OMN-19981 Amendment 6 (requirements FR-3): the six local pages are the dashboard's first navigation group.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Providers } from '@/providers/Providers';
import { RegistryProvider } from '@/registry/RegistryProvider';
import { Sidebar } from './Sidebar';
import { useFrameStore } from '@/store/store';
import { createUISlice } from '@/store/uiSlice';
import type { RegistryManifest } from '@/registry/types';
import type { FrameStore } from '@/store/types';

const minimalManifest: RegistryManifest = { manifestVersion: '1.0', generatedAt: '2026-10-02T00:00:00Z', components: {} };

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <RegistryProvider manifest={minimalManifest}>{children}</RegistryProvider>
    </Providers>
  );
}

// OMN-21166 part 26 AC153: Settings holds API Keys and Credentials, so they are not entries of their own.
const SIX = [
  ['local-overview', 'Overview'],
  ['local-runs', 'Runs'],
  ['local-workflow', 'Workflow'],
  ['local-usage', 'Usage'],
  ['local-settings', 'Settings'],
] as const;

describe('Sidebar local pages (FR-3, F23)', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    useFrameStore.setState({ dashboards: [], activeDashboardId: null, activeDashboard: null, sidebarCollapsed: false, showDeveloperTools: false, activePage: 'local-overview' });
  });

  it('lists the local pages first, in the required order', () => {
    render(<Sidebar />, { wrapper: Wrapper });
    const group = screen.getByRole('navigation', { name: 'Local' });
    const items = within(group).getAllByRole('link');
    expect(items.map((item) => item.getAttribute('data-testid'))).toEqual(SIX.map(([page]) => `nav-${page}`));
    expect(items.map((item) => item.querySelector('.dash-name')?.textContent)).toEqual(SIX.map(([, label]) => label));
    // First in the sidebar: the Local group precedes the dashboards list.
    const aside = group.closest('aside')!;
    expect(aside.querySelector('nav[aria-label="Local"]')).toBe(aside.querySelector('nav, .dash-list'));
  });

  it('shows clean destination labels without hardcoded partial badges', () => {
    // Owner2026-10-18T12:39Z: remove Partial labels on the seven pages. Runtime availability
    // remains the responsibility of each page's actual data state.
    render(<Sidebar />, { wrapper: Wrapper });
    for (const [page] of SIX) {
      const chip = within(screen.getByTestId(`nav-${page}`)).queryByText('partial');
      expect(chip, page).toBeNull();
    }
  });

  it('keeps a local page open when its own entry is clicked again', async () => {
    render(<Sidebar />, { wrapper: Wrapper });
    await userEvent.click(screen.getByTestId('nav-local-runs'));
    expect(useFrameStore.getState().activePage).toBe('local-runs');
    await userEvent.click(screen.getByTestId('nav-local-runs'));
    expect(useFrameStore.getState().activePage).toBe('local-runs');
  });

  it('keeps evidence visible and advanced pages reachable through the setting', async () => {
    render(<Sidebar />, { wrapper: Wrapper });
    expect(screen.getByTestId('nav-delegation-evidence')).toBeInTheDocument();
    expect(screen.queryByTestId('nav-event-bus')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Show developer tools' }));
    for (const page of ['delegation-evidence', 'event-bus', 'experiments', 'sea-control', 'lab']) {
      expect(screen.getByTestId(`nav-${page}`)).toBeInTheDocument();
    }
  });
});

describe('Opening page (FR-3, F23)', () => {
  it('opens on Overview', () => {
    const slice = createUISlice(() => undefined, () => ({}) as FrameStore, {} as never);
    expect(slice.activePage).toBe('local-overview');
  });
});
