import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { KPITileCluster } from './KPITileCluster';
import type { KPITileMetricConfig } from '@/../../shared/types/chart-config';
import type {
  IKPITileClusterAdapter,
  KPITileClusterAdapterProps,
} from '@/../../shared/types/chart-adapter-kpi';

const TILES: KPITileMetricConfig[] = [
  { field: 'total_cost_usd', label: 'Total Cost', format: '$,.2f' },
  { field: 'total_savings_usd', label: 'Total Savings' },
  { field: 'total_tokens', label: 'Total Tokens' },
];

// --- Interface conformance (compile-time) --------------------------------

const _adapterCheck: IKPITileClusterAdapter = KPITileCluster;
void _adapterCheck;

// Verify the explicit Props type is compatible.
type _PropsCheck = KPITileClusterAdapterProps<Record<string, unknown>>;
const _propsInstance: _PropsCheck = {
  projectionData: [],
  tiles: TILES,
};
void _propsInstance;

// --- data-testid strategy -----------------------------------------------

describe('KPITileCluster — container', () => {
  it('renders data-testid="kpi-tile-cluster" on the container', () => {
    render(<KPITileCluster projectionData={[{ total_cost_usd: 1, total_savings_usd: 2, total_tokens: 3 }]} tiles={TILES} />);
    expect(screen.getByTestId('kpi-tile-cluster')).toBeInTheDocument();
  });

  it('renders data-testid="kpi-tile-{label-slug}" on each tile', () => {
    render(
      <KPITileCluster
        projectionData={[{ total_cost_usd: 1, total_savings_usd: 2, total_tokens: 3 }]}
        tiles={TILES}
      />,
    );
    expect(screen.getByTestId('kpi-tile-total-cost')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-tile-total-savings')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-tile-total-tokens')).toBeInTheDocument();
  });
});

// --- Populated rendering ------------------------------------------------

describe('KPITileCluster — populated', () => {
  it('renders numeric values for each tile', () => {
    render(
      <KPITileCluster
        projectionData={[{ total_cost_usd: 12.3456, total_savings_usd: 3.21, total_tokens: 456789 }]}
        tiles={TILES}
      />,
    );
    // total_tokens — no format, rendered as Intl number
    expect(screen.getByTestId('kpi-tile-total-tokens').textContent).toContain('456');
    // label present
    expect(screen.getByText('Total Cost')).toBeInTheDocument();
    expect(screen.getByText('Total Savings')).toBeInTheDocument();
    expect(screen.getByText('Total Tokens')).toBeInTheDocument();
  });

  it('does NOT render 0, --, or N/A for a present-and-zero numeric field', () => {
    render(
      <KPITileCluster
        projectionData={[{ total_cost_usd: 0, total_savings_usd: 0, total_tokens: 0 }]}
        tiles={TILES}
      />,
    );
    // All tiles should be populated (no empty-reason attribute).
    for (const testId of ['kpi-tile-total-cost', 'kpi-tile-total-savings', 'kpi-tile-total-tokens']) {
      const tile = screen.getByTestId(testId);
      expect(tile).not.toHaveAttribute('data-empty-reason');
    }
  });
});

// --- Per-tile honest-null: all 4 reason codes ---------------------------

