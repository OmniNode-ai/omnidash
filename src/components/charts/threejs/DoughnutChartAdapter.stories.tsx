// Storybook stories for DoughnutChartAdapter (OMN-10291).
//
// DoughnutChartAdapter is the manifest-dispatchable wrapper for the 3D pie
// chart (cost-by-model-3d). It accepts pre-reduced projection rows and
// delegates rendering to ThreePieChart from CostByModelPie.
//
// Stories drive the two canonical paths:
//   - Populated: 4 models with varying cost shares
//   - Empty: no projection rows → empty state rendered by ComponentWrapper
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DoughnutChartAdapter } from './DoughnutChartAdapter';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';

const meta: Meta<typeof DoughnutChartAdapter> = {
  title: 'Charts / DoughnutChartAdapter',
  component: DoughnutChartAdapter,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ width: 560, height: 380 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof DoughnutChartAdapter>;

const POPULATED_ROWS = [
  { model_name: 'deepseek-r1-32b', total_cost_usd: '3.00', bucket_time: '2026-04-20T01:00:00Z' },
  { model_name: 'claude-sonnet-4-6', total_cost_usd: '1.00', bucket_time: '2026-04-20T01:00:00Z' },
  { model_name: 'qwen3-coder-30b', total_cost_usd: '1.00', bucket_time: '2026-04-20T01:00:00Z' },
  { model_name: 'gpt-4o', total_cost_usd: '0.50', bucket_time: '2026-04-20T01:00:00Z' },
];

export const Populated: Story = {
  decorators: [makeDashboardDecorator({})],
  args: {
    projectionData: POPULATED_ROWS,
    fieldMappings: { label: 'model_name', value: 'total_cost_usd' },
    emptyState: { defaultMessage: 'No cost data available' },
  },
};

export const Empty: Story = {
  decorators: [makeDashboardDecorator({})],
  args: {
    projectionData: [],
    fieldMappings: { label: 'model_name', value: 'total_cost_usd' },
    emptyState: { defaultMessage: 'No cost data available' },
  },
};

export const DominantModel: Story = {
  decorators: [makeDashboardDecorator({})],
  args: {
    projectionData: [
      { model_name: 'deepseek-r1-32b', total_cost_usd: '17.00', bucket_time: '2026-04-20T01:00:00Z' },
      { model_name: 'claude-sonnet-4-6', total_cost_usd: '1.00', bucket_time: '2026-04-20T01:00:00Z' },
      { model_name: 'qwen3-coder-30b', total_cost_usd: '1.00', bucket_time: '2026-04-20T01:00:00Z' },
      { model_name: 'gpt-4o', total_cost_usd: '1.00', bucket_time: '2026-04-20T01:00:00Z' },
    ],
    fieldMappings: { label: 'model_name', value: 'total_cost_usd' },
    emptyState: { defaultMessage: 'No cost data available' },
  },
};
