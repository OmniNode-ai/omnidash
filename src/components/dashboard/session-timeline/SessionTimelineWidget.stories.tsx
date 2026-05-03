import type { Meta, StoryObj } from '@storybook/react-vite';
import SessionTimelineWidget from './SessionTimelineWidget';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';
import { buildSessionTimeline } from '@/storybook/fixtures/session-timeline';

const QUERY_KEY = ['session-timeline'];

const meta: Meta<typeof SessionTimelineWidget> = {
  title: 'Dashboard / SessionTimeline',
  component: SessionTimelineWidget,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof SessionTimelineWidget>;

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
      prefetched: [{ queryKey: QUERY_KEY, data: buildSessionTimeline(30) }],
    }),
  ],
};

export const Loading: Story = {
  decorators: [makeDashboardDecorator({ forceLoading: true })],
};

export const Error: Story = {
  decorators: [makeDashboardDecorator({ forceError: true })],
};
