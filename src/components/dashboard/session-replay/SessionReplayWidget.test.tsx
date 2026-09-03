// OMN-17775 at the render boundary.
//
// Every assertion reads a TEXT label or a `data-*` attribute, never a colour.
// The row fixtures are copied from a live read of the .201 dev-lane relation
// `omnidash_analytics.public.session_replay_snapshots` at 2026-09-03T15:4xZ
// (194 rows across 9 sessions), so the session ids, sequences and event types
// below are real observed rows, not invented ones.
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { mockFetchWithItems } from '@/test-utils/mockFetch';
import SessionReplayWidget, {
  newestFirst,
  formatTokens,
  eventTypeColor,
  type SessionReplayRow,
} from './SessionReplayWidget';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function row(overrides: Partial<SessionReplayRow> = {}): SessionReplayRow {
  return {
    snapshot_id: 'e8b4166b-d4a9-c2af-50e0-b44cd82035b3',
    session_id: 'omn16162-s1-sessionend-proof-1787502219',
    sequence: 171,
    timestamp: '2026-08-31T10:43:40.961764+00:00',
    event_type: 'session_end',
    node_name: 'session',
    state_delta: { session_id: 'omn16162-s1-sessionend-proof-1787502219' },
    cumulative_tokens: 0,
    is_checkpoint: true,
    ...overrides,
  };
}

const SESSION_END = row();
const SESSION_START = row({
  snapshot_id: '11111111-2222-3333-4444-555555555555',
  session_id: 'omn16162-s1-sessionstart-proof-1787502210',
  sequence: 14,
  timestamp: '2026-08-31T10:43:30.000000+00:00',
  event_type: 'session_start',
});
const TOOL_CALL = row({
  snapshot_id: '99999999-8888-7777-6666-555555555555',
  session_id: 'omn17224-ac5',
  sequence: 0,
  timestamp: '2026-08-30T19:15:56.000000+00:00',
  event_type: 'tool_call',
  node_name: 'Bash',
  is_checkpoint: false,
});

async function renderWith(rows: SessionReplayRow[], config = {}) {
  mockFetchWithItems(rows);
  render(
    <DataSourceTestProvider client={qc}>
      <SessionReplayWidget config={config} />
    </DataSourceTestProvider>,
  );
  await screen.findByTestId('session-replay-summary');
}

describe('newestFirst', () => {
  it('orders newest timestamp first without altering any row value', () => {
    const input = [TOOL_CALL, SESSION_END, SESSION_START];
    const out = newestFirst(input);
    expect(out.map((r) => r.snapshot_id)).toEqual([
      SESSION_END.snapshot_id,
      SESSION_START.snapshot_id,
      TOOL_CALL.snapshot_id,
    ]);
    // Ordering is presentation. It must not mutate the input array, and every
    // projection-authored field must survive byte-identical.
    expect(input.map((r) => r.snapshot_id)).toEqual([
      TOOL_CALL.snapshot_id,
      SESSION_END.snapshot_id,
      SESSION_START.snapshot_id,
    ]);
    expect(out).toEqual(expect.arrayContaining(input));
  });

  it('breaks a timestamp tie on descending sequence, not on insertion order', () => {
    const a = row({ snapshot_id: 'a', sequence: 5 });
    const b = row({ snapshot_id: 'b', sequence: 9 });
    expect(newestFirst([a, b]).map((r) => r.snapshot_id)).toEqual(['b', 'a']);
    expect(newestFirst([b, a]).map((r) => r.snapshot_id)).toEqual(['b', 'a']);
  });
});

describe('formatTokens', () => {
  it('renders an unrecorded token total as text, never as 0', () => {
    expect(formatTokens(null)).toBe('no reading');
    expect(formatTokens(undefined)).toBe('no reading');
  });

  it('renders a recorded zero as 0, which is a different fact', () => {
    expect(formatTokens(0)).toBe('0');
  });
});

describe('eventTypeColor', () => {
  it('gives an unrecognised event type its own presentation rather than a bucket', () => {
    expect(eventTypeColor('a_type_this_client_has_never_seen')).toBe('secondary');
  });
});

describe('SessionReplayWidget', () => {
  beforeEach(() => {
    qc.clear();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => vi.restoreAllMocks());

  it('renders the projection-authored event_type verbatim', async () => {
    await renderWith([SESSION_END, SESSION_START, TOOL_CALL]);
    const types = screen
      .getAllByTestId('session-replay-event-type')
      .map((el) => el.textContent);
    expect(types).toEqual(['session_end', 'session_start', 'tool_call']);
  });

  it('renders the projection-authored sequence verbatim and never renumbers it', async () => {
    await renderWith([SESSION_END, SESSION_START, TOOL_CALL]);
    const sequences = screen
      .getAllByTestId('session-replay-sequence')
      .map((el) => el.textContent);
    expect(sequences).toEqual(['171', '14', '0']);
  });

  it('summarises snapshot and distinct-session counts from the served rows', async () => {
    await renderWith([SESSION_END, SESSION_START, TOOL_CALL]);
    expect(screen.getByTestId('session-replay-summary')).toHaveTextContent(
      '3 snapshots across 3 sessions',
    );
  });

  it('caps rendered rows at maxRows while counting every served row in the summary', async () => {
    await renderWith([SESSION_END, SESSION_START, TOOL_CALL], { maxRows: 2 });
    expect(screen.getAllByTestId('session-replay-row')).toHaveLength(2);
    expect(screen.getByTestId('session-replay-summary')).toHaveTextContent(
      '3 snapshots across 3 sessions',
    );
  });

  it('carries is_checkpoint through to the row attribute rather than deriving it', async () => {
    await renderWith([SESSION_END, TOOL_CALL]);
    const rows = screen.getAllByTestId('session-replay-row');
    expect(rows[0]).toHaveAttribute('data-checkpoint', 'true');
    expect(rows[1]).toHaveAttribute('data-checkpoint', 'false');
  });
});
