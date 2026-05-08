import type { Meta, StoryObj } from '@storybook/react-vite';
import DelegationSavingsWidget from './DelegationSavingsWidget';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';
import { buildDelegationSavings } from '@/storybook/fixtures/delegation-routing';
import { TOPICS } from '@shared/types/topics';

const QUERY_KEY = ['delegation-savings', TOPICS.delegationSavings] as const;

const meta: Meta<typeof DelegationSavingsWidget> = {
  title: 'Dashboard / DelegationSavingsWidget',
  component: DelegationSavingsWidget,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof DelegationSavingsWidget>;

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
      prefetched: [{ queryKey: [...QUERY_KEY], data: [buildDelegationSavings({ sessionCount: 5 })] }],
    }),
  ],
};

export const Manysessions: Story = {
  args: { config: { maxSessions: 3 } },
  decorators: [
    makeDashboardDecorator({
      prefetched: [{ queryKey: [...QUERY_KEY], data: [buildDelegationSavings({ sessionCount: 5 })] }],
    }),
  ],
};

export const Provisioned: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      prefetched: [{ queryKey: [...QUERY_KEY], data: [buildDelegationSavings({ provisioned: true })] }],
    }),
  ],
};
