import type { Meta, StoryObj } from '@storybook/react-vite';
import CostSavingsOverviewWidget from './CostSavingsOverviewWidget';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';
import { buildCostSavingsOverview } from '@/storybook/fixtures/cost-savings-overview';
import { TOPICS } from '@shared/types/topics';

const QUERY_KEY = ['cost-savings-overview', TOPICS.costSavingsOverview] as const;

const meta: Meta<typeof CostSavingsOverviewWidget> = {
  title: 'Dashboard / CostSavingsOverviewWidget',
  component: CostSavingsOverviewWidget,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof CostSavingsOverviewWidget>;

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
          data: [buildCostSavingsOverview({ window: '7d', localRatio: 0.75, provisioned: false })],
        },
      ],
    }),
  ],
};

export const WithWarnings: Story = {
  args: { config: { showWarnings: true } },
  decorators: [
    makeDashboardDecorator({
      prefetched: [
        {
          queryKey: [...QUERY_KEY],
          data: [
            buildCostSavingsOverview({
              window: '30d',
              includeWarnings: true,
              localRatio: 0.68,
            }),
          ],
        },
      ],
    }),
  ],
};

export const HighCloudRatio: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      prefetched: [
        {
          queryKey: [...QUERY_KEY],
          data: [buildCostSavingsOverview({ localRatio: 0.20, window: '24h' })],
        },
      ],
    }),
  ],
};

export const AllLocal: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      prefetched: [
        {
          queryKey: [...QUERY_KEY],
          data: [buildCostSavingsOverview({ localRatio: 1.0, window: '7d' })],
        },
      ],
    }),
  ],
};
