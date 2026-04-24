// Storybook coverage for DateRangeSelector — the dashboard-level time
// range selector that lives next to the Save / Add Widget buttons in
// the header. Unlike the data-driven widgets, this component does not
// call `useProjectionQuery`; instead it reads
// `globalFilters.timeRange` directly from the Zustand `useFrameStore`.
// Stories therefore seed the store via `useFrameStore.setState({...})`
// in a per-story decorator BEFORE render, then layer
// `makeDashboardDecorator({})` on top so the QueryClient + ThemeProvider
// context still wraps the rendered component (the decorator stack is
// applied right-to-left, so the seed runs first and theme/QueryClient
// wrap the result).
//
// Compliance anchors for the OMN-100 / OMN-114 scorecard
// (`src/storybook-coverage-compliance.test.ts`, Phase 2): this file
// must export a story literally named `Empty` and one literally named
// `Populated`. We satisfy that by aliasing `NoRangeSelected` →
// `Empty` and `Last7d` → `Populated`.
//
// Note on the "All time" branch: `DateRangeSelector` mounts with a
// `useEffect` that auto-seeds the default preset (Last 7d) when the
// store has no `timeRange`. The `NoRangeSelected` / `Empty` story
// captures the moment BEFORE that effect runs — Storybook's renderer
// shows the initial commit, then immediately re-renders with the
// seeded preset. That's the component's actual behavior; we don't
// fight it from the story. To inspect the popover (preset list and
// the custom range view), click the trigger button in the iframe —
// the open/closed state is managed inside the component via
// `usePositionedMenu` and is not driven by props.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DateRangeSelector } from './DateRangeSelector';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';
import { useFrameStore } from '@/store/store';
import type { TimeRange } from '@/store/types';

const meta: Meta<typeof DateRangeSelector> = {
  title: 'Dashboard / DateRangeSelector',
  component: DateRangeSelector,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof DateRangeSelector>;

// Per-story decorator that resets `globalFilters.timeRange` in the
// real Zustand store before each render. We deliberately reach
// through the store API rather than mocking it: `DateRangeSelector`
// reads via `useFrameStore((s) => s.globalFilters.timeRange)` and a
// mock would diverge from the real selector wiring on every store
// shape change. Wrapping `setState` in a fresh decorator instance
// per story (and re-running on each render) keeps stories
// independent — switching between stories in the Storybook sidebar
// does not leak state.
const seedStoreDecorator =
  (timeRange: TimeRange | undefined) => (Story: () => React.ReactElement) => {
    useFrameStore.setState({ globalFilters: { timeRange } });
    return <Story />;
  };

// Pinned ISO timestamps so screenshots / visual diffs are stable
// across runs. The exact instant doesn't matter — what matters is
// that the story renders the preset label ("Last 7d") rather than
// a formatted MM/DD range, which is what the component shows when
// `range.label` is present.
const LAST_7D_RANGE: TimeRange = {
  start: '2026-04-15T00:00:00.000Z',
  end: '2026-04-22T00:00:00.000Z',
  label: 'Last 7d',
};

// Custom range — no `label` field set, so the component falls into
// its `MM/DD – MM/DD` formatting branch. End > start, both in the
// same year, so the rendered button text is e.g. "04/01 – 04/22".
const CUSTOM_RANGE: TimeRange = {
  start: '2026-04-01T00:00:00.000Z',
  end: '2026-04-22T00:00:00.000Z',
};

// ----- NoRangeSelected (Empty alias) ---------------------------------
//
// Store has no `timeRange`. The button initially renders "All time",
// but the component's mount-time `useEffect` auto-seeds the default
// preset (Last 7d), so the visible label flips to "Last 7d" almost
// immediately. The transient "All time" state is the formal target
// of this story; reviewers should treat it as the cold-start case.
//
// `Empty` (the alias) is the OMN-100 / OMN-114 compliance anchor —
// the scorecard greps for `/export\s+const\s+Empty\s*[:=]/`.

export const NoRangeSelected: Story = {
  decorators: [seedStoreDecorator(undefined), makeDashboardDecorator({})],
};

export const Empty = NoRangeSelected;

// ----- Last7d (Populated alias) --------------------------------------
//
// Store seeded with a preset-labeled range. The button reads the
// `label` field and renders it verbatim — "Last 7d" — exercising the
// preset-display branch.
//
// `Populated` (the alias) is the second compliance anchor — the
// scorecard greps for `/export\s+const\s+Populated\s*[:=]/`.

export const Last7d: Story = {
  decorators: [seedStoreDecorator(LAST_7D_RANGE), makeDashboardDecorator({})],
};

export const Populated = Last7d;

// ----- CustomRange ---------------------------------------------------
//
// Store seeded with a range that has no `label` — i.e. a user-entered
// custom range. The component formats the start/end as `MM/DD – MM/DD`
// and shows that on the trigger button instead of a preset name.

export const CustomRange: Story = {
  decorators: [seedStoreDecorator(CUSTOM_RANGE), makeDashboardDecorator({})],
};
