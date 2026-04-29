/**
 * OMN-10301: cost-summary manifest entry — adapter resolution + empty-state rendering.
 *
 * Tests:
 * 1. resolveChartAdapter('IKPITileClusterAdapter', 'threejs') returns KPITileClusterThreeJs.
 * 2. Empty fixture renders upstream-blocked empty state (reason code) on each tile.
 * 3. Populated fixture renders values (no empty-reason).
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { resolveChartAdapter } from '@/components/charts/adapter-resolver';
import { KPITileClusterThreeJs } from '@/components/charts/threejs/KPITileCluster';
import type { IKPITileClusterAdapter } from '@shared/types/chart-adapter-kpi';
import type { KPITileMetricConfig, EmptyStateConfig } from '@shared/types/chart-config';

// Tile config matching what the manifest declares.
const COST_SUMMARY_TILES: KPITileMetricConfig[] = [
  { field: 'total_cost_usd', label: 'Total Cost', format: '$,.2f' },
  { field: 'total_savings_usd', label: 'Total Savings', format: '$,.2f' },
  { field: 'total_tokens', label: 'Total Tokens', format: ',d' },
];

const CLUSTER_EMPTY_STATE: EmptyStateConfig = {
  reasons: {
    'no-data': {
      message: 'No cost summary data available',
    },
    'upstream-blocked': {
      message: 'Upstream pipeline blocked',
    },
  },
  defaultMessage: 'No cost summary data available',
};

describe('cost-summary manifest — adapter resolution', () => {
  it('resolves IKPITileClusterAdapter + threejs to KPITileClusterThreeJs', () => {
    const resolved = resolveChartAdapter('IKPITileClusterAdapter', 'threejs');
    expect(resolved).toBe(KPITileClusterThreeJs);
    // Compile-time: resolved value satisfies IKPITileClusterAdapter.
    const _check: IKPITileClusterAdapter = resolved as IKPITileClusterAdapter;
    expect(typeof _check).toBe('function');
  });
});

describe('cost-summary manifest — empty fixture (upstream-blocked)', () => {
  it('renders no-data empty state reason on all three tiles when projectionData is empty', () => {
    render(
      <KPITileClusterThreeJs
        projectionData={[]}
        tiles={COST_SUMMARY_TILES}
        emptyState={CLUSTER_EMPTY_STATE}
      />,
    );

    const totalCostTile = screen.getByTestId('kpi-tile-total-cost');
    const totalSavingsTile = screen.getByTestId('kpi-tile-total-savings');
    const totalTokensTile = screen.getByTestId('kpi-tile-total-tokens');

    // All three tiles must render with no-data reason (projectionData empty = no rows).
    expect(totalCostTile).toHaveAttribute('data-empty-reason', 'no-data');
    expect(totalSavingsTile).toHaveAttribute('data-empty-reason', 'no-data');
    expect(totalTokensTile).toHaveAttribute('data-empty-reason', 'no-data');
  });

  it('renders cluster-level empty message when projectionData is empty', () => {
    render(
      <KPITileClusterThreeJs
        projectionData={[]}
        tiles={COST_SUMMARY_TILES}
        emptyState={CLUSTER_EMPTY_STATE}
      />,
    );

    // The cluster-level no-data message must appear in at least one tile.
    const tiles = screen.getAllByTestId(/^kpi-tile-/);
    const allText = tiles.map((t) => t.textContent ?? '').join(' ');
    expect(allText).toContain('No cost summary data available');
  });

  it('does NOT render 0, --, or N/A as fallback constants when projectionData is empty', () => {
    render(
      <KPITileClusterThreeJs
        projectionData={[]}
        tiles={COST_SUMMARY_TILES}
        emptyState={CLUSTER_EMPTY_STATE}
      />,
    );

    const tiles = screen.getAllByTestId(/^kpi-tile-/);
    for (const tile of tiles) {
      expect(tile.textContent).not.toMatch(/\b0\b/);
      expect(tile.textContent).not.toMatch(/--/);
      expect(tile.textContent).not.toMatch(/N\/A/);
    }
  });
});

describe('cost-summary manifest — populated fixture', () => {
  it('renders formatted values on all three tiles when projection row is present', () => {
    render(
      <KPITileClusterThreeJs
        projectionData={[{
          window: '24h',
          total_cost_usd: 12.34,
          total_savings_usd: 4.56,
          total_tokens: 150000,
          captured_at: '2026-04-29T00:00:00Z',
        }]}
        tiles={COST_SUMMARY_TILES}
        emptyState={CLUSTER_EMPTY_STATE}
      />,
    );

    // No empty-reason on any tile.
    expect(screen.getByTestId('kpi-tile-total-cost')).not.toHaveAttribute('data-empty-reason');
    expect(screen.getByTestId('kpi-tile-total-savings')).not.toHaveAttribute('data-empty-reason');
    expect(screen.getByTestId('kpi-tile-total-tokens')).not.toHaveAttribute('data-empty-reason');

    // Labels are present.
    expect(screen.getByText('Total Cost')).toBeInTheDocument();
    expect(screen.getByText('Total Savings')).toBeInTheDocument();
    expect(screen.getByText('Total Tokens')).toBeInTheDocument();

    // total_tokens value rendered (at least the number part).
    expect(screen.getByTestId('kpi-tile-total-tokens').textContent).toContain('150');
  });
});
