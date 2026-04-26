// Storybook coverage for BaselinesROICard — three DeltaMetric tiles
// (token / time / retry) plus a recommendations summary row. The
// widget reads through `useProjectionQuery<BaselinesSummary>` with
// queryKey `['baselines-summary']`; stories seed the QueryClient
// cache at that key via `makeDashboardDecorator({ prefetched })`.
//
// The DeltaMetric helper picks color by sign — a non-positive value
// renders the `ok` (green) treatment because token / time / retry
// deltas are "lower is better"; a positive value renders the `warn`
// (red) treatment for regressions. Stories cover both branches via
// `buildBaselinesRoi({ variant: 'positive' | 'negative' })`.
//
// The compliance scorecard (`src/storybook-coverage-compliance.test.ts`,
// Phase 2) greps this file for `export const Empty` and
// `export const Populated` — both literal names must be present.
// `Populated_PositiveROI` and `Populated_NegativeROI` add the
// signed-ROI variants called out in plan Task 11.
import type { Meta, StoryObj } from '@storybook/react-vite';
import BaselinesROICard from './BaselinesROICard';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';
import { buildBaselinesRoi } from '@/storybook/fixtures/baselines';

const QUERY_KEY = ['baselines-summary'];

const meta: Meta<typeof BaselinesROICard> = {
  title: 'Dashboard / BaselinesROICard',
  component: BaselinesROICard,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof BaselinesROICard>;

// ----- Empty / Loading / Error -----------------------------------------

export const Empty: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      // Empty array → `data` is null → ComponentWrapper renders its
      // empty state ("No baseline snapshot"). Matches the runtime path
      // for "projection table has no rows yet".
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

// ----- Signed-ROI variants --------------------------------------------

export const Populated_PositiveROI: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      // 'positive' variant flips token / time / retry deltas negative
      // (improvements) — DeltaMetric paints them with the `ok` (green)
      // color treatment.
      prefetched: [
        {
          queryKey: QUERY_KEY,
          data: [buildBaselinesRoi({ variant: 'positive' })],
        },
      ],
    }),
  ],
};

export const Populated_NegativeROI: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      // 'negative' variant keeps token / time / retry deltas positive
      // (regressions) — DeltaMetric paints them with the `warn` (red)
      // color treatment.
      prefetched: [
        {
          queryKey: QUERY_KEY,
          data: [buildBaselinesRoi({ variant: 'negative' })],
        },
      ],
    }),
  ],
};

// ----- Compliance anchor ----------------------------------------------
//
// `Populated` exists so the OMN-100 storybook coverage compliance
// scorecard's `Empty + Populated` grep passes (see
// `src/storybook-coverage-compliance.test.ts`). It's the canonical
// "default config + positive ROI" render — the same scene
// `Populated_PositiveROI` produces, kept as a separately-named export
// so the compliance test stays widget-agnostic.

export const Populated: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      prefetched: [
        {
          queryKey: QUERY_KEY,
          data: [buildBaselinesRoi({ variant: 'positive' })],
        },
      ],
    }),
  ],
};
