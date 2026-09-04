// OMN-17874 at the render boundary.
//
// Every assertion reads a TEXT label or a `data-*` attribute, never a colour.
// The row fixture below is copied verbatim from a live read of the .201 dev-lane
// projection API at 2026-09-04T13:32:17Z
// (`GET /projection/onex.snapshot.projection.work.events.v1` -> HTTP 200,
// `row_count: 1`, `backing: "bus"`), so the event id, kind, actor and summary
// are a real observed row rather than an invented one. That row is itself the
// OMN-17772 chain probe -- its `actor_id` says so -- which is why the fixture
// keeps the name instead of tidying it into something that looks organic.
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { mockFetchWithItems } from '@/test-utils/mockFetch';
import WorkEventsWidget, {
  newestFirst,
  formatTicket,
  formatSummary,
  eventKindColor,
  type WorkEventRow,
} from './WorkEventsWidget';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function row(overrides: Partial<WorkEventRow> = {}): WorkEventRow {
  return {
    event_id: '9cc5bd02-63da-2926-ffa1-5906f984496d',
    emitted_at: '2026-09-04T09:45:47.427552+00:00',
    event_kind: 'session.tool',
    actor_kind: 'session',
    actor_id: 'omn17772-work-events-chain-probe',
    ticket_id: null,
    summary: 'tool Bash (184 ms)',
    source_topic: 'onex.evt.omniclaude.tool-executed.v1',
    payload: { tool_name: 'Bash', duration_ms: 184, interrupted: false },
    ...overrides,
  };
}

const LIVE_ROW = row();
const OLDER_TICKETED = row({
  event_id: '11111111-2222-3333-4444-555555555555',
  emitted_at: '2026-08-23T16:23:39.000000+00:00',
  event_kind: 'session.start',
  actor_id: 'omn16180-backfill',
  ticket_id: 'OMN-16180',
  summary: 'session opened',
});
const NEWEST_UNSUMMARISED = row({
  event_id: '99999999-8888-7777-6666-555555555555',
  emitted_at: '2026-09-04T12:00:00.000000+00:00',
  event_kind: 'a_kind_this_client_has_never_seen',
  actor_id: 'omn17874-fixture',
  ticket_id: 'OMN-17874',
  summary: null,
});

async function renderWith(rows: WorkEventRow[], config = {}) {
  mockFetchWithItems(rows);
  render(
    <DataSourceTestProvider client={qc}>
      <WorkEventsWidget config={config} />
    </DataSourceTestProvider>,
  );
  await screen.findByTestId('work-events-summary-line');
}

describe('newestFirst', () => {
  it('orders newest emitted_at first without altering any row value', () => {
    const input = [OLDER_TICKETED, LIVE_ROW, NEWEST_UNSUMMARISED];
    const out = newestFirst(input);
    expect(out.map((r) => r.event_id)).toEqual([
      NEWEST_UNSUMMARISED.event_id,
      LIVE_ROW.event_id,
      OLDER_TICKETED.event_id,
    ]);
    // Ordering is presentation. It must not mutate the input array, and every
    // projection-authored field must survive byte-identical.
    expect(input.map((r) => r.event_id)).toEqual([
      OLDER_TICKETED.event_id,
      LIVE_ROW.event_id,
      NEWEST_UNSUMMARISED.event_id,
    ]);
    expect(out).toEqual(expect.arrayContaining(input));
  });

  it('breaks an identical-instant tie on descending event_id, not on insertion order', () => {
    const a = row({ event_id: 'aaaa' });
    const b = row({ event_id: 'bbbb' });
    expect(newestFirst([a, b]).map((r) => r.event_id)).toEqual(['bbbb', 'aaaa']);
    expect(newestFirst([b, a]).map((r) => r.event_id)).toEqual(['bbbb', 'aaaa']);
  });
});

describe('formatTicket', () => {
  it('renders an unrecorded ticket as text, never as a blank cell', () => {
    expect(formatTicket(null)).toBe('unattributed');
    expect(formatTicket(undefined)).toBe('unattributed');
    expect(formatTicket('')).toBe('unattributed');
  });

  it('renders a recorded ticket verbatim', () => {
    expect(formatTicket('OMN-17874')).toBe('OMN-17874');
  });
});

describe('formatSummary', () => {
  it('says a summary was not recorded rather than assembling one from the payload', () => {
    expect(formatSummary(null)).toBe('no summary recorded');
    expect(formatSummary('')).toBe('no summary recorded');
  });

  it('renders a recorded summary verbatim', () => {
    expect(formatSummary('tool Bash (184 ms)')).toBe('tool Bash (184 ms)');
  });
});

describe('eventKindColor', () => {
  it('gives an unrecognised event kind its own presentation rather than a bucket', () => {
    expect(eventKindColor('a_kind_this_client_has_never_seen')).toBe('secondary');
  });
});

describe('WorkEventsWidget', () => {
  beforeEach(() => {
    qc.clear();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => vi.restoreAllMocks());

  it('renders the projection-authored event_kind verbatim, including one it has no colour for', async () => {
    await renderWith([NEWEST_UNSUMMARISED, LIVE_ROW, OLDER_TICKETED]);
    const kinds = screen.getAllByTestId('work-events-kind').map((el) => el.textContent);
    expect(kinds).toEqual(['a_kind_this_client_has_never_seen', 'session.tool', 'session.start']);
  });

  it('renders the projection-authored summary verbatim and names an absent one', async () => {
    await renderWith([NEWEST_UNSUMMARISED, LIVE_ROW]);
    const summaries = screen.getAllByTestId('work-events-summary').map((el) => el.textContent);
    expect(summaries).toEqual(['no summary recorded', 'tool Bash (184 ms)']);
  });

  it('renders an unrecorded ticket_id as unattributed rather than an empty cell', async () => {
    await renderWith([LIVE_ROW, OLDER_TICKETED]);
    const tickets = screen.getAllByTestId('work-events-ticket').map((el) => el.textContent);
    expect(tickets).toEqual(['unattributed', 'OMN-16180']);
  });

  it('summarises event and distinct-actor counts from the served rows', async () => {
    await renderWith([NEWEST_UNSUMMARISED, LIVE_ROW, OLDER_TICKETED]);
    expect(screen.getByTestId('work-events-summary-line')).toHaveTextContent(
      '3 work events across 3 actors',
    );
  });

  it('caps rendered rows at maxRows while counting every served row in the summary', async () => {
    await renderWith([NEWEST_UNSUMMARISED, LIVE_ROW, OLDER_TICKETED], { maxRows: 2 });
    expect(screen.getAllByTestId('work-events-row')).toHaveLength(2);
    expect(screen.getByTestId('work-events-summary-line')).toHaveTextContent(
      '3 work events across 3 actors',
    );
  });

  it('carries actor_kind through to the row attribute rather than deriving it', async () => {
    await renderWith([LIVE_ROW]);
    const rows = screen.getAllByTestId('work-events-row');
    expect(rows[0]).toHaveAttribute('data-actor-kind', 'session');
    expect(rows[0]).toHaveAttribute('data-event-id', LIVE_ROW.event_id);
  });
});
