import type { Meta, StoryObj } from '@storybook/react-vite';
import DelegationTokenUsageWidget from './DelegationTokenUsageWidget';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';
import { buildDelegationTokenUsage } from '@/storybook/fixtures/delegation-routing';
import { TOPICS } from '@shared/types/topics';

const QUERY_KEY = ['delegation-token-usage', TOPICS.delegationTokenUsage] as const;

const meta: Meta<typeof DelegationTokenUsageWidget> = {
  title: 'Dashboard / DelegationTokenUsageWidget',
  component: DelegationTokenUsageWidget,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof DelegationTokenUsageWidget>;

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
      prefetched: [{ queryKey: [...QUERY_KEY], data: [buildDelegationTokenUsage()] }],
    }),
  ],
};

export const NoCost: Story = {
  args: { config: { showCost: false, showProvenance: true } },
  decorators: [
    makeDashboardDecorator({
      prefetched: [{ queryKey: [...QUERY_KEY], data: [buildDelegationTokenUsage()] }],
    }),
  ],
};

export const NoProvenance: Story = {
  args: { config: { showCost: true, showProvenance: false } },
  decorators: [
    makeDashboardDecorator({
      prefetched: [{ queryKey: [...QUERY_KEY], data: [buildDelegationTokenUsage()] }],
    }),
  ],
};
