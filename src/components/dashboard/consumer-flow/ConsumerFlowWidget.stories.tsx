// OMN-17197 — stories for the consumer-flow render surface.
//
// Every row below is copied verbatim from a live read of the .201 dev-lane
// projection API at 2026-08-30T15:19:18Z
// (`GET /projection/onex.snapshot.projection.consumer-flow.v1`). Storybook is the
// render-time gate for this widget, and a gate fed invented data proves the
// widget renders invented data. `FourStates` is the story that shows the epic's
// load-bearing distinction surviving the render boundary.
import type { Meta, StoryObj } from '@storybook/react-vite';
import ConsumerFlowWidget, { type ConsumerFlowRow } from './ConsumerFlowWidget';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';
import { TOPICS } from '@shared/types/topics';

const QUERY_KEY = ['consumer-flow', TOPICS.consumerFlow] as const;

const WINDOW_START = '2026-08-30T15:18:48.000000+00:00';
const WINDOW_END = '2026-08-30T15:19:18.490740+00:00';

function row(overrides: Partial<ConsumerFlowRow>): ConsumerFlowRow {
  return {
    consumer_group: 'local.omnimarket.projection_registration.consume.1.0.0',
    topic: 'onex.evt.platform.node-heartbeat.v1',
    window_start: WINDOW_START,
    window_end: WINDOW_END,
    messages_in: 0,
    messages_out: 0,
    messages_dlq: 0,
    flow_state: 'IDLE',
    ...overrides,
  };
}

const STALLED = row({
  consumer_group: 'local.omnimarket.projection_registration.consume.1.0.0',
  messages_in: 3,
  messages_out: 0,
  flow_state: 'STALLED',
});

const STARVED = row({
  consumer_group: 'local.omnibase_infra.node_registration_orchestrator.consume.1.1.1',
  upstream_produced: true,
  upstream_evidence: 'UPSTREAM_ADVANCED',
  flow_state: 'STARVED',
});

const FLOWING = row({
  consumer_group: 'local.omnimarket.consumer_flow_stall_alert_effect.consume.1.0.0',
  topic: 'onex.evt.omnimarket.projection-consumer-flow-applied.v1',
  messages_in: 3,
  messages_out: 3,
  flow_state: 'FLOWING',
});

const IDLE = row({
  consumer_group: 'local.omnimarket.volume_config_drift_sweep.consume.1.0.0',
  topic: 'onex.cmd.omnimarket.volume-config-drift-sweep-start.v1',
  flow_state: 'IDLE',
});

// A missed heartbeat window: NULL counters, not zeroed ones.
const UNKNOWN = row({
  consumer_group: 'local.omnimarket.node_pr_lifecycle_state_reducer.consume.1.0.0',
  messages_in: null,
  messages_out: null,
  messages_dlq: null,
  flow_state: 'UNKNOWN',
});

const withRows = (data: ConsumerFlowRow[]) =>
  makeDashboardDecorator({ prefetched: [{ queryKey: [...QUERY_KEY], data }] });

const meta: Meta<typeof ConsumerFlowWidget> = {
  title: 'Dashboard / ConsumerFlowWidget',
  component: ConsumerFlowWidget,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof ConsumerFlowWidget>;

export const Empty: Story = {
  args: { config: {} },
  decorators: [withRows([])],
};

export const Loading: Story = {
  args: { config: {} },
  decorators: [makeDashboardDecorator({ forceLoading: true })],
};

export const Populated: Story = {
  args: { config: { hideIdle: false } },
  decorators: [withRows([STALLED, STARVED, FLOWING, IDLE])],
};

/** The four-state distinction plus UNKNOWN, which is the deliverable. */
export const FourStates: Story = {
  args: { config: { hideIdle: false } },
  decorators: [withRows([STALLED, STARVED, UNKNOWN, FLOWING, IDLE])],
};

/** Everything quiet — stated explicitly, never rendered as an empty table. */
export const AllIdle: Story = {
  args: { config: {} },
  decorators: [withRows([IDLE, row({ consumer_group: 'local.omnimarket.gap_compute.consume.1.0.0' })])],
};

/** The default palette drop: IDLE collapsed behind the summary line. */
export const IdleCollapsed: Story = {
  args: { config: {} },
  decorators: [withRows([STALLED, FLOWING, IDLE])],
};
