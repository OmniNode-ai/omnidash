// Storybook coverage for QualityScorePanel — three.js bar chart with
// HTML overlay (pass-rate headline + mean cone marker + threshold
// wall). Mirrors the recipe established by the routing/cost-trend
// stories: cache pre-seeding via `makeDashboardDecorator`, fixture
// data via `buildQualitySummary`, and a `Populated` export alongside
// the descriptive named stories so the OMN-100 compliance grep
// (which scans for `Empty` + `Populated`) passes.
//
// The widget reads through `useProjectionQuery<QualitySummary>` with
// queryKey `['quality-summary']`. The hook returns `T[]`; the widget
// then takes `dataArr?.[0]` so each story seeds an array of one
// summary record (matches the projection table convention — one row
// per snapshot).
//
// Three-pane stories cover three orthogonal axes:
//   1. Distribution shape (high / low / balanced)
//   2. Loading + empty states (no data path)
//   3. Threshold variation (default 0.8 vs strict 0.95)
//
// Container width is held at >=720px so the headline pane plus the
// 240px-tall canvas have room to breathe (matches the dashboard grid
// minimum that ships in production).
import type { Meta, StoryObj } from '@storybook/react-vite';
import QualityScorePanel from './QualityScorePanel';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';
import { buildQualitySummary } from '@/storybook/fixtures/quality';

const QUERY_KEY = ['quality-summary'];

const meta: Meta<typeof QualityScorePanel> = {
  title: 'Dashboard / QualityScorePanel',
  component: QualityScorePanel,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ minWidth: 720, minHeight: 320 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof QualityScorePanel>;

// ----- Empty / Loading -------------------------------------------------

export const Empty: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      // Empty array → `data` is undefined → ComponentWrapper renders
      // its empty state. Matches the runtime path for "projection
      // table has no rows yet".
      prefetched: [{ queryKey: QUERY_KEY, data: [] }],
    }),
  ],
};

export const Loading: Story = {
  args: { config: {} },
  decorators: [makeDashboardDecorator({ forceLoading: true })],
};

// ----- Distribution-shape variations -----------------------------------

export const HighPassRate: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      // 'high-pass' weights put 75%+ of measurements in the 0.6+
      // buckets — green-dominant bars, headline reads OK colour.
      prefetched: [{
        queryKey: QUERY_KEY,
        data: [buildQualitySummary({ profile: 'high-pass' })],
      }],
    }),
  ],
};

export const LowPassRate: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      // 'low-pass' weights put ~65% of measurements in the <0.6
      // buckets — red-dominant bars, headline reads BAD colour
      // (~35% pass rate hits the <0.6 threshold for `bad`).
      prefetched: [{
        queryKey: QUERY_KEY,
        data: [buildQualitySummary({ profile: 'low-pass' })],
      }],
    }),
  ],
};

export const BalancedDistribution: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      // 'balanced' is a soft bell peaking at 0.6-0.8 — amber-
      // dominant in the headline (between 0.6 and 0.8 pass rate
      // → `warn` colour).
      prefetched: [{
        queryKey: QUERY_KEY,
        data: [buildQualitySummary({ profile: 'balanced' })],
      }],
    }),
  ],
};

// ----- Threshold variation --------------------------------------------

export const StrictThreshold: Story = {
  // passThreshold=0.95 means only the 0.8-1.0 bucket counts as
  // passing — exercises the threshold wall at the far right of
  // the bar strip and sends most measurements to "fail".
  args: { config: { passThreshold: 0.95 } },
  decorators: [
    makeDashboardDecorator({
      prefetched: [{
        queryKey: QUERY_KEY,
        data: [buildQualitySummary({ profile: 'high-pass' })],
      }],
    }),
  ],
};

// ----- Compliance anchor ----------------------------------------------
//
// `Populated` exists so the OMN-100 storybook coverage compliance
// scorecard's `Empty + Populated` grep passes (see
// `src/storybook-coverage-compliance.test.ts`). It's the canonical
// "default config + balanced data" render — the same scene
// `BalancedDistribution` produces, kept as a separately-named export
// so the compliance test stays widget-agnostic.

export const Populated: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      prefetched: [{
        queryKey: QUERY_KEY,
        data: [buildQualitySummary({ profile: 'balanced' })],
      }],
    }),
  ],
};
