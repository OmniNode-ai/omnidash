import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Providers } from './providers/Providers';
import { RegistryProvider } from './registry/RegistryProvider';
import { DashboardView } from './pages/DashboardView';
import { useFrameStore } from './store/store';
import { createEmptyDashboard } from '@shared/types/dashboard';
import { DashboardService } from './services/dashboardService';
import { ComponentRegistry } from './registry/ComponentRegistry';
import type { RegistryManifest } from './registry/types';

// Load the generated registry manifest
const manifestJson = readFileSync(resolve(__dirname, './registry/component-registry.json'), 'utf-8');
const manifest: RegistryManifest = JSON.parse(manifestJson);

function renderWithRegistry() {
  return render(
    <Providers>
      <RegistryProvider manifest={manifest}>
        <DashboardView />
      </RegistryProvider>
    </Providers>
  );
}

describe('Proof of Life — Part 2', () => {
  beforeEach(() => {
    useFrameStore.setState({ editMode: false, activeDashboard: null, globalFilters: {} });
    const dash = createEmptyDashboard('Integration Test Dashboard', 'jonah');
    useFrameStore.getState().setActiveDashboard(dash);
  });

  it('registry loads all MVP components from generated manifest', () => {
    const registry = new ComponentRegistry(manifest);
    const all = registry.getAvailableComponents();
    // Post-merge (OMN-22 widget consolidation): the 2D companions
    // (cost-by-model-2d, cost-trend-3d, quality-score-panel-2d) collapsed
    // into their primary counterparts via per-widget `dimension` config.
    expect(all.length).toBe(8);
    expect(all.map((c) => c.name).sort()).toEqual([
      'baselines-roi-card',
      'cost-by-model',
      'cost-trend-panel',
      'delegation-metrics',
      'event-stream',
      'quality-score-panel',
      'readiness-gate',
      'routing-decision-table',
    ]);
  });

  it('palette shows all components in edit mode', async () => {
    renderWithRegistry();
    await userEvent.click(screen.getByRole('button', { name: /add widget/i }));
    expect(screen.getByText('Cost Trend')).toBeInTheDocument();
    // Cost Trend (3D) tile collapsed into the unified 'Cost Trend' entry
    // via the `dimension` config option (OMN-22 widget consolidation).
    expect(screen.getByText('Cost by Model')).toBeInTheDocument();
    expect(screen.getByText('Delegation Metrics')).toBeInTheDocument();
    expect(screen.getByText('Routing Decisions')).toBeInTheDocument();
    expect(screen.getByText('Baselines ROI')).toBeInTheDocument();
    expect(screen.getByText('Quality Scores')).toBeInTheDocument();
    expect(screen.getByText('Readiness Gate')).toBeInTheDocument();
    expect(screen.getByText('Event Stream')).toBeInTheDocument();
  });

  it('dashboard CRUD round-trips correctly', async () => {
    const service = new DashboardService();
    const dash = createEmptyDashboard('CRUD Test', 'jonah');
    dash.layout.push({
      i: 'item-1',
      componentName: 'cost-trend-panel',
      componentVersion: '1.0.0',
      x: 0, y: 0, w: 8, h: 5,
      config: { granularity: 'day' },
    });

    // Save
    await service.save(dash);
    expect((await service.listAll()).length).toBe(1);

    // Load
    const loaded = await service.getById(dash.id);
    expect(loaded!.layout[0].componentName).toBe('cost-trend-panel');

    // Clone
    const clone = await service.clone(dash.id, 'CRUD Test Clone');
    expect(clone!.id).not.toBe(dash.id);
    expect((await service.listAll()).length).toBe(2);

    // Export + Import
    const json = await service.exportJson(dash.id);
    const imported = await service.importJson(json!);
    expect(imported.name).toBe('CRUD Test');
    expect((await service.listAll()).length).toBe(3);

    // Delete
    await service.delete(dash.id);
    expect((await service.listAll()).length).toBe(2);
  });

  it('config validation works against manifest schema', () => {
    const registry = new ComponentRegistry(manifest);
    // Valid config — uses fields that exist in the cost-trend-panel
    // schema today: dimension + style + granularity. `chartType` is
    // now internal to CostTrend2D and router-driven (OMN-22).
    const valid = registry.validateConfig('cost-trend-panel', { dimension: '2d', style: 'bar', granularity: 'day' });
    expect(valid.valid).toBe(true);

    // Invalid config — unknown key. `additionalProperties: false`
    // in the schema rejects this.
    const invalid = registry.validateConfig('cost-trend-panel', { unknownKey: 'value' });
    expect(invalid.valid).toBe(false);
  });
});
