// Storybook coverage for ReadinessGate — status-summary table widget
// that renders an overall pill plus a per-dimension row for each
// readiness check. Mirrors the recipe established by the
// quality / cost-trend stories: cache pre-seeding via
// `makeDashboardDecorator`, fixture data via `buildReadinessRows`,
// and a `Populated` export alongside the descriptive named stories so
// the OMN-100 compliance grep (which scans for `Empty` + `Populated`)
// passes.
//
// The widget reads through `useProjectionQuery<ReadinessSummary>` with
// queryKey `['readiness-summary']`. The hook returns `T[]`; the widget
// then takes `dataArr?.[0]` so each story seeds an array of one
// summary record (matches the projection table convention — one row
// per snapshot).
//
// Stories cover three orthogonal axes:
//   1. Empty / Loading / Error wrapper states
//   2. Status-distribution presets (`all-green`, `mixed`, `all-red`)
//      that exercise StatusPill color variations across the
//      ok / warn / bad spectrum.
//   3. `Populated` alias for the most realistic render (mixed mix),
//      kept as a separately-named export so the compliance grep stays
//      widget-agnostic.
//
// Container width is held at >=480px so the three-column dimensions
// table (Status / Dimension / Detail) has room to breathe.
import type { Meta, StoryObj } from '@storybook/react-vite';
import ReadinessGate from './ReadinessGate';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';
import { buildReadinessRows } from '@/storybook/fixtures/readiness';

const QUERY_KEY = ['readiness-summary'];

// Fixed timestamp so the "Checked HH:MM:SS" line in the header is
// deterministic across renders / visual-regression captures.
const ANCHOR = '2026-04-20T12:00:00Z';

const meta: Meta<typeof ReadinessGate> = {
  title: 'Dashboard / ReadinessGate',
  component: ReadinessGate,
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
type Story = StoryObj<typeof ReadinessGate>;

// ----- Empty / Loading / Error ----------------------------------------

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

export const Error: Story = {
  args: { config: {} },
  decorators: [makeDashboardDecorator({ forceError: true })],
};

// ----- Status-distribution variations ---------------------------------

export const AllGreen: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      // Every dimension PASS → overall PASS pill renders in
      // `--status-ok` colour; all rows render the green StatusPill.
      prefetched: [{
        queryKey: QUERY_KEY,
        data: [buildReadinessRows(7, { preset: 'all-green', lastCheckedAt: ANCHOR })],
      }],
    }),
  ],
};

export const MixedStatuses: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      // Blend of PASS / WARN / FAIL → overall WARN pill, table shows
      // all three StatusPill colour variants side-by-side. This is
      // the realistic production case.
      prefetched: [{
        queryKey: QUERY_KEY,
        data: [buildReadinessRows(7, { preset: 'mixed', lastCheckedAt: ANCHOR })],
      }],
    }),
  ],
};

export const AllRed: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      // Every dimension FAIL → overall FAIL pill in `--status-bad`
      // colour; all rows render the red StatusPill. Worst-case
      // outage scenario.
      prefetched: [{
        queryKey: QUERY_KEY,
        data: [buildReadinessRows(7, { preset: 'all-red', lastCheckedAt: ANCHOR })],
      }],
    }),
  ],
};

// ----- Compliance anchor ----------------------------------------------
//
// `Populated` exists so the OMN-100 storybook coverage compliance
// scorecard's `Empty + Populated` grep passes (see
// `src/storybook-coverage-compliance.test.ts`). It's the most
// realistic render — the same mixed dataset `MixedStatuses` produces,
// kept as a separately-named export so the compliance test stays
// widget-agnostic.

export const Populated: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      prefetched: [{
        queryKey: QUERY_KEY,
        data: [buildReadinessRows(7, { preset: 'mixed', lastCheckedAt: ANCHOR })],
      }],
    }),
  ],
};
