import type { Meta, StoryObj } from '@storybook/react-vite';
import { SavingsSeries } from './SavingsSeriesWidget';

const meta: Meta<typeof SavingsSeries> = {
  title: 'Dashboard / SavingsSeries',
  component: SavingsSeries,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof SavingsSeries>;

const day = (window_start: string, savings_usd: string | null, runs_total: number) => ({
  tenant_id: 'tenant-a', window_kind: 'day', window_start, baseline_model: 'claude-sonnet-5-5',
  baseline_state: 'resolved', runs_total, savings_usd, as_of: '2026-10-02T12:00:00Z',
});

export const Empty: Story = { args: { rows: [] } };
export const Populated: Story = {
  args: { rows: [day('2026-09-30', '0.85', 4), day('2026-10-01', null, 1), day('2026-10-02', '1.20', 3)] },
};
