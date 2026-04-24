// Storybook coverage for CustomRangePicker — the range-mode calendar
// + HH:MM time inputs popover surfaced via the DateRangeSelector's
// "Custom..." menu item. The component is purely prop-driven (no
// `useProjectionQuery`, no Zustand reads), so cache seeding via
// `makeDashboardDecorator`'s `prefetched` option is unnecessary —
// however the decorator is still applied to wire the
// `ThemeProvider` (the popover reads `--panel-2`, `--line`, etc.
// from the theme tokens) and the 16px-padded container that gives
// the calendar room to breathe in the Storybook canvas.
//
// `Empty` and `Populated` (no underscore suffix) are the OMN-100
// compliance-grep anchors from
// `src/storybook-coverage-compliance.test.ts`. CustomRangePicker
// has no "loading" or "error" state — the only axis of variation
// is whether an `initial` range is supplied — so the aliases are
// semantically faithful: `Empty` (no `initial` prop) seeds the
// fallback last-24h window, `Populated` (week-ago start to today
// end) exercises the prefilled-from-store branch.
//
// `fn()` from `storybook/test` wraps the `onCancel` / `onApply`
// callbacks so clicks are visible in the Actions panel — handy
// for verifying the apply payload's ISO timestamps line up with
// the calendar selection. Note: Storybook 10 collapsed
// `@storybook/test` into the umbrella `storybook` package's
// `/test` subpath, so the canonical import here is
// `from 'storybook/test'` (not `@storybook/test`).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { CustomRangePicker } from './CustomRangePicker';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';

const meta: Meta<typeof CustomRangePicker> = {
  title: 'Dashboard / CustomRangePicker',
  component: CustomRangePicker,
  parameters: { layout: 'padded' },
  decorators: [makeDashboardDecorator({})],
  args: {
    onCancel: fn(),
    onApply: fn(),
  },
};
export default meta;
type Story = StoryObj<typeof CustomRangePicker>;

// Build a TimeRange spanning [today - 7d 00:00, today 23:59] for the
// prefilled story. Constructed at module load — Storybook re-renders
// on HMR so the "today" anchor stays fresh during dev sessions and
// any stale-by-a-day skew is harmless for a visual story.
const WEEK_AGO_RANGE = (() => {
  const end = new Date();
  end.setHours(23, 59, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  start.setHours(0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
})();

// ----- Default --------------------------------------------------------
//
// No `initial` prop — the component falls back to its internal
// last-24h seed so the calendar opens on a sensible default rather
// than fully unselected.

export const Default: Story = {
  args: {},
};

// ----- WithInitialRange ----------------------------------------------
//
// Pre-fills the calendar from a `TimeRange` (week ago → today). The
// `combine()` helper inside the component re-applies the default
// 00:00 / 23:59 time inputs, so the visible selection is a clean
// seven-day span on the calendar.

export const WithInitialRange: Story = {
  args: { initial: WEEK_AGO_RANGE },
};

// ----- Compliance aliases --------------------------------------------
//
// Required by `src/storybook-coverage-compliance.test.ts` — the
// scorecard greps for `export const Empty` and `export const
// Populated` in every covered widget. CustomRangePicker has no
// data-loading state, so `Empty` aliases the no-`initial` render
// and `Populated` aliases the prefilled-range render.

export const Empty: Story = Default;
export const Populated: Story = WithInitialRange;
