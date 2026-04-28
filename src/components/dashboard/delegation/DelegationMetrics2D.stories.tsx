import type { Meta, StoryObj } from '@storybook/react-vite';
import DelegationMetrics2D from './DelegationMetrics2D';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';
import { buildDelegationMetrics } from '@/storybook/fixtures/delegation';

const meta: Meta<typeof DelegationMetrics2D> = {
  title: 'Dashboard / DelegationMetrics2D',
  component: DelegationMetrics2D,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof DelegationMetrics2D>;

export const Empty: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      prefetched: [{ queryKey: ['delegation-summary'], data: [] }],
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
          queryKey: ['delegation-summary'],
          data: [buildDelegationMetrics()],
        },
      ],
    }),
  ],
};

export const SingleAgentDominant: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      prefetched: [
        {
          queryKey: ['delegation-summary'],
          data: [buildDelegationMetrics({ profile: 'single-dominant' })],
        },
      ],
    }),
  ],
};
