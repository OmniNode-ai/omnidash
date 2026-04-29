// Storybook stories for the TrendChart primitive (ADR 002 compliance).
// TrendChart is a pure rendering primitive — it takes pre-reduced projectionData
// directly, so no QueryClient cache-seeding is needed. The decorator is still
// used to provide ThemeProvider context.
//
// Compliance scorecard (src/storybook-coverage-compliance.test.ts) requires
// at minimum `export const Empty` and `export const Populated`.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { TrendChart } from './TrendChart';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';
import type { TrendChartFieldMapping, EmptyStateConfig } from '@shared/types/chart-config';

const FIELD_MAPPINGS_AREA: TrendChartFieldMapping = {
  x: 'bucket_time',
  y: 'total_cost_usd',
  granularity: 'day',
};

const FIELD_MAPPINGS_BAR: TrendChartFieldMapping & { chartType: 'bar' } = {
  x: 'bucket_time',
  y: 'total_cost_usd',
  granularity: 'week',
  chartType: 'bar' as const,
};

const EMPTY_STATE: EmptyStateConfig = {
  reasons: {
    'no-data': { message: 'No trend data available', cta: 'Check your data pipeline' },
    'missing-field': { message: 'Required projection field missing' },
    'upstream-blocked': { message: 'Upstream pipeline is blocked' },
    'schema-invalid': { message: 'Data does not match declared projection schema' },
  },
};

// Deterministic fixture anchored at a fixed time so renders don't shift.
const ANCHOR = new Date('2026-04-20T00:00:00Z');

function buildTrendRows(buckets: number, models: string[] = ['_value']): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < buckets; i++) {
    const d = new Date(ANCHOR.getTime() + i * 86400000);
    const bucket = d.toISOString().slice(0, 10) + 'T00:00:00Z';
    for (const model of models) {
      rows.push({
        bucket_time: bucket,
        total_cost_usd: Math.abs(Math.sin(i * 0.4 + models.indexOf(model))) * 5 + 0.5,
        model,
      });
    }
  }
  return rows;
}

const meta: Meta<typeof TrendChart> = {
  title: 'Charts / TrendChart',
  component: TrendChart,
  parameters: { layout: 'padded' },
  decorators: [makeDashboardDecorator({})],
};
export default meta;
type Story = StoryObj<typeof TrendChart>;

// Empty — all 4 EmptyStateReason codes configurable; this shows no-data.
export const Empty: Story = {
  args: {
    projectionData: [],
    fieldMappings: FIELD_MAPPINGS_AREA,
    emptyState: EMPTY_STATE,
  },
};

// Populated — single-series area chart (default chartType).
export const Populated: Story = {
  args: {
    projectionData: buildTrendRows(14),
    fieldMappings: FIELD_MAPPINGS_AREA,
    emptyState: EMPTY_STATE,
  },
};

// Populated with bar chartType override — discrete weekly histogram variant.
export const Populated_Bar: Story = {
  args: {
    projectionData: buildTrendRows(8),
    fieldMappings: FIELD_MAPPINGS_BAR,
    emptyState: EMPTY_STATE,
  },
};

// Multi-series area chart using group field.
export const MultiSeries: Story = {
  args: {
    projectionData: buildTrendRows(14, ['claude-sonnet-4-6', 'gpt-5-mini', 'deepseek-r1-32b']),
    fieldMappings: {
      x: 'bucket_time',
      y: 'total_cost_usd',
      group: 'model',
      granularity: 'day',
    },
    emptyState: EMPTY_STATE,
  },
};

// MissingField — exercises the missing-field empty state reason.
export const MissingField: Story = {
  args: {
    projectionData: [{ wrong_bucket: '2026-04-20', total_cost_usd: 1.5 }],
    fieldMappings: FIELD_MAPPINGS_AREA,
    emptyState: EMPTY_STATE,
  },
};
