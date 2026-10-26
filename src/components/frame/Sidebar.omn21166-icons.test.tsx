// OMN-21166 AC25 (mockup build, approved 2026-10-18): every destination carries the mockup's own Lucide icon.
//
// Failure modes, each with a test below:
//   I1  a destination keeps an icon the approved mockup replaced (Runs, Usage, API Keys, Delegation Evidence)
//   I2  two destinations share an icon, so the sidebar cannot be read by icon alone
//   I3  an icon is announced to screen readers next to its label
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Providers } from '@/providers/Providers';
import { RegistryProvider } from '@/registry/RegistryProvider';
import { Sidebar } from './Sidebar';
import { useFrameStore } from '@/store/store';
import type { RegistryManifest } from '@/registry/types';

const minimalManifest: RegistryManifest = { manifestVersion: '1.0', generatedAt: '2026-10-18T00:00:00Z', components: {} };

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <RegistryProvider manifest={minimalManifest}>{children}</RegistryProvider>
    </Providers>
  );
}

const MOCKUP_ICONS = [
  ['local-overview', 'lucide-layout-dashboard'],
  ['local-runs', 'lucide-activity'],
  ['local-workflow', 'lucide-workflow'],
  ['local-usage', 'lucide-chart-column'],
  ['local-settings', 'lucide-settings'],
  ['delegation-evidence', 'lucide-badge-check'],
] as const;

function iconOf(page: string): SVGElement | null {
  return screen.getByTestId(`nav-${page}`).querySelector('.dash-marker svg');
}

describe('OMN-21166 AC25: sidebar icons follow the approved mockup', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    useFrameStore.setState({ dashboards: [], activeDashboardId: null, activeDashboard: null, sidebarCollapsed: false, showDeveloperTools: true, activePage: 'local-overview' });
  });

  it.each(MOCKUP_ICONS)('I1: %s shows %s', (page, icon) => {
    render(<Sidebar />, { wrapper: Wrapper });
    expect(iconOf(page)?.classList.contains(icon)).toBe(true);
  });

  it('I2: all ten destinations have different icons', () => {
    render(<Sidebar />, { wrapper: Wrapper });
    const icons = [...document.querySelectorAll('.mvp-nav-item .dash-marker svg')]
      .map(svg => [...svg.classList].find(name => name.startsWith('lucide-') && name !== 'lucide-icon'));
    // OMN-21166 part 26: Settings replaced the Credentials and API Keys entries, so eleven became ten.
    expect(icons).toHaveLength(10);
    expect(new Set(icons).size).toBe(10);
  });

  it('I3: the icon is hidden from assistive technology; the label names the link', () => {
    render(<Sidebar />, { wrapper: Wrapper });
    for (const [page] of MOCKUP_ICONS) {
      expect(screen.getByTestId(`nav-${page}`).querySelector('.dash-marker')).toHaveAttribute('aria-hidden', 'true');
    }
  });
});
