import type { Meta, StoryObj } from '@storybook/react-vite';
import RoutingDecisionTable from './RoutingDecisionTable';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';
import { buildRoutingDecisions } from '@/storybook/fixtures/routing';

/**
 * Stories for `RoutingDecisionTable`. The widget calls
 * `useProjectionQuery({ queryKey: ['routing-decisions'], ... })` —
 * stories seed the QueryClient cache at that exact key via
 * `makeDashboardDecorator({ prefetched })`.
 *
 * The compliance scorecard (`src/storybook-coverage-compliance.test.ts`,
 * Phase 2) greps this file for `export const Empty` and
 * `export const Populated` — both literal names must be present.
 * `HighDisagreement` exercises the low-`agreementRate` fixture path so
 * the Disagree color treatment is visible without hand-curating data.
 */
const meta: Meta<typeof RoutingDecisionTable> = {
  title: 'Dashboard / RoutingDecisionTable',
  component: RoutingDecisionTable,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof RoutingDecisionTable>;

const ROUTING_KEY = ['routing-decisions'] as const;

export const Empty: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      prefetched: [{ queryKey: [...ROUTING_KEY], data: [] }],
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

// Canonical `Populated` export — required by the Phase 2 compliance
// grep. 50 rows exercises the pagination control (PAGE_SIZE = 25) so
// the "Page 1 of 2" footer is visible by default.
export const Populated: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      prefetched: [{ queryKey: [...ROUTING_KEY], data: buildRoutingDecisions(50) }],
    }),
  ],
};

// Low agreement rate — most rows render the "Disagree" treatment so
// reviewers can see the bad-status color in bulk without picking
// through a default-balanced dataset.
export const HighDisagreement: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      prefetched: [
        {
          queryKey: [...ROUTING_KEY],
          data: buildRoutingDecisions(25, { agreementRate: 0.2 }),
        },
      ],
    }),
  ],
};
