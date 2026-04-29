// Tests for CostTrendAdapter — the ITrendChartAdapter bridge component.
// Verifies manifest dispatch: adapter receives projection data and renders via TrendChartThreeJs.
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CostTrendAdapter from './CostTrendAdapter';

// Stub projection query — adapter must pass data through to TrendChartThreeJs.
vi.mock('@/hooks/useProjectionQuery', () => ({
  useProjectionQuery: vi.fn(),
}));

// Stub TrendChartThreeJs to capture received props.
vi.mock('@/components/charts/threejs/TrendChart', () => ({
  TrendChartThreeJs: ({
    projectionData,
    fieldMappings,
    orderingAuthority,
  }: {
    projectionData: unknown[];
    fieldMappings: Record<string, unknown>;
    orderingAuthority: Record<string, unknown>;
  }) => (
    <div
      data-testid="trend-chart-threejs"
      data-row-count={projectionData.length}
      data-x={fieldMappings.x}
      data-y={fieldMappings.y}
      data-group={fieldMappings.group}
      data-granularity={fieldMappings.granularity}
      data-chart-type={fieldMappings.chartType}
      data-ordering-authority={orderingAuthority?.authority}
      data-ordering-direction={orderingAuthority?.direction}
    />
  ),
}));

import { useProjectionQuery } from '@/hooks/useProjectionQuery';

const mockQuery = useProjectionQuery as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockQuery.mockReturnValue({ data: [], isLoading: false, error: null });
});

describe('CostTrendAdapter — manifest dispatch to ITrendChartAdapter', () => {
  it('resolves to TrendChartThreeJs (ITrendChartAdapter impl)', () => {
    render(<CostTrendAdapter config={{}} />);
    expect(screen.getByTestId('trend-chart-threejs')).toBeInTheDocument();
  });

  it('passes projectionData from the llmCost query to TrendChartThreeJs', () => {
    const rows = [
      { bucket_time: '2026-04-29T00:00:00Z', model_name: 'gpt-4o', total_cost_usd: 1.2 },
      { bucket_time: '2026-04-29T01:00:00Z', model_name: 'gpt-4o', total_cost_usd: 0.8 },
    ];
    mockQuery.mockReturnValue({ data: rows, isLoading: false, error: null });
    render(<CostTrendAdapter config={{}} />);
    expect(screen.getByTestId('trend-chart-threejs')).toHaveAttribute('data-row-count', '2');
  });

  it('declares bucket_time as x-field and total_cost_usd as y-field', () => {
    render(<CostTrendAdapter config={{}} />);
    const el = screen.getByTestId('trend-chart-threejs');
    expect(el).toHaveAttribute('data-x', 'bucket_time');
    expect(el).toHaveAttribute('data-y', 'total_cost_usd');
    expect(el).toHaveAttribute('data-group', 'model_name');
  });

  it('forwards granularity config to fieldMappings (default: hour)', () => {
    render(<CostTrendAdapter config={{}} />);
    expect(screen.getByTestId('trend-chart-threejs')).toHaveAttribute('data-granularity', 'hour');
  });

  it('forwards granularity=day to fieldMappings', () => {
    render(<CostTrendAdapter config={{ granularity: 'day' }} />);
    expect(screen.getByTestId('trend-chart-threejs')).toHaveAttribute('data-granularity', 'day');
  });

  it('maps style=area to chartType=area (default)', () => {
    render(<CostTrendAdapter config={{}} />);
    expect(screen.getByTestId('trend-chart-threejs')).toHaveAttribute('data-chart-type', 'area');
  });

  it('maps style=bar to chartType=bar', () => {
    render(<CostTrendAdapter config={{ style: 'bar' }} />);
    expect(screen.getByTestId('trend-chart-threejs')).toHaveAttribute('data-chart-type', 'bar');
  });

  it('declares bucket_time ordering authority with ascending direction', () => {
    render(<CostTrendAdapter config={{}} />);
    const el = screen.getByTestId('trend-chart-threejs');
    expect(el).toHaveAttribute('data-ordering-authority', 'bucket_time');
    expect(el).toHaveAttribute('data-ordering-direction', 'asc');
  });
});
