import type { Meta, StoryObj } from '@storybook/react-vite';
import TraceExplorerWidget from './TraceExplorerWidget';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';
import { buildTraceGroups } from '@/storybook/fixtures/trace-explorer';

const QUERY_KEY = ['trace-explorer'];

const meta: Meta<typeof TraceExplorerWidget> = {
  title: 'Dashboard / TraceExplorer',
  component: TraceExplorerWidget,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof TraceExplorerWidget>;

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
      prefetched: [{ queryKey: QUERY_KEY, data: buildTraceGroups({ count: 5 }) }],
    }),
  ],
};

export const WithRunningTrace: Story = {
  decorators: [
    makeDashboardDecorator({
      prefetched: [
        {
          queryKey: QUERY_KEY,
          data: buildTraceGroups({ count: 4, includeRunning: true, includeErrors: false }),
        },
      ],
    }),
  ],
};

export const ErrorTraces: Story = {
  decorators: [
    makeDashboardDecorator({
      prefetched: [
        {
          queryKey: QUERY_KEY,
          data: buildTraceGroups({ count: 6, includeRunning: false, includeErrors: true }),
        },
      ],
    }),
  ],
};

export const Loading: Story = {
  decorators: [makeDashboardDecorator({ forceLoading: true })],
};