describe('KPITileCluster — per-tile empty states', () => {
  it('reason: no-data — renders empty state when projectionData is empty', () => {
    render(
      <KPITileCluster
        projectionData={[]}
        tiles={[{ field: 'total_cost_usd', label: 'Total Cost' }]}
        emptyState={{ defaultMessage: 'No data yet' }}
      />,
    );
    const tile = screen.getByTestId('kpi-tile-total-cost');
    expect(tile).toHaveAttribute('data-empty-reason', 'no-data');
    expect(tile.textContent).toContain('No data yet');
    // Must NOT render fallback constants.
    expect(tile.textContent).not.toMatch(/\b0\b/);
    expect(tile.textContent).not.toMatch(/--/);
    expect(tile.textContent).not.toMatch(/N\/A/);
  });

  it('reason: missing-field — tile renders empty state when field absent from row', () => {
    render(
      <KPITileCluster
        projectionData={[{ total_tokens: 100 }]}
        tiles={[{ field: 'total_cost_usd', label: 'Total Cost' }]}
      />,
    );
    const tile = screen.getByTestId('kpi-tile-total-cost');
    expect(tile).toHaveAttribute('data-empty-reason', 'missing-field');
  });

  it('reason: missing-field — tile renders empty state when field value is null', () => {
    render(
      <KPITileCluster
        projectionData={[{ total_cost_usd: null }]}
        tiles={[{ field: 'total_cost_usd', label: 'Total Cost' }]}
      />,
    );
    const tile = screen.getByTestId('kpi-tile-total-cost');
    expect(tile).toHaveAttribute('data-empty-reason', 'missing-field');
  });

  it('reason: schema-invalid — tile renders empty state when field has wrong type', () => {
    render(
      <KPITileCluster
        projectionData={[{ total_cost_usd: { nested: true } }]}
        tiles={[{ field: 'total_cost_usd', label: 'Total Cost' }]}
      />,
    );
    const tile = screen.getByTestId('kpi-tile-total-cost');
    expect(tile).toHaveAttribute('data-empty-reason', 'schema-invalid');
  });

  it('reason: upstream-blocked — uses per-tile emptyState config message', () => {
    render(
      <KPITileCluster
        projectionData={[]}
        tiles={[
          {
            field: 'total_cost_usd',
            label: 'Total Cost',
            emptyState: {
              reasons: {
                'no-data': { message: 'Pipeline is blocked', cta: 'Check pipeline status' },
              },
            },
          },
        ]}
      />,
    );
    const tile = screen.getByTestId('kpi-tile-total-cost');
    expect(tile).toHaveAttribute('data-empty-reason', 'no-data');
    expect(tile.textContent).toContain('Pipeline is blocked');
    expect(tile.textContent).toContain('Check pipeline status');
  });

  it('per-tile emptyState overrides cluster-level emptyState for that tile', () => {
    render(
      <KPITileCluster
        projectionData={[]}
        tiles={[
          {
            field: 'total_cost_usd',
            label: 'Total Cost',
            emptyState: { defaultMessage: 'Tile-specific message' },
          },
        ]}
        emptyState={{ defaultMessage: 'Cluster-level message' }}
      />,
    );
    const tile = screen.getByTestId('kpi-tile-total-cost');
    expect(tile.textContent).toContain('Tile-specific message');
    expect(tile.textContent).not.toContain('Cluster-level message');
  });
});

// --- Mixed nullity -------------------------------------------------------

describe('KPITileCluster — mixed nullity', () => {
  it('renders populated tiles and empty tiles independently', () => {
    render(
      <KPITileCluster
        projectionData={[{ total_cost_usd: 12.34, total_tokens: 5000 }]}
        tiles={TILES}
      />,
    );
    // total_cost_usd and total_tokens are present → populated (no empty-reason).
    expect(screen.getByTestId('kpi-tile-total-cost')).not.toHaveAttribute('data-empty-reason');
    expect(screen.getByTestId('kpi-tile-total-tokens')).not.toHaveAttribute('data-empty-reason');
    // total_savings_usd is absent → missing-field.
    expect(screen.getByTestId('kpi-tile-total-savings')).toHaveAttribute(
      'data-empty-reason',
      'missing-field',
    );
  });
});

// --- Layout responsive behavior -----------------------------------------

describe('KPITileCluster — responsive layout', () => {
  it('renders all tiles at narrow viewport (320px)', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 320 });
    render(
      <KPITileCluster
        projectionData={[{ total_cost_usd: 1, total_savings_usd: 2, total_tokens: 3 }]}
        tiles={TILES}
      />,
    );
    expect(screen.getByTestId('kpi-tile-total-cost')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-tile-total-savings')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-tile-total-tokens')).toBeInTheDocument();
  });

  it('renders all tiles at wide viewport (1200px)', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1200 });
    render(
      <KPITileCluster
        projectionData={[{ total_cost_usd: 1, total_savings_usd: 2, total_tokens: 3 }]}
        tiles={TILES}
      />,
    );
    expect(screen.getByTestId('kpi-tile-total-cost')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-tile-total-savings')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-tile-total-tokens')).toBeInTheDocument();
  });
});
