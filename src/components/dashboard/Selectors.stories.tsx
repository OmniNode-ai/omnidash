// Storybook coverage for the two small ghost-button selectors that sit
// in the dashboard header — TimezoneSelector and AutoRefreshSelector.
// Combined into a single story file because each component is ~30
// lines, takes no props/data, and the only meaningful composition is
// the side-by-side header arrangement they have in DashboardView.
//
// `Empty` and `Populated` (no underscore suffix) are required by the
// OMN-100 storybook coverage compliance grep (see
// `src/storybook-coverage-compliance.test.ts`) and alias the
// timezone-only and both-in-header renders respectively. These
// components don't have data-driven states, so the aliases are
// semantically faithful: a single selector is the minimal render,
// both-in-header is the fully composed render.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { TimezoneSelector } from './TimezoneSelector';
import { AutoRefreshSelector } from './AutoRefreshSelector';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';

const meta: Meta = {
  title: 'Dashboard / Selectors',
  decorators: [makeDashboardDecorator({})],
};
export default meta;
type Story = StoryObj;

export const Timezone_Default: Story = { render: () => <TimezoneSelector /> };

export const AutoRefresh_30s: Story = { render: () => <AutoRefreshSelector /> };

export const BothInHeader: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8 }}>
      <TimezoneSelector />
      <AutoRefreshSelector />
    </div>
  ),
};

// Compliance aliases — see src/storybook-coverage-compliance.test.ts.
export const Empty: Story = Timezone_Default;
export const Populated: Story = BothInHeader;
