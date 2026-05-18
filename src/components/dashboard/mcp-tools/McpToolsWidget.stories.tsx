import type { Meta, StoryObj } from '@storybook/react-vite';
import McpToolsWidget from './McpToolsWidget';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';
import { buildMcpToolRows } from '@/storybook/fixtures';

const QUERY_KEY = ['mcp-tools'];
const ANCHOR = '2026-05-18T10:00:00Z';

const meta: Meta<typeof McpToolsWidget> = {
  title: 'Dashboard / McpToolsWidget',
  component: McpToolsWidget,
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
type Story = StoryObj<typeof McpToolsWidget>;

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
      prefetched: [{
        queryKey: QUERY_KEY,
        data: buildMcpToolRows(3, { includeNew: true, anchorAt: ANCHOR }),
      }],
    }),
  ],
};

export const NoNewBadge: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      prefetched: [{
        queryKey: QUERY_KEY,
        data: buildMcpToolRows(3, { includeNew: false, anchorAt: ANCHOR }),
      }],
    }),
  ],
};
