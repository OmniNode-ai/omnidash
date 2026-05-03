import type { Meta, StoryObj } from '@storybook/react-vite';
import LiveEventStreamWidget from './LiveEventStreamWidget';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';
import { buildLiveEvents } from '@/storybook/fixtures/live-events';

const QUERY_KEY = ['live-event-stream'];

const meta: Meta<typeof LiveEventStreamWidget> = {
  title: 'Dashboard / LiveEventStream',
  component: LiveEventStreamWidget,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof LiveEventStreamWidget>;

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
      prefetched: [{ queryKey: QUERY_KEY, data: buildLiveEvents(25) }],
    }),
  ],
};

export const HighVolume: Story = {
  decorators: [
    makeDashboardDecorator({
      prefetched: [{ queryKey: QUERY_KEY, data: buildLiveEvents(120) }],
    }),
  ],
};

export const Loading: Story = {
  decorators: [makeDashboardDecorator({ forceLoading: true })],
};

export const Error: Story = {
  decorators: [makeDashboardDecorator({ forceError: true })],
};
