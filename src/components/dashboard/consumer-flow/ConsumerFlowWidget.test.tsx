// OMN-17197 AC3 / AC4 at the render boundary.
//
// Every assertion here reads a TEXT label, a `data-flow-state` attribute or a
// counter -- never a colour. A suite that asserted on hues would pass on exactly
// the board these criteria reject: four states painted four shades of the same
// thing, indistinguishable to anyone reading the row rather than the palette.
//
// The row fixtures are copied from a live read of the .201 dev-lane projection-api
// at 2026-08-30T15:19:18Z (`/projection/onex.snapshot.projection.consumer-flow.v1`),
// so the group names and counters below are real observed windows, not invented.
import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { mockFetchWithItems } from '@/test-utils/mockFetch';
import ConsumerFlowWidget, {
  latestWindowPerConsumer,
  formatCounter,
  type ConsumerFlowRow,
} from './ConsumerFlowWidget';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function row(overrides: Partial<ConsumerFlowRow> = {}): ConsumerFlowRow {
  return {
    consumer_group: 'local.omnimarket.projection_registration.consume.1.0.0',
    topic: 'onex.evt.platform.node-heartbeat.v1',
    window_start: '2026-08-30T15:18:48.000000+00:00',
    window_end: '2026-08-30T15:19:18.490740+00:00',
    messages_in: 3,
    messages_out: 0,
    messages_dlq: 0,
    flow_state: 'STALLED',
    ...overrides,
  };
}

const STALLED = row();
const IDLE = row({
  consumer_group: 'local.omnimarket.volume_config_drift_sweep.consume.1.0.0',
  topic: 'onex.cmd.omnimarket.volume-config-drift-sweep-start.v1',
  messages_in: 0,
  messages_out: 0,
  flow_state: 'IDLE',
});
const FLOWING = row({
  consumer_group: 'local.omnimarket.consumer_flow_stall_alert_effect.consume.1.0.0',
  topic: 'onex.evt.omnimarket.projection-consumer-flow-applied.v1',
  messages_in: 3,
  messages_out: 3,
  flow_state: 'FLOWING',
});
const STARVED = row({
  consumer_group: 'local.omnibase_infra.node_registration_orchestrator.consume.1.1.1',
  messages_in: 0,
  messages_out: 0,
  upstream_produced: true,
  flow_state: 'STARVED',
});
const UNKNOWN = row({
  consumer_group: 'local.omnimarket.node_pr_lifecycle_state_reducer.consume.1.0.0',
  messages_in: null,
  messages_out: null,
  messages_dlq: null,
  flow_state: 'UNKNOWN',
});

async function renderWith(rows: ConsumerFlowRow[], config = {}) {
  mockFetchWithItems(rows);
  render(
    <DataSourceTestProvider client={qc}>
      <ConsumerFlowWidget config={config} />
    </DataSourceTestProvider>,
  );
  await screen.findByTestId('consumer-flow-summary');
}

