import type { Meta, StoryObj } from '@storybook/react-vite';
import IntentDistributionWidget from './IntentDistributionWidget';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';
import { buildIntentDistribution } from '@/storybook/fixtures/intent-distribution';

const QUERY_KEY = ['intent-distribution'];

const meta: Meta<typeof IntentDistributionWidget> = {
  title: 'Dashboard / IntentDistribution',
  component: IntentDistributionWidget,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof IntentDistributionWidget>;

export const Empty: Story = {
  decorators: [
    makeDashboardDecorator({
      prefetched: [{ queryKey: QUERY_KEY, data: [] }],
    }),
  ],
};

export const Populated: Story = {
  decorators: [
    makeDashboardDecorator({
      prefetched: [{ queryKey: QUERY_KEY, data: buildIntentDistribution() }],
    }),
  ],
};

export const Loading: Story = {
  decorators: [makeDashboardDecorator({ forceLoading: true })],
};

export const Error: Story = {
  decorators: [makeDashboardDecorator({ forceError: true })],
};
