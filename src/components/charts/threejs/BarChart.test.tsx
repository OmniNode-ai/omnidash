import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BarChart } from './BarChart';
import type { IBarChartAdapter } from '@shared/types/chart-adapter-bar';

// Stub the three.js-backed StackedChart so tests run in jsdom (no WebGL context).
vi.mock('@/components/dashboard/cost-trend/StackedChart', () => ({
  StackedChart: ({
    stacked,
    chartType,
  }: {
    stacked: { buckets: string[]; visibleModels: string[]; maxTotal: number };
    chartType?: string;
  }) => (
    <div
      data-testid="stacked-chart"
      data-bucket-count={stacked.buckets.length}
      data-visible-models={stacked.visibleModels.join(',')}
      data-max-total={stacked.maxTotal}
      data-chart-type={chartType ?? 'area'}
    />
  ),
}));

const BASE_ROWS = [
  { repo: 'omniclaude', cost_usd: 12.45 },
  { repo: 'omnimarket', cost_usd: 8.30 },
  { repo: 'omnidash', cost_usd: 3.75 },
];

describe('BarChart', () => {
  // Compile-time proof: BarChart satisfies IBarChartAdapter.
  // This assignment will fail TypeScript compilation if the prop shape drifts.
  it('satisfies IBarChartAdapter interface at compile time', () => {
    const _check: IBarChartAdapter = BarChart;
    expect(typeof _check).toBe('function');
  });

  describe('empty states', () => {
    it('renders no-data empty state for empty projectionData', () => {
      render(
        <BarChart
          projectionData={[]}
          fieldMappings={{ x: 'repo', y: 'cost_usd' }}
          emptyState={{
            reasons: { 'no-data': { message: 'No cost data available' } },
          }}
        />,
      );
      const container = screen.getByTestId('barchart-canvas');
      expect(container).toBeTruthy();
      expect(container.querySelector('[data-empty-reason="no-data"]')).toBeTruthy();
      expect(screen.getByText('No cost data available')).toBeTruthy();
    });

    it('renders missing-field empty state when y field absent', () => {
      render(
        <BarChart
          projectionData={[{ repo: 'omniclaude' }] as Record<string, unknown>[]}
          fieldMappings={{ x: 'repo', y: 'cost_usd' }}
          emptyState={{
            reasons: { 'missing-field': { message: 'cost_usd field missing' } },
          }}
        />,
      );
      expect(screen.getByText('cost_usd field missing')).toBeTruthy();
      expect(
        screen.getByTestId('barchart-canvas').querySelector('[data-empty-reason="missing-field"]'),
      ).toBeTruthy();
    });

    it('renders schema-invalid empty state when y value is null (non-numeric)', () => {
      render(
        <BarChart
          projectionData={[{ repo: 'omniclaude', cost_usd: null }] as Record<string, unknown>[]}
          fieldMappings={{ x: 'repo', y: 'cost_usd' }}
          emptyState={{
            reasons: { 'schema-invalid': { message: 'Schema validation failed' } },
          }}
        />,
      );
      expect(screen.getByText('Schema validation failed')).toBeTruthy();
      expect(
        screen.getByTestId('barchart-canvas').querySelector('[data-empty-reason="schema-invalid"]'),
      ).toBeTruthy();
    });

    it('does NOT collapse schema-invalid into no-data', () => {
      render(
        <BarChart
          projectionData={[{ repo: 'omniclaude', cost_usd: null }] as Record<string, unknown>[]}
          fieldMappings={{ x: 'repo', y: 'cost_usd' }}
          emptyState={{
            reasons: {
              'schema-invalid': { message: 'Schema invalid' },
              'no-data': { message: 'No data' },
            },
          }}
        />,
      );
      const el = screen.getByTestId('barchart-canvas').querySelector('[data-empty-reason]');
      expect(el?.getAttribute('data-empty-reason')).toBe('schema-invalid');
      expect(el?.getAttribute('data-empty-reason')).not.toBe('no-data');
    });

    it('falls back to defaultMessage when no per-reason override is provided', () => {
      render(
        <BarChart
          projectionData={[]}
          fieldMappings={{ x: 'repo', y: 'cost_usd' }}
          emptyState={{ defaultMessage: 'Fallback message' }}
        />,
      );
      expect(screen.getByText('Fallback message')).toBeTruthy();
    });

    it('falls back to built-in message when no emptyState configured at all', () => {
      render(
        <BarChart
          projectionData={[]}
          fieldMappings={{ x: 'repo', y: 'cost_usd' }}
        />,
      );
      expect(screen.getByText('No data available')).toBeTruthy();
    });

    it('renders CTA when provided', () => {
      render(
        <BarChart
          projectionData={[]}
          fieldMappings={{ x: 'repo', y: 'cost_usd' }}
          emptyState={{
            reasons: {
              'no-data': { message: 'No data', cta: 'Check pipeline status' },
            },
          }}
        />,
      );
      expect(screen.getByText('Check pipeline status')).toBeTruthy();
    });
  });

  describe('populated state', () => {
    it('renders barchart-canvas wrapper', () => {
      render(
        <BarChart
          projectionData={BASE_ROWS}
          fieldMappings={{ x: 'repo', y: 'cost_usd' }}
        />,
      );
      expect(screen.getByTestId('barchart-canvas')).toBeTruthy();
    });

    it('passes chartType="bar" to StackedChart', () => {
      render(
        <BarChart
          projectionData={BASE_ROWS}
          fieldMappings={{ x: 'repo', y: 'cost_usd' }}
        />,
      );
      const chart = screen.getByTestId('stacked-chart');
      expect(chart.getAttribute('data-chart-type')).toBe('bar');
    });

    it('maps x field to correct bucket count', () => {
      render(
        <BarChart
          projectionData={BASE_ROWS}
          fieldMappings={{ x: 'repo', y: 'cost_usd' }}
        />,
      );
      const chart = screen.getByTestId('stacked-chart');
      // 3 unique repo values → 3 buckets
      expect(chart.getAttribute('data-bucket-count')).toBe('3');
    });

    it('maps y field values into maxTotal', () => {
      render(
        <BarChart
          projectionData={BASE_ROWS}
          fieldMappings={{ x: 'repo', y: 'cost_usd' }}
        />,
      );
      const chart = screen.getByTestId('stacked-chart');
      // maxTotal = 12.45 + 8.30 + 3.75 = 24.5 (sum of all, since no groupBy means all bars in one series)
      // Each bucket is one series so maxTotal = max of per-bucket values
      const maxTotal = parseFloat(chart.getAttribute('data-max-total') ?? '0');
      expect(maxTotal).toBeGreaterThan(0);
    });

    it('maps groupBy field to visibleModels', () => {
      const groupedRows = [
        { repo: 'omniclaude', window: '24h', cost_usd: 4.10 },
        { repo: 'omniclaude', window: '7d', cost_usd: 12.45 },
        { repo: 'omnimarket', window: '24h', cost_usd: 2.80 },
        { repo: 'omnimarket', window: '7d', cost_usd: 8.30 },
      ];
      render(
        <BarChart
          projectionData={groupedRows}
          fieldMappings={{ x: 'repo', y: 'cost_usd', group: 'window' }}
        />,
      );
      const chart = screen.getByTestId('stacked-chart');
      const models = chart.getAttribute('data-visible-models') ?? '';
      // Should contain both '24h' and '7d' groups
      expect(models).toContain('24h');
      expect(models).toContain('7d');
    });

    it('uses single "value" series when no groupBy field provided', () => {
      render(
        <BarChart
          projectionData={BASE_ROWS}
          fieldMappings={{ x: 'repo', y: 'cost_usd' }}
        />,
      );
      const chart = screen.getByTestId('stacked-chart');
      expect(chart.getAttribute('data-visible-models')).toBe('value');
    });
  });
});
