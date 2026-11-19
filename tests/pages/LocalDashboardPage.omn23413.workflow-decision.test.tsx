// @vitest-environment jsdom
// OMN-23413 AC48: a completed run's own decision is shown beside its trace. Observed 2026-11-17: the Workflow page
// showed a run's timeline with "No decision is served for this run" although the store served that run's decision.
// Reproduced in Chromium: when the decisions LIST read fails (500, reset), the page renders RunSummary with no row and
// claims the run has no decision, because only a "not served" failure was treated as unread.
//
// Real data path: HttpSnapshotSource, the exposure census and tenant resolution all run; only fetch is stubbed. The
// stub tells the decisions list read (no correlation_id) from a read of one run's decision (?correlation_id=).
//
// Failure modes, each with a test below:
//   D1  the decisions list read fails and the run's served decision vanishes, though it can be read for that run alone;
//   D2  both reads fail and the page says the run has no decision instead of naming the failed read;
//   D3  a run the store has no decision for stops saying so (the existing missing-decision behaviour);
//   D4  the one-run read answers another run's row and it is shown under this run;
//   D5  the one-run decision read is not sent, or is sent without this run's id or the tenant;
//   D6  the one-run read fails while an incomplete list (truncated, cursor not moving) lacks the run, and the page
//       says the run has no decision, although only a successful read for this run can say that (Codex review);
//   D7  (AC47) the run's correlation id is labelled "Receipt id": a delegated answer's run id (the receipt
//       folder's run_id) is a different id, so the label sends a reader to the wrong receipt.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TENANT = 'c94fa3c5-ea87-4dbb-a4fc-424343bac7a0';

vi.mock('@/config/generated/data-source-defaults', () => ({
  DATA_SOURCE_DEFAULT_MODE: 'http',
  DATA_SOURCE_DEFAULT_URL: '',
  DATA_SOURCE_DEFAULT_SQLITE_DB_PATH: '',
  PROJECTION_TENANT_ID_DEFAULT: 'c94fa3c5-ea87-4dbb-a4fc-424343bac7a0',
  REFRESH_INTERVAL_SECONDS_DEFAULT: 30,
  DECISIONS_PAGE_LIMIT_DEFAULT: 0,
}));

import { LocalDashboardPage } from '@/pages/LocalDashboardPage';
import { resetExposureMetadataCache } from '@/data-source/projection-tenant';
import recordedChain from '@/pages/local/omn19987.run-trace.recorded.json';

const DECISIONS = 'onex.snapshot.projection.delegation.decisions.v1';
const SAVINGS = 'onex.snapshot.projection.delegation.savings.v1';
const RUN_TRACE = 'onex.snapshot.projection.run-trace.v1';
const RUN = '445adc8a-1289-4459-9776-b9570d0d623b';
const OTHER = '22222222-2222-4222-8222-222222222222';

type Row = Record<string, unknown>;
type Answer = { status: number; body: unknown };

function decision(id: string, extra: Row = {}): Row {
  return {
    correlation_id: id, written_at: '2026-11-17T10:16:28Z', created_at: '2026-11-17T10:16:28Z',
    quality_gate_passed: true, quality_gate_detail: 'completed', terminal_ok: true, model_name: 'Beam-1.0-501B-A23B',
    latency_ms: 5334, tokens_input: 572, tokens_output: 1121, task_type: 'research', cost_tier_name: 'cheap_cloud',
    actual_score: '1.000', data_source: 'real', backend_id: `backend-of-${id}`, host: `host-of-${id}`, ...extra,
  };
}

function stepsOf(id: string): Row[] {
  return (recordedChain as Row[]).map((row) => ({ ...row, tenant_id: TENANT, correlation_id: id }));
}

const served = (rows: Row[]): Answer => ({ status: 200, body: { rows, row_count: rows.length } });
const failed: Answer = { status: 500, body: { error: 'projection_read_failed', detail: 'database is locked' } };

const lab = {
  /** The decisions list read (no correlation_id). */
  list: served([]) as Answer,
  /** A read of one run's decision (?correlation_id=<id>). */
  one: (() => served([])) as (id: string) => Answer,
  requests: [] as URL[],
};

