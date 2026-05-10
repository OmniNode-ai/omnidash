import type { Meta, StoryObj } from '@storybook/react-vite';
import DelegationQualityGateWidget from './DelegationQualityGateWidget';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';
import { buildDelegationQualityGate } from '@/storybook/fixtures/delegation-routing';
import { TOPICS } from '@shared/types/topics';

const QUERY_KEY = ['delegation-quality-gate', TOPICS.delegationQualityGate] as const;

const meta: Meta<typeof DelegationQualityGateWidget> = {
  title: 'Dashboard / DelegationQualityGateWidget',
  component: DelegationQualityGateWidget,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof DelegationQualityGateWidget>;

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
      prefetched: [{ queryKey: [...QUERY_KEY], data: [buildDelegationQualityGate()] }],
    }),
  ],
};

export const LowPassRate: Story = {
  args: { config: { passThreshold: 0.9 } },
  decorators: [
    makeDashboardDecorator({
      prefetched: [
        {
          queryKey: [...QUERY_KEY],
          data: [buildDelegationQualityGate({ overallPassRate: 0.65, includeEscalations: true })],
        },
      ],
    }),
  ],
};

export const HighPassRate: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      prefetched: [
        {
          queryKey: [...QUERY_KEY],
          data: [buildDelegationQualityGate({ overallPassRate: 0.97, includeEscalations: false })],
        },
      ],
    }),
  ],
};

// OMN-10795: variant verifying tokens-to-compliance KPIs render alongside
// the per-model breakdown.
export const PopulatedWithComplianceMetrics: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      prefetched: [
        {
          queryKey: [...QUERY_KEY],
          data: [buildDelegationQualityGate({ includeComplianceMetrics: true })],
        },
      ],
    }),
  ],
};

// OMN-10795: variant verifying the widget gracefully omits the compliance
// section when the projection lacks the new fields (back-compat with
// pre-OMN-10794 projection rows).
export const PopulatedWithoutComplianceMetrics: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      prefetched: [
        {
          queryKey: [...QUERY_KEY],
          data: [buildDelegationQualityGate({ includeComplianceMetrics: false })],
        },
      ],
    }),
  ],
};
