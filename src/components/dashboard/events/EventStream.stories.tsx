// Storybook coverage for EventStream — live event tail with sticky
// column header, source-color pills, in-place filtering, and an
// auto-scroll pause / "N new events" affordance. Mirrors the recipe
// established by RoutingDecisionTable / DelegationMetrics: cache
// pre-seeding via `makeDashboardDecorator`, fixture data via
// `buildEventStream`, and `Empty` + `Populated` named exports so the
// OMN-100 compliance grep (which scans for those names) passes.
//
// The widget reads through `useProjectionQuery<StreamEvent>` with
// queryKey `['events-recent']`. The hook returns `T[]`; the widget
// then seeds its local `events` state with `initialData.slice(0,
// maxEvents)`, so each story's `prefetched` value is the full array
// the widget would receive from the projection.
//
// State coverage:
//   1. Empty       — projection returns no rows
//   2. Loading     — query never resolves (forceLoading)
//   3. Error       — query throws (forceError)
//   4. Populated   — 50 events across the default source/event_type mix
//   5. HighVolume  — 250 events seeded into a default-sized buffer
//                    (maxEvents = 200) to demonstrate the buffer-cap
//                    `slice(0, maxEvents)` behavior described in
//                    EventStream.tsx. The status row should read
//                    "200 / 200 · buffer full".
import type { Meta, StoryObj } from '@storybook/react-vite';
import EventStream from './EventStream';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';
import { buildEventStream } from '@/storybook/fixtures/events';

const QUERY_KEY = ['events-recent'];

const meta: Meta<typeof EventStream> = {
  title: 'Dashboard / EventStream',
  component: EventStream,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof EventStream>;

// ----- Empty / Loading / Error ---------------------------------------

export const Empty: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      // Empty array → ComponentWrapper renders the "No events" empty
      // state with the "Events appear as Kafka messages arrive" hint.
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

// ----- Populated ------------------------------------------------------

export const Populated: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      // 50 events across 5 sources × 7 event_types — gives the
      // source-pill hue function (`hueForSource`) and the filter
      // input enough variety to demonstrate.
      prefetched: [{ queryKey: QUERY_KEY, data: buildEventStream(50) }],
    }),
  ],
};

// ----- HighVolume (buffer-cap exercise) -------------------------------
//
// The widget's `maxEvents` config defaults to 200 (see
// EventStream.tsx). Seeding 250 events forces the
// `initialData.slice(0, maxEvents)` path in the initial-load effect,
// which clamps the buffer at 200 and triggers the "buffer full"
// indicator in the status row (`bufferFull = events.length >=
// maxEvents`). This is the single point of the story — to make the
// cap behavior visible to reviewers without booting the live
// WebSocket path.

export const HighVolume: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      prefetched: [{ queryKey: QUERY_KEY, data: buildEventStream(250) }],
    }),
  ],
};
