import type { Meta, StoryObj } from '@storybook/react-vite';
import DelegationModelRoutingWidget from './DelegationModelRoutingWidget';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';
import { buildDelegationModelRouting } from '@/storybook/fixtures/delegation-routing';
import { TOPICS } from '@shared/types/topics';

const QUERY_KEY = ['delegation-model-routing', TOPICS.delegationModelRouting] as const;

const meta: Meta<typeof DelegationModelRoutingWidget> = {
  title: 'Dashboard / DelegationModelRoutingWidget',
  component: DelegationModelRoutingWidget,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof DelegationModelRoutingWidget>;

export const Empty: Story = {
  args: { config: {} },
  decorators: [makeDashboardDecorator({ prefetched: [{ queryKey: [...QUERY_KEY], data: [] }] })],
};

export const Loading: Story = {
  args: { config: {} },
  decorators: [makeDashboardDecorator({ forceLoading: true })],
};

export const Populated: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      prefetched: [{ queryKey: [...QUERY_KEY], data: [buildDelegationModelRouting()] }],
    }),
  ],
};

export const NoTaskBreakdown: Story = {
  args: { config: { showTaskBreakdown: false } },
  decorators: [
    makeDashboardDecorator({
      prefetched: [{ queryKey: [...QUERY_KEY], data: [buildDelegationModelRouting()] }],
    }),
  ],
};
