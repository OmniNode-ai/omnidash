import type { Meta, StoryObj } from '@storybook/react-vite';
import DelegationCostBreakdownWidget from './DelegationCostBreakdownWidget';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';
import { TOPICS } from '@shared/types/topics';
import type { CostAggregateRow } from './DelegationCostBreakdownWidget';

const QUERY_KEY = ['delegation-cost-breakdown', TOPICS.costSummary] as const;

const meta: Meta<typeof DelegationCostBreakdownWidget> = {
  title: 'Dashboard / DelegationCostBreakdownWidget',
  component: DelegationCostBreakdownWidget,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof DelegationCostBreakdownWidget>;

export const Empty: Story = {
  args: { config: {} },
  decorators: [makeDashboardDecorator({ prefetched: [{ queryKey: [...QUERY_KEY], data: [] }] })],
};

export const Loading: Story = {
  args: { config: {} },
  decorators: [makeDashboardDecorator({ forceLoading: true })],
};

const POPULATED_ROWS: CostAggregateRow[] = [
  {
    aggregation_key: 'model:claude-sonnet-4-6',
    window: '24h',
    total_cost_usd: '4.821300',
    total_tokens: 1_284_112,
    call_count: 214,
    updated_at: '2026-08-04T16:00:00Z',
  },
  {
    aggregation_key: 'model:qwen3-coder-30b',
    window: '24h',
    total_cost_usd: '0.000000',
    total_tokens: 3_940_221,
    call_count: 612,
    updated_at: '2026-08-04T16:00:00Z',
  },
  {
    aggregation_key: 'repo:omnibase_infra',
    window: '24h',
    total_cost_usd: '1.204500',
    total_tokens: 402_118,
    call_count: 88,
    updated_at: '2026-08-04T16:00:00Z',
  },
  {
    aggregation_key: 'model:claude-sonnet-4-6',
    window: '7d',
    total_cost_usd: '28.441200',
    total_tokens: 8_920_004,
    call_count: 1_402,
    updated_at: '2026-08-04T16:00:00Z',
  },
];

export const Populated: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      prefetched: [{ queryKey: [...QUERY_KEY], data: POPULATED_ROWS }],
    }),
  ],
};
