import type { Meta, StoryObj } from '@storybook/react-vite';
import DelegationModelOutputWidget from './DelegationModelOutputWidget';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';
import { buildInferenceResponseProjection } from '@/storybook/fixtures/delegation-routing';
import { TOPICS } from '@shared/types/topics';

const QUERY_KEY = ['delegation-model-output', TOPICS.inferenceResponseText] as const;

const meta: Meta<typeof DelegationModelOutputWidget> = {
  title: 'Dashboard / DelegationModelOutputWidget',
  component: DelegationModelOutputWidget,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof DelegationModelOutputWidget>;

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
      prefetched: [
        {
          queryKey: [...QUERY_KEY],
          data: [buildInferenceResponseProjection()],
        },
      ],
    }),
  ],
};

export const FixtureMode: Story = {
  name: 'Fixture Mode (offline, no .201)',
  args: { config: { showFullOutput: true, maxHistory: 2 } },
  decorators: [
    makeDashboardDecorator({
      prefetched: [
        {
          queryKey: [...QUERY_KEY],
          data: [buildInferenceResponseProjection({ provisioned: false, responseCount: 3 })],
        },
      ],
    }),
  ],
};

export const Provisioned: Story = {
  name: 'Live (provisioned=true)',
  args: { config: { showFullOutput: true } },
  decorators: [
    makeDashboardDecorator({
      prefetched: [
        {
          queryKey: [...QUERY_KEY],
          data: [buildInferenceResponseProjection({ provisioned: true })],
        },
      ],
    }),
  ],
};

export const SingleResponse: Story = {
  args: { config: { maxHistory: 0 } },
  decorators: [
    makeDashboardDecorator({
      prefetched: [
        {
          queryKey: [...QUERY_KEY],
          data: [buildInferenceResponseProjection({ responseCount: 1 })],
        },
      ],
    }),
  ],
};
