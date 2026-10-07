import type { Meta, StoryObj } from '@storybook/react-vite';
import { UsageByModelDayTable } from './UsageByModelDayWidget';

const meta: Meta<typeof UsageByModelDayTable> = {
  title: 'Dashboard / UsageByModelDay',
  component: UsageByModelDayTable,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof UsageByModelDayTable>;

export const Empty: Story = { args: { rows: [] } };
export const Populated: Story = {
  args: {
    rows: [
      { tenant_id: 'tenant-a', usage_day: '2026-10-02', model_id: 'Qwen3.8-27B', input_tokens: 1620, output_tokens: 520, cost_usd: 0.25, measured_cost_usd: 0.25, unmeasured_call_count: 0, call_count: 10 },
      { tenant_id: 'tenant-a', usage_day: '2026-10-02', model_id: 'glm-4.6', input_tokens: 300, output_tokens: 30, cost_usd: 9.25, measured_cost_usd: 0.25, unmeasured_call_count: 1, call_count: 2 },
      { tenant_id: 'tenant-a', usage_day: '2026-10-01', model_id: 'glm-4.6', input_tokens: 90, output_tokens: 9, cost_usd: 4, measured_cost_usd: null, unmeasured_call_count: 1, call_count: 1 },
    ],
  },
};
