import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnapshotSourceProvider } from './data-source';
import { ThemeProvider } from './theme';
import { RegistryProvider } from './registry/RegistryProvider';
import { ComponentRegistry } from './registry/ComponentRegistry';
import { DashboardView } from './pages/DashboardView';
import { useFrameStore } from './store/store';
import { DASHBOARD_TEMPLATES } from './templates';
import { validateDashboardDefinition } from '@shared/types/dashboard';
import { COMPONENT_AUTHORITY_LABELS, validateComponentManifest } from '@shared/types/component-manifest';
import type { RegistryManifest } from './registry/types';

// Mock ECharts
vi.mock('echarts-for-react', () => ({
  default: () => <div data-testid="echarts-mock">chart</div>,
}));

import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestJson = readFileSync(resolve(__dirname, './registry/component-registry.json'), 'utf-8');
const manifest: RegistryManifest = JSON.parse(manifestJson);

describe('Proof of Life — Part 3 (Full System)', () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    useFrameStore.setState({ editMode: false, activeDashboard: null, globalFilters: {} });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ([]),
    }));
    // OMN-12969: the dead `/ws` invalidation path was removed; no WebSocket stub needed.
  });

  afterEach(() => vi.restoreAllMocks());

  it('all component manifests pass validation', () => {
    for (const [name, m] of Object.entries(manifest.components)) {
      const result = validateComponentManifest(m);
      expect(result.valid, `Manifest "${name}" invalid: ${result.errors.join(', ')}`).toBe(true);
    }
  });

  it('all registry components carry explicit authority labels with hidden consistency', () => {
    for (const [name, m] of Object.entries(manifest.components)) {
      expect(m.authorityLabel, `Manifest "${name}" missing authorityLabel`).toBeDefined();
      expect(COMPONENT_AUTHORITY_LABELS).toContain(m.authorityLabel);
      if (m.paletteVisibility === 'hidden') {
        expect(m.authorityLabel, `Hidden manifest "${name}" must not look projection-backed`).toBe('hidden');
      } else {
        expect(m.authorityLabel, `Visible manifest "${name}" cannot use hidden authority`).not.toBe('hidden');
      }
    }
  });

  it('all template panels have explicit authority labels in the registry', () => {
    for (const tpl of DASHBOARD_TEMPLATES) {
      for (const item of tpl.layout) {
        const entry = manifest.components[item.componentName];
        expect(entry?.authorityLabel, `${tpl.name}/${item.componentName} missing authorityLabel`).toBeDefined();
        expect(COMPONENT_AUTHORITY_LABELS).toContain(entry!.authorityLabel);
      }
    }
  });

  it('only one-backend-visible components resolve via import map after resolveImplementations', async () => {
    const registry = new ComponentRegistry(manifest);
    await registry.resolveImplementations();
    const available = registry.getAvailableComponents().filter((c) => c.status === 'available');
    // OMN-12833 (A2.5): components classified `hidden` by the single standard
    // projection backend sweep are forced to `not_implemented` regardless of
    // whether their implementation code exists, so they never surface in the
    // palette. Only the one-backend-visible set resolves to `available`.
    const expectedVisible = Object.entries(manifest.components)
      .filter(([, m]) => m.paletteVisibility !== 'hidden')
      .map(([name]) => name);
    const availableNames = available.map((c) => c.name).sort();
    // Every visible component must have a resolvable implementation key.
    expect(availableNames).toEqual([...expectedVisible].sort());
    // Sanity: no hidden component resolved to `available`.
    for (const c of available) {
      expect(c.manifest.paletteVisibility).not.toBe('hidden');
    }
    // The visible keep-set (delegation chain + control plane + event-stream +
    // context/evidence degraded surfaces) is non-empty.
    expect(available.length).toBeGreaterThan(0);
    expect(available.length).toBeLessThan(Object.keys(manifest.components).length);
  });

  it('both templates pass validation', () => {
    for (const tpl of DASHBOARD_TEMPLATES) {
      const result = validateDashboardDefinition(tpl);
      expect(result.valid).toBe(true);
    }
  });

  it('all template component names exist in registry', () => {
    const registry = new ComponentRegistry(manifest);
    for (const tpl of DASHBOARD_TEMPLATES) {
      for (const item of tpl.layout) {
        const entry = registry.getComponent(item.componentName);
        expect(entry, `Component "${item.componentName}" not in registry`).toBeDefined();
      }
    }
  });

  it('Cost & Delegation template loads and renders component cells', async () => {
    const tpl = DASHBOARD_TEMPLATES.find((t) => t.name === 'Cost & Delegation')!;
    useFrameStore.getState().setActiveDashboard({ ...tpl, id: `test-${Date.now()}` });

    render(
      <QueryClientProvider client={qc}><SnapshotSourceProvider>
        <ThemeProvider>
          <RegistryProvider manifest={manifest}>
            <DashboardView />
          </RegistryProvider>
        </ThemeProvider>
      </SnapshotSourceProvider></QueryClientProvider>
    );

    expect(screen.getByText('Cost & Delegation')).toBeInTheDocument();
    const cells = screen.getAllByTestId('grid-item');
    expect(cells.length).toBe(3);
  });

  it('Platform Health template loads and renders component cells', async () => {
    const tpl = DASHBOARD_TEMPLATES.find((t) => t.name === 'Platform Health')!;
    useFrameStore.getState().setActiveDashboard({ ...tpl, id: `test-${Date.now()}` });

    render(
      <QueryClientProvider client={qc}><SnapshotSourceProvider>
        <ThemeProvider>
          <RegistryProvider manifest={manifest}>
            <DashboardView />
          </RegistryProvider>
        </ThemeProvider>
      </SnapshotSourceProvider></QueryClientProvider>
    );

    expect(screen.getByText('Platform Health')).toBeInTheDocument();
    const cells = screen.getAllByTestId('grid-item');
    expect(cells.length).toBe(4);
  });

  it('registry categories span all 4 domain types', () => {
    const registry = new ComponentRegistry(manifest);
    const categories = new Set(
      registry.getAvailableComponents().map((c) => c.manifest.category)
    );
    expect(categories.has('cost')).toBe(true);
    expect(categories.has('activity')).toBe(true);
    expect(categories.has('quality')).toBe(true);
    expect(categories.has('health')).toBe(true);
  });
});
