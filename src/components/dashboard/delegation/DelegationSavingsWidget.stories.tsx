import type { Meta, StoryObj } from '@storybook/react-vite';
import DelegationSavingsWidget from './DelegationSavingsWidget';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';
import { buildDelegationSavings } from '@/storybook/fixtures/delegation-routing';
import { TOPICS } from '@shared/types/topics';

const QUERY_KEY = ['delegation-savings', TOPICS.delegationSavings] as const;

const meta: Meta<typeof DelegationSavingsWidget> = {
  title: 'Dashboard / DelegationSavingsWidget',
  component: DelegationSavingsWidget,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof DelegationSavingsWidget>;

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
      prefetched: [{ queryKey: [...QUERY_KEY], data: [buildDelegationSavings({ sessionCount: 5 })] }],
    }),
  ],
};

export const LiveRuntimeDemo: Story = {
  args: { config: { showSessions: true } },
  decorators: [
    makeDashboardDecorator({
      prefetched: [{
        queryKey: [...QUERY_KEY],
        data: [{
          cumulative_savings_usd: 0.01533,
          cumulative_local_cost_usd: 0,
          cumulative_cloud_cost_usd: 0.01533,
          baseline_model: 'claude-opus-4.1',
          pricing_manifest_version: 'runtime-delegation-events',
          session_count: 2,
          sessions: [
            {
              session_id: '4ae8556b-af7c-4e85-a7f5-9388d60cebb5',
              task_type: 'test',
              model_name: 'Qwen3-Coder-30B-A3B-Instruct-AWQ-4bit',
              prompt_tokens: 144,
              completion_tokens: 593,
              tokens_to_compliance: 737,
              latency_ms: 3237,
              local_cost_usd: 0,
              cloud_cost_usd: 0.009327,
              savings_usd: 0.009327,
              baseline_model: 'claude-opus-4.1',
              pricing_manifest_version: 'runtime-delegation-events',
              savings_method: 'measured',
              usage_source: 'measured',
              created_at: '2026-05-20T12:03:00Z',
            },
            {
              session_id: 'f9243395-5cb6-4036-8ffb-39dd25547413',
              task_type: 'document',
              model_name: 'Qwen3-Coder-30B-A3B-Instruct-AWQ-4bit',
              prompt_tokens: 81,
              completion_tokens: 384,
              tokens_to_compliance: 465,
              latency_ms: 2109,
              local_cost_usd: 0,
              cloud_cost_usd: 0.006003,
              savings_usd: 0.006003,
              baseline_model: 'claude-opus-4.1',
              pricing_manifest_version: 'runtime-delegation-events',
              savings_method: 'measured',
              usage_source: 'measured',
              created_at: '2026-05-20T12:01:00Z',
            },
          ],
          captured_at: '2026-05-20T12:03:30Z',
          provisioned: true,
        }],
      }],
    }),
  ],
};

export const Manysessions: Story = {
  args: { config: { maxSessions: 3 } },
  decorators: [
    makeDashboardDecorator({
      prefetched: [{ queryKey: [...QUERY_KEY], data: [buildDelegationSavings({ sessionCount: 5 })] }],
    }),
  ],
};

export const Provisioned: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      prefetched: [{ queryKey: [...QUERY_KEY], data: [buildDelegationSavings({ provisioned: true })] }],
    }),
  ],
};
