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
import { validateComponentManifest } from '@shared/types/component-manifest';
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
    vi.stubGlobal('WebSocket', class {
      onopen = null; onmessage = null; onclose = null; onerror = null;
      send = vi.fn(); close = vi.fn();
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('all component manifests pass validation', () => {
    for (const [name, m] of Object.entries(manifest.components)) {
      const result = validateComponentManifest(m);
      expect(result.valid, `Manifest "${name}" invalid: ${result.errors.join(', ')}`).toBe(true);
    }
  });

  it('all components resolve via import map after resolveImplementations', async () => {
    const registry = new ComponentRegistry(manifest);
    await registry.resolveImplementations();
    const available = registry.getAvailableComponents().filter((c) => c.status === 'available');
    // 11 post-OMN-10291 + Wave 5: cost-by-model migrated to IBarChartAdapter (OMN-10291),
    // cost-by-model-3d added via IDoughnutChartAdapter (OMN-10291), cost-summary + token-usage
    // resolve via IKPITileClusterAdapter/threejs + ITrendChartAdapter/threejs.
    // cost-by-repo uses IBarChartAdapter/threejs (not yet in componentImports) — unresolved.
    expect(available.length).toBe(11);
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