describe('ConsumerFlowWidget', () => {
  beforeEach(() => {
    qc.clear();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => vi.restoreAllMocks());

  // AC3: an aggregate that cannot name the stalled consumer is the "one row of
  // zeros" shape the epic exists to eliminate.
  it('names the STALLED consumer group and shows its messages_in / messages_out', async () => {
    await renderWith([STALLED, IDLE, FLOWING]);
    const stalled = screen.getByText(STALLED.consumer_group).closest('[data-testid="consumer-flow-row"]');
    expect(stalled).not.toBeNull();
    const cell = within(stalled as HTMLElement);
    expect(cell.getByTestId('consumer-flow-in')).toHaveTextContent('3');
    expect(cell.getByTestId('consumer-flow-out')).toHaveTextContent('0');
  });

  // AC4: IDLE and STALLED must not render alike.
  it('renders IDLE visibly differently from STALLED, asserted without colour', async () => {
    await renderWith([STALLED, IDLE], { hideIdle: false });
    const stalled = screen
      .getByText(STALLED.consumer_group)
      .closest('[data-testid="consumer-flow-row"]') as HTMLElement;
    const idle = screen
      .getByText(IDLE.consumer_group)
      .closest('[data-testid="consumer-flow-row"]') as HTMLElement;

    expect(stalled.getAttribute('data-flow-state')).toBe('STALLED');
    expect(idle.getAttribute('data-flow-state')).toBe('IDLE');
    // The label a human reads differs, not only an attribute a test reads.
    expect(within(stalled).getByTestId('consumer-flow-state')).toHaveTextContent('STALLED');
    expect(within(idle).getByTestId('consumer-flow-state')).toHaveTextContent('IDLE');
    expect(within(stalled).getByTestId('consumer-flow-state').textContent).not.toBe(
      within(idle).getByTestId('consumer-flow-state').textContent,
    );
  });

  it('gives all four states plus UNKNOWN a distinct label and glyph', async () => {
    await renderWith([STALLED, STARVED, IDLE, FLOWING, UNKNOWN], { hideIdle: false });
    const labels = screen
      .getAllByTestId('consumer-flow-state')
      .map((el) => el.textContent?.trim());
    expect(new Set(labels).size).toBe(5);
  });

  // The verdict is the projection's, never the client's.
  it('renders the projection flow_state verbatim and never re-derives it', async () => {
    // in > 0, out > 0 would read FLOWING to any client that inferred the verdict.
    // The projection says STALLED; the widget must say STALLED.
    const contradictory = row({ messages_in: 9, messages_out: 9, flow_state: 'STALLED' });
    await renderWith([contradictory]);
    const el = screen.getByTestId('consumer-flow-state');
    expect(el).toHaveTextContent('STALLED');
    expect(el).not.toHaveTextContent('FLOWING');
  });

  // OMN-16777 AC5 at the render boundary.
  it('renders an unobserved counter as "no reading", never as 0', async () => {
    await renderWith([UNKNOWN]);
    const unknown = screen
      .getByText(UNKNOWN.consumer_group)
      .closest('[data-testid="consumer-flow-row"]') as HTMLElement;
    expect(within(unknown).getByTestId('consumer-flow-in')).toHaveTextContent('no reading');
    expect(within(unknown).getByTestId('consumer-flow-in')).not.toHaveTextContent('0');
    expect(formatCounter(0)).toBe('0');
    expect(formatCounter(null)).toBe('no reading');
  });

  it('surfaces an actionable state above a healthy one', async () => {
    await renderWith([FLOWING, STARVED, STALLED]);
    const states = screen
      .getAllByTestId('consumer-flow-row')
      .map((el) => el.getAttribute('data-flow-state'));
    expect(states).toEqual(['STALLED', 'STARVED', 'FLOWING']);
  });

  it('collapses repeated windows to the newest one per consumer/topic pair', () => {
    const older = row({ window_end: '2026-08-30T15:18:48.000000+00:00', flow_state: 'FLOWING' });
    const newer = row({ window_end: '2026-08-30T15:19:18.490740+00:00', flow_state: 'STALLED' });
    const collapsed = latestWindowPerConsumer([older, newer]);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].flow_state).toBe('STALLED');
  });

  it('keeps the two legs of a bridge as separate rows, never averaged', () => {
    const legA = row({ topic: 'onex.evt.a.v1', flow_state: 'FLOWING' });
    const legB = row({ topic: 'onex.evt.b.v1', flow_state: 'STALLED' });
    expect(latestWindowPerConsumer([legA, legB])).toHaveLength(2);
  });

  it('reports an honest empty state rather than a zero-valued render', async () => {
    mockFetchWithItems([]);
    render(
      <DataSourceTestProvider client={qc}>
        <ConsumerFlowWidget config={{}} />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText('No consumer-flow windows')).toBeInTheDocument();
    expect(screen.queryAllByTestId('consumer-flow-row')).toHaveLength(0);
  });

  it('says so explicitly when every observed consumer is IDLE', async () => {
    await renderWith([IDLE]);
    expect(screen.getByTestId('consumer-flow-all-idle')).toBeInTheDocument();
  });
});
