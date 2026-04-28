import type { Meta, StoryObj } from '@storybook/react-vite';
import CostTrendPanel from './CostTrend2D';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';
import { buildCostDataPoints } from '@/storybook/fixtures/cost';

/**
 * Stories for `CostTrendPanel`. The widget calls
 * `useProjectionQuery({ queryKey: ['cost-trends', granularity], ... })`
 * — stories seed the QueryClient cache at that exact key via
 * `makeDashboardDecorator({ prefetched })`.
 *
 * The compliance scorecard (`src/storybook-coverage-compliance.test.ts`,
 * Phase 2) greps this file for `export const Empty` and
 * `export const Populated` — both literal names must be present.
 * `Populated_Area` and `Populated_Bar` add the chart-type variants
 * called out in plan Task 6.
 */
const meta: Meta<typeof CostTrendPanel> = {
  title: 'Dashboard / CostTrendPanel',
  component: CostTrendPanel,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof CostTrendPanel>;

const HOUR_KEY = ['cost-trends', 'hour'] as const;

// A fixed anchor so renders are deterministic across reloads — the
// fixture builder otherwise walks back from `Date.now()`, which causes
// the bucket axis to shift on every story render.
const ANCHOR = new Date('2026-04-20T12:00:00Z').getTime();

export const Empty: Story = {
  args: { config: { granularity: 'hour' } },
  decorators: [
    makeDashboardDecorator({
      prefetched: [{ queryKey: [...HOUR_KEY], data: [] }],
    }),
  ],
};

export const Loading: Story = {
  args: { config: { granularity: 'hour' } },
  decorators: [makeDashboardDecorator({ forceLoading: true })],
};

export const Error: Story = {
  args: { config: { granularity: 'hour' } },
  decorators: [makeDashboardDecorator({ forceError: true })],
};

// Canonical `Populated` export — required by the Phase 2 compliance
// grep. Mirrors `Populated_Area` so reviewers see the same realistic
// dataset under the canonical name.
export const Populated: Story = {
  args: { config: { granularity: 'hour', chartType: 'area' } },
  decorators: [
    makeDashboardDecorator({
      prefetched: [
        {
          queryKey: [...HOUR_KEY],
          data: buildCostDataPoints(50, { models: ['claude-sonnet-4-6', 'gpt-5-mini', 'deepseek-r1-32b'], endTime: ANCHOR }),
        },
      ],
    }),
  ],
};

export const Populated_Area: Story = {
  args: { config: { granularity: 'hour', chartType: 'area' } },
  decorators: [
    makeDashboardDecorator({
      prefetched: [
        {
          queryKey: [...HOUR_KEY],
          data: buildCostDataPoints(50, { models: ['claude-sonnet-4-6', 'gpt-5-mini', 'deepseek-r1-32b'], endTime: ANCHOR }),
        },
      ],
    }),
  ],
};

export const Populated_Bar: Story = {
  args: { config: { granularity: 'hour', chartType: 'bar' } },
  decorators: [
    makeDashboardDecorator({
      prefetched: [
        {
          queryKey: [...HOUR_KEY],
          data: buildCostDataPoints(50, { models: ['claude-sonnet-4-6', 'gpt-5-mini', 'deepseek-r1-32b'], endTime: ANCHOR }),
        },
      ],
    }),
  ],
};

// Single-model dataset — exercises the legend's single-row layout and
// the StackedChart's degenerate single-band case.
export const SingleModel: Story = {
  args: { config: { granularity: 'hour', chartType: 'area' } },
  decorators: [
    makeDashboardDecorator({
      prefetched: [
        {
          queryKey: [...HOUR_KEY],
          data: buildCostDataPoints(40, { models: ['claude-sonnet-4-6'], endTime: ANCHOR }),
        },
      ],
    }),
  ],
};

// Six-model dataset — exercises the legend's flex-wrap behavior and
// the chart palette's color cycling beyond the first few entries.
export const ManyModels: Story = {
  args: { config: { granularity: 'hour', chartType: 'area' } },
  decorators: [
    makeDashboardDecorator({
      prefetched: [
        {
          queryKey: [...HOUR_KEY],
          data: buildCostDataPoints(40, {
            models: [
              'claude-sonnet-4-6',
              'claude-opus-4-7',
              'gpt-5-mini',
              'gpt-5',
              'deepseek-r1-32b',
              'qwen3-coder-30b',
            ],
            endTime: ANCHOR,
          }),
        },
      ],
    }),
  ],
};
