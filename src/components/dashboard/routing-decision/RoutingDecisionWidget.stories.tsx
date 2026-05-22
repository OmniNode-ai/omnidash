import type { Meta, StoryObj } from '@storybook/react-vite';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';
import { buildRoutingDecisionProjection } from '@/storybook/fixtures/routing-decision';
import { TOPICS } from '@shared/types/topics';
import RoutingDecisionWidget from './RoutingDecisionWidget';

const meta: Meta<typeof RoutingDecisionWidget> = {
  title: 'Dashboard/RoutingDecisionWidget',
  component: RoutingDecisionWidget,
};

export default meta;
type Story = StoryObj<typeof RoutingDecisionWidget>;

const QUERY_KEY = ['routing-decision-widget', TOPICS.routingDecision];

export const Populated: Story = {
  decorators: [
    makeDashboardDecorator({
      prefetched: [
        {
          queryKey: QUERY_KEY,
          data: [buildRoutingDecisionProjection({ provisioned: true })],
        },
      ],
    }),
  ],
};

export const UpstreamBlocked: Story = {
  decorators: [
    makeDashboardDecorator({
      prefetched: [
        {
          queryKey: QUERY_KEY,
          data: [buildRoutingDecisionProjection({ provisioned: false })],
        },
      ],
    }),
  ],
};

export const Empty: Story = {
  decorators: [
    makeDashboardDecorator({
      prefetched: [{ queryKey: QUERY_KEY, data: [] }],
    }),
  ],
};

export const Loading: Story = {
  decorators: [makeDashboardDecorator({ forceLoading: true })],
};

export const Error: Story = {
  decorators: [makeDashboardDecorator({ forceError: true })],
};
