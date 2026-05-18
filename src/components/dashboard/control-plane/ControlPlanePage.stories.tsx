import type { Meta, StoryObj } from '@storybook/react-vite';
import ControlPlanePage from './ControlPlanePage';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';
import { buildPipelineEvents } from '@/storybook/fixtures';

const QUERY_KEY = ['hackathon-pipeline-events'];
const ANCHOR = '2026-05-17T10:30:00Z';

const meta: Meta<typeof ControlPlanePage> = {
  title: 'Dashboard / ControlPlanePage',
  component: ControlPlanePage,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ minWidth: 480 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof ControlPlanePage>;

export const Empty: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      prefetched: [{ queryKey: QUERY_KEY, data: [] }],
    }),
  ],
};

export const Loading: Story = {
  args: { config: {} },
  decorators: [makeDashboardDecorator({ forceLoading: true })],
};

export const Error: Story = {
  args: { config: {} },
  decorators: [makeDashboardDecorator({ forceError: true })],
};

export const Populated: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      prefetched: [
        {
          queryKey: QUERY_KEY,
          data: buildPipelineEvents({ runs: 2, anchorAt: ANCHOR }),
        },
      ],
    }),
  ],
};
