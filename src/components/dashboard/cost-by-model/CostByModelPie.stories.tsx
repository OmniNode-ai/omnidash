// Storybook stories for CostByModelPie (OMN-108).
//
// CostByModelPie reads from the same `onex.snapshot.projection.llm_cost.v1`
// projection as the CostTrend widgets, so we reuse `buildCostDataPoints`
// from the cost fixtures. The widget aggregates client-side to
// (model → cost, percentage), so fixture variants drive the pie's
// distribution shape:
//
//   - BalancedSplit: 4 representative models, default `costScale`. Each
//     model lands at roughly 18-32% — exercises the standard
//     multi-slice rendering path and per-model legend rows.
//   - DominantModel: one model is given an inflated cost via
//     `costScale` while the others use a tiny scale, producing one
//     ~85% slice and three thin (~5%) slices. Exercises the
//     hover-pop interaction on a small slice (the slice is still big
//     enough to raycast against, but the hover translation reads
//     cleanly against its narrow wedge angle).
//
// Three.js renders with real WebGL inside the Storybook iframe — no
// canvas mocking. The widget needs ~400×400 to render comfortably
// (the pie scene targets a 260px canvas height inside a flex row that
// also hosts a 180px legend), so we wrap each story in a sized
// container at the meta level.
import type { Meta, StoryObj } from '@storybook/react-vite';
import CostByModelPie from './CostByModelPie';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';
import { buildCostDataPoints } from '@/storybook/fixtures/cost';

const QUERY_KEY = ['cost-by-model'] as const;

const meta: Meta<typeof CostByModelPie> = {
  title: 'Dashboard / CostByModelPie',
  component: CostByModelPie,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ width: 640, height: 420 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof CostByModelPie>;

export const Empty: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      prefetched: [{ queryKey: [...QUERY_KEY], data: [] }],
    }),
  ],
};

export const Loading: Story = {
  args: { config: {} },
  decorators: [makeDashboardDecorator({ forceLoading: true })],
};

// Default 4 models (claude-sonnet-4-6, gpt-5-mini, deepseek-r1-32b,
// qwen3-coder-30b) at the default cost scale produce a relatively
// even distribution with the largest model taking ~30% and the
// smallest ~18% — a balanced multi-slice pie.
export const Populated_BalancedSplit: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      prefetched: [
        {
          queryKey: [...QUERY_KEY],
          data: buildCostDataPoints(24, { seed: 7 }),
        },
      ],
    }),
  ],
};

// One dominant model. We construct two fixture sets and concatenate:
//   - the first uses only `claude-sonnet-4-6` at a high cost scale
//   - the second uses three small-share models at a tiny cost scale
// The aggregate produces a single ~85% wedge plus three ~5% wedges,
// which is the canonical "test the small-slice hover" shape called
// for in the OMN-108 spec.
export const Populated_DominantModel: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      prefetched: [
        {
          queryKey: [...QUERY_KEY],
          data: [
            ...buildCostDataPoints(24, {
              models: ['claude-sonnet-4-6'],
              costScale: 4.0,
              seed: 11,
            }),
            ...buildCostDataPoints(24, {
              models: ['gpt-5-mini', 'deepseek-r1-32b', 'qwen3-coder-30b'],
              costScale: 0.08,
              seed: 13,
            }),
          ],
        },
      ],
    }),
  ],
};

// Compliance alias — `src/storybook-coverage-compliance.test.ts`
// asserts `export const Populated` is present for every widget. The
// canonical "happy path" rendering for this widget is the balanced
// split, so we re-export it under the bare `Populated` name.
export const Populated: Story = Populated_BalancedSplit;
