// Storybook stories for CostByModelBars (T17 / OMN-158).
//
// Same data shape as CostByModelPie (`onex.snapshot.projection.llm_cost.v1`),
// so we reuse buildCostDataPoints. The 2D bar chart sorts by cost desc
// and encodes magnitude by length — the Populated story below exercises
// the multi-bar render path with a balanced split, and the Empty story
// covers the no-data path.
import type { Meta, StoryObj } from '@storybook/react-vite';
import CostByModelBars from './CostByModelBars';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';
import { buildCostDataPoints } from '@/storybook/fixtures/cost';

const QUERY_KEY = ['cost-by-model-2d'] as const;

const meta: Meta<typeof CostByModelBars> = {
  title: 'Dashboard / CostByModelBars',
  component: CostByModelBars,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ width: 480, height: 320 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof CostByModelBars>;

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

export const Populated: Story = {
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