function respond({ status, body }: Answer): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : 'Internal Server Error',
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.stubEnv('VITE_DATA_SOURCE', 'http');
  resetExposureMetadataCache();
  lab.list = served([decision(RUN)]);
  lab.one = (id) => served(id === RUN ? [decision(RUN)] : []);
  lab.requests = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://127.0.0.1:47695');
    if (url.pathname === '/projections') {
      return respond(served([]).status === 200 ? {
        status: 200,
        body: {
          topics: [DECISIONS, RUN_TRACE, SAVINGS].map((topic) => ({
            topic, status: 'ok', bus_backed: true, backing: 'bus', tenant_column: 'tenant_id', tenant_scoped: true,
          })),
        },
      } : served([]));
    }
    lab.requests.push(url);
    const topic = decodeURIComponent(url.pathname.replace(/^\/projection\//, ''));
    const id = url.searchParams.get('correlation_id');
    if (topic === DECISIONS) return respond(id === null ? lab.list : lab.one(id));
    if (topic === RUN_TRACE) return respond(served(id === RUN ? stepsOf(RUN) : []));
    if (topic === SAVINGS) return respond(served([{ sessions: [] }]));
    return respond({ status: 404, body: { error: 'unknown_topic', topic } });
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.history.replaceState(null, '', '/');
});

function panel(): HTMLElement {
  return screen.getByRole('heading', { name: 'Run path' }).closest('article') as HTMLElement;
}

/** Every label and its value the panel shows, from its definition lists. */
function fieldsShown(): Record<string, string> {
  return Object.fromEntries(within(panel()).getAllByRole('term')
    .map((term) => [term.textContent ?? '', term.nextElementSibling?.textContent ?? '']));
}

function openRun(id: string) {
  window.history.replaceState(null, '', `/workflow?correlation_id=${id}`);
  return render(<LocalDashboardPage pageName="workflow" syncUrl />);
}

/** Wait for the run's steps, so every read of the page has been answered. */
async function settled() {
  await waitFor(() => expect(panel().textContent).toContain(`Run ${RUN}`));
  await waitFor(() => expect(panel().textContent).toContain('Routing decision'));
}

describe('OMN-23413 AC48: a run\'s served decision is shown beside its trace', () => {
  it('D1: the decisions list read fails, and the run\'s own decision is still shown', async () => {
    lab.list = failed;
    openRun(RUN);
    await settled();
    await waitFor(() => expect(panel().textContent).toContain(`backend-of-${RUN}`));
    expect(panel().textContent).toContain('Quality score');
    expect(panel().textContent).not.toContain('No decision is served for this run');
  });

  it('D2: both decision reads fail, and the page names the failed read instead of claiming no decision', async () => {
    lab.list = failed;
    lab.one = () => failed;
    openRun(RUN);
    await settled();
    await waitFor(() => expect(panel().textContent).toMatch(/decision could not be read/i));
    expect(panel().textContent).not.toContain('No decision is served for this run');
  });

  it('D3: a run the store has no decision for still says so', async () => {
    lab.list = served([decision(OTHER)]);
    lab.one = () => served([]);
    openRun(RUN);
    await settled();
    await waitFor(() => expect(panel().textContent).toContain('No decision is served for this run'));
  });

  it('D4: another run\'s row answered for this run is never shown under it', async () => {
    lab.list = failed;
    lab.one = () => served([decision(OTHER)]);
    openRun(RUN);
    await settled();
    await waitFor(() => expect(panel().textContent).toContain('No decision is served for this run'));
    expect(panel().textContent).not.toContain(`backend-of-${OTHER}`);
  });

  it('D6: the run\'s own read fails and an incomplete list lacks it, and the page names the failed read', async () => {
    lab.list = { status: 200, body: { rows: [decision(OTHER)], row_count: 1, truncated: true, next_cursor: '0' } };
    lab.one = () => failed;
    openRun(RUN);
    await settled();
    await waitFor(() => expect(panel().textContent).toMatch(/decision could not be read/i));
    expect(panel().textContent).not.toContain('No decision is served for this run');
    expect(panel().textContent).not.toContain(`backend-of-${OTHER}`);
  });

  it('D5: the run\'s decision is read for that run alone, with the tenant', async () => {
    openRun(RUN);
    await settled();
    await waitFor(() => expect(lab.requests.some((url) =>
      decodeURIComponent(url.pathname).endsWith(DECISIONS) && url.searchParams.get('correlation_id') === RUN)).toBe(true));
    const ask = lab.requests.find((url) =>
      decodeURIComponent(url.pathname).endsWith(DECISIONS) && url.searchParams.get('correlation_id') === RUN)!;
    expect(ask.searchParams.get('tenant')).toBe(TENANT);
  });

  it('D7: the run\'s correlation id is labelled "Correlation id", never "Receipt id" (AC47)', async () => {
    openRun(RUN);
    await settled();
    await waitFor(() => expect(fieldsShown()['Correlation id']).toBe(RUN));
    expect(fieldsShown()['Receipt id']).toBeUndefined();
  });
});
