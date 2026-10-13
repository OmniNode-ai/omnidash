// @vitest-environment jsdom
// OMN-19987 (TI4, WF-3) and OMN-21015 AC9: the Workflow page reads run-trace.v1 for ONE run, asked for by its
// correlation id, and shows that run's steps. The run is the one chosen in the Runs list, the one whose id was
// pasted, or, with no id, the newest run delegation.decisions.v1 serves.
//
// Real data path: HttpSnapshotSource, the exposure census and tenant resolution all run; only fetch is stubbed. The
// steps are the chain one real lab delegation emitted (omn19987.run-trace.recorded.json), re-keyed per run.
//
// Failure modes, each with a test below:
//   W1   with no id the page shows some run other than the newest, or asks run-trace.v1 for every run at once;
//   W2   a pasted id is ignored, sent altered (untrimmed, unencoded), or answered with the newest run's steps;
//   W3   a run chosen in the Runs list opens another run, or the list offers no way to open one;
//   W4   an id no run has falls back to another run's steps instead of saying this run has none;
//   W5   the exposure answers another run's steps and the page shows them under the id that was asked for;
//   W6   the id changes while a read is in flight and the earlier run's late answer is shown under the new id;
//   W7   the newest run changes, its read fails, and the previous run's steps stay on screen under the new run;
//   W8   run-trace.v1 is not served and the page says the run has no steps, or shows a blank;
//   W9   a failed read is shown as "no steps recorded" instead of the failure;
//   W10  a store with no runs is asked for a run's steps, or shows a blank;
//   W11  the newest run has no correlation id and the page asks run-trace.v1 with no id;
//   W12  a truncated answer is shown as if it were the whole run;
//   W13  an empty or blank id in the address is treated as an id;
//   W14  a Runs row with no correlation id links somewhere;
//   W15  the run's backend, host and tier (OMN-20225) vanish from the page, or come from another run's decision;
//   W16  the page without address sync (a story, a test) cannot open a run by id.
//   W17  a refresh is asked while an earlier read of the page is unanswered, the newest run changed in between, and
//        the earlier read's late answer replaces the newer run already on screen (Codex's review of efcf5e83);
//   W18  once a superseded read has been dropped, later refreshes are dropped too and the page stops updating;
//   W19  a superseded read that fails late shows its failure, or ends the loading state, while the newer read is
//        still unanswered;
//   W20  a superseded read that fails outright (the catalogue itself, not one exposure) shows a page error while the
//        newer read is still unanswered.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocation } from 'wouter';

const TENANT = 'c94fa3c5-ea87-4dbb-a4fc-424343bac7a0';

vi.mock('@/config/generated/data-source-defaults', () => ({
  DATA_SOURCE_DEFAULT_MODE: 'http',
  DATA_SOURCE_DEFAULT_URL: '',
  DATA_SOURCE_DEFAULT_SQLITE_DB_PATH: '',
  PROJECTION_TENANT_ID_DEFAULT: 'c94fa3c5-ea87-4dbb-a4fc-424343bac7a0',
}));

import { LocalDashboardPage, RunsTable } from './LocalDashboardPage';
import { resetExposureMetadataCache } from '@/data-source/projection-tenant';
import { requestLocalPageRefresh } from '@/services/local-page-refresh';
import recordedChain from './local/omn19987.run-trace.recorded.json';

const DECISIONS = 'onex.snapshot.projection.delegation.decisions.v1';
const SAVINGS = 'onex.snapshot.projection.delegation.savings.v1';
const RUN_TRACE = 'onex.snapshot.projection.run-trace.v1';
const OLDER = '11111111-1111-4111-8111-111111111111';
const NEWEST = '22222222-2222-4222-8222-222222222222';
const UNKNOWN = '99999999-9999-4999-8999-999999999999';
const THIRD = '33333333-3333-4333-8333-333333333333';

type Row = Record<string, unknown>;
type Answer = { status: number; body: unknown };

function decision(id: string | null, writtenAt: string, extra: Row = {}): Row {
  return {
    correlation_id: id, written_at: writtenAt, created_at: writtenAt, quality_gate_passed: true,
    quality_gate_detail: 'completed', model_name: 'local-model', latency_ms: 813, tokens_input: 162, tokens_output: 52,
    task_type: 'summarization', cost_tier_name: 'local', cost_tier_type: 'free_local', actual_score: '1.000',
    data_source: 'real', backend_id: `backend-of-${String(id)}`, host: `host-of-${String(id)}`, ...extra,
  };
}

/** The recorded chain as one run's served steps; the request step's reason names the run, so a test can tell runs apart. */
function stepsOf(id: string): Row[] {
  return (recordedChain as Row[]).map((row) => ({
    ...row,
    tenant_id: TENANT,
    correlation_id: id,
    reason: row.step_kind === 'request' ? `task of ${id}` : row.reason,
  }));
}

const served = (rows: Row[], extra: Row = {}): Answer => ({ status: 200, body: { rows, row_count: rows.length, ...extra } });

const lab = {
  catalogue: [] as string[],
  decisions: served([]) as Answer,
  /** run-trace.v1's answer for the correlation id asked for (null when the request named none). */
  trace: ((_id: string | null) => served([])) as (id: string | null) => Answer | Promise<Answer>,
  requests: [] as URL[],
  /** When set, the next catalogue request waits for this answer instead of the catalogue above (taken once). */
  heldCatalogue: null as Promise<Answer> | null,
};

function respond({ status, body }: Answer): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : 'Internal Server Error',
    headers: { 'content-type': 'application/json' },
  });
}

function stubFetch() {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://127.0.0.1:47695');
    if (url.pathname === '/projections') {
      if (lab.heldCatalogue) {
        const answer = lab.heldCatalogue;
        lab.heldCatalogue = null;
        return respond(await answer);
      }
      return respond({
        status: 200,
        body: {
          topics: lab.catalogue.map((topic) => ({
            topic, status: 'ok', bus_backed: true, backing: 'bus', tenant_column: 'tenant_id', tenant_scoped: true,
          })),
        },
      });
    }
    lab.requests.push(url);
    const topic = decodeURIComponent(url.pathname.replace(/^\/projection\//, ''));
    if (topic === DECISIONS) return respond(lab.decisions);
    if (topic === RUN_TRACE) return respond(await lab.trace(url.searchParams.get('correlation_id')));
    if (topic === SAVINGS) return respond(served([{ sessions: [] }]));
    return respond({ status: 404, body: { error: 'unknown_topic', topic } });
  }));
}

function topicOf(url: URL): string {
  return decodeURIComponent(url.pathname.replace(/^\/projection\//, ''));
}

/** The correlation id of every run-trace.v1 request sent so far, in order (null: the request named none). */
function traceAsks(): Array<string | null> {
  return lab.requests.filter((url) => topicOf(url) === RUN_TRACE).map((url) => url.searchParams.get('correlation_id'));
}

function panel(): HTMLElement {
  return screen.getByRole('heading', { name: 'Run path' }).closest('article') as HTMLElement;
}

function open(path: string) {
  window.history.replaceState(null, '', path);
  return render(<LocalDashboardPage pageName="workflow" syncUrl />);
}

async function shows(text: string) {
  await waitFor(() => expect(panel().textContent).toContain(text));
}

beforeEach(() => {
  vi.stubEnv('VITE_DATA_SOURCE', 'http');
  resetExposureMetadataCache();
  lab.catalogue = [DECISIONS, RUN_TRACE, SAVINGS];
  // Served older first: the newest run is the one with the latest written_at, not the first row.
  lab.decisions = served([decision(OLDER, '2026-10-11T15:00:00Z'), decision(NEWEST, '2026-10-11T15:05:00Z')]);
  lab.trace = (id) => served(id === OLDER || id === NEWEST ? stepsOf(id) : []);
  lab.requests = [];
  lab.heldCatalogue = null;
  stubFetch();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.history.replaceState(null, '', '/');
});

describe('OMN-19987 / OMN-21015 AC9: the Workflow page shows one run, asked for by its correlation id', () => {
  it('W1: with no id it asks run-trace.v1 for the newest run only and shows that run\'s steps', async () => {
    open('/workflow');
    await shows(`task of ${NEWEST}`);
    expect(panel().textContent).not.toContain(`task of ${OLDER}`);
    expect(panel().textContent).toContain(`Run ${NEWEST}`);
    expect(within(panel()).getAllByRole('listitem').map((item) => item.querySelector('strong')?.textContent))
      .toEqual(['Request', 'Routing decision', 'Provider call', 'Quality gate', 'Terminal']);
    expect(traceAsks()).toEqual([NEWEST]);
    const ask = lab.requests.find((url) => topicOf(url) === RUN_TRACE)!;
    expect(ask.searchParams.get('tenant')).toBe(TENANT);
  });

  it('W2: an id in the address opens that run, not the newest', async () => {
    open(`/workflow?correlation_id=${OLDER}`);
    await shows(`task of ${OLDER}`);
    expect(panel().textContent).not.toContain(`task of ${NEWEST}`);
    expect(panel().textContent).toContain(`Run ${OLDER}`);
    expect(traceAsks()).toEqual([OLDER]);
  });

  it('W2: a pasted id is trimmed, sent exactly, and put in the address', async () => {
    open('/workflow');
    await shows(`task of ${NEWEST}`);
    fireEvent.change(within(panel()).getByLabelText('Correlation id'), { target: { value: `  ${OLDER}\n` } });
    fireEvent.click(within(panel()).getByRole('button', { name: 'Open run' }));
    await shows(`task of ${OLDER}`);
    expect(panel().textContent).not.toContain(`task of ${NEWEST}`);
    expect(new URLSearchParams(window.location.search).get('correlation_id')).toBe(OLDER);
    expect(traceAsks()).toEqual([NEWEST, OLDER]);
  });

  it('W2: an id with characters an address must encode reaches the exposure unchanged', async () => {
    const odd = 'run/α 1&x=y#z';
    lab.trace = (id) => served(id === odd ? stepsOf(odd) : []);
    open(`/workflow?correlation_id=${encodeURIComponent(odd)}`);
    await shows(`task of ${odd}`);
    expect(traceAsks()).toEqual([odd]);
  });

  it('W3: a run chosen in the Runs list opens that run\'s steps', async () => {
    function Pages() {
      const [path] = useLocation();
      return path === '/workflow'
        ? <LocalDashboardPage pageName="workflow" syncUrl />
        : <LocalDashboardPage pageName="runs" syncUrl />;
    }
    window.history.replaceState(null, '', '/runs');
    render(<Pages />);
    const link = await screen.findByRole('link', { name: OLDER });
    expect(link.getAttribute('href')).toBe(`/workflow?correlation_id=${OLDER}`);
    fireEvent.click(link);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Run path' })).toBeInTheDocument());
    await shows(`task of ${OLDER}`);
    expect(panel().textContent).not.toContain(`task of ${NEWEST}`);
    expect(traceAsks()).toEqual([OLDER]);
  });

  it('W4: an id no run has says this run has no steps, and never shows another run', async () => {
    open(`/workflow?correlation_id=${UNKNOWN}`);
    await shows('No steps recorded for this run');
    expect(panel().textContent).toContain(`Run ${UNKNOWN}`);
    expect(panel().textContent).not.toContain('task of');
    expect(within(panel()).queryAllByRole('listitem')).toHaveLength(0);
    expect(traceAsks()).toEqual([UNKNOWN]);
  });

  it('W5: steps answered for another run are refused, not shown under the id asked for', async () => {
    lab.trace = () => served(stepsOf(NEWEST));
    open(`/workflow?correlation_id=${OLDER}`);
    await waitFor(() => expect(within(panel()).getByRole('alert').textContent)
      .toContain('run-trace.v1 answered steps of another run'));
    expect(panel().textContent).not.toContain('task of');
    expect(within(panel()).queryAllByRole('listitem')).toHaveLength(0);
  });

  it('W6: an earlier run\'s late answer is never shown after the id changed', async () => {
    let release: (answer: Answer) => void = () => {};
    const late = new Promise<Answer>((resolve) => { release = resolve; });
    lab.trace = (id) => (id === OLDER ? late : served(id === NEWEST ? stepsOf(NEWEST) : []));
    open(`/workflow?correlation_id=${OLDER}`);
    await waitFor(() => expect(traceAsks()).toContain(OLDER));
    act(() => { window.history.pushState(null, '', `/workflow?correlation_id=${NEWEST}`); });
    // The second run's own read must be sent and shown while the first is still unanswered.
    await shows(`task of ${NEWEST}`);
    await act(async () => { release(served(stepsOf(OLDER))); await late; });
    await waitFor(() => expect(panel().textContent).toContain(`Run ${NEWEST}`));
    expect(panel().textContent).toContain(`task of ${NEWEST}`);
    expect(panel().textContent).not.toContain(`task of ${OLDER}`);
  });

  it('W7: when the newest run changes and its read fails, the previous run\'s steps are not kept', async () => {
    lab.decisions = served([decision(OLDER, '2026-10-11T15:00:00Z')]);
    open('/workflow');
    await shows(`task of ${OLDER}`);
    lab.decisions = served([decision(OLDER, '2026-10-11T15:00:00Z'), decision(NEWEST, '2026-10-11T15:05:00Z')]);
    lab.trace = (id) => (id === NEWEST
      ? { status: 500, body: { error: 'projection_database_unavailable', topic: RUN_TRACE } }
      : served(stepsOf(String(id))));
    act(() => { requestLocalPageRefresh(); });
    await waitFor(() => expect(within(panel()).getByRole('alert').textContent).toContain(`${RUN_TRACE}: HTTP 500`));
    expect(panel().textContent).toContain(`Run ${NEWEST}`);
    expect(panel().textContent).not.toContain('task of');
    expect(within(panel()).queryAllByRole('listitem')).toHaveLength(0);
  });

  /** A run-trace.v1 answer the test releases when it chooses, and a wait long enough for a wrong write to land. */
  function held(): { answer: Promise<Answer>; release: (answer: Answer) => void } {
    let release: (answer: Answer) => void = () => {};
    const answer = new Promise<Answer>((resolve) => { release = resolve; });
    return { answer, release };
  }
  const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 60)); });

  it('W17: an earlier read\'s late answer does not replace the newer run a refresh already showed', async () => {
    const first = held();
    lab.decisions = served([decision(OLDER, '2026-10-11T15:00:00Z')]);
    lab.trace = (id) => (id === OLDER ? first.answer : served(id === NEWEST ? stepsOf(NEWEST) : []));
    open('/workflow');
    await waitFor(() => expect(traceAsks()).toEqual([OLDER]));
    // A newer run lands and the reader refreshes before the first read is answered.
    lab.decisions = served([decision(OLDER, '2026-10-11T15:00:00Z'), decision(NEWEST, '2026-10-11T15:05:00Z')]);
    act(() => { requestLocalPageRefresh(); });
    await shows(`task of ${NEWEST}`);
    await act(async () => { first.release(served(stepsOf(OLDER))); await first.answer; });
    await settle();
    expect(panel().textContent).toContain(`Run ${NEWEST}`);
    expect(panel().textContent).toContain(`task of ${NEWEST}`);
    expect(panel().textContent).not.toContain(`task of ${OLDER}`);
  });

  it('W18: after a superseded read is dropped, the next refresh is still shown', async () => {
    const first = held();
    lab.decisions = served([decision(OLDER, '2026-10-11T15:00:00Z')]);
    lab.trace = (id) => (id === OLDER ? first.answer : served(stepsOf(String(id))));
    open('/workflow');
    await waitFor(() => expect(traceAsks()).toEqual([OLDER]));
    lab.decisions = served([decision(OLDER, '2026-10-11T15:00:00Z'), decision(NEWEST, '2026-10-11T15:05:00Z')]);
    act(() => { requestLocalPageRefresh(); });
    await shows(`task of ${NEWEST}`);
    await act(async () => { first.release(served(stepsOf(OLDER))); await first.answer; });
    await settle();
    lab.decisions = served([decision(NEWEST, '2026-10-11T15:05:00Z'), decision(THIRD, '2026-10-11T15:10:00Z')]);
    act(() => { requestLocalPageRefresh(); });
    await shows(`task of ${THIRD}`);
    expect(panel().textContent).toContain(`Run ${THIRD}`);
    expect(panel().textContent).not.toContain(`task of ${NEWEST}`);
  });

  it('W19: a superseded read that fails late shows nothing while the newer read is unanswered', async () => {
    const first = held();
    const second = held();
    lab.decisions = served([decision(OLDER, '2026-10-11T15:00:00Z')]);
    lab.trace = (id) => (id === OLDER ? first.answer : id === NEWEST ? second.answer : served([]));
    open('/workflow');
    await waitFor(() => expect(traceAsks()).toEqual([OLDER]));
    lab.decisions = served([decision(OLDER, '2026-10-11T15:00:00Z'), decision(NEWEST, '2026-10-11T15:05:00Z')]);
    act(() => { requestLocalPageRefresh(); });
    await waitFor(() => expect(traceAsks()).toEqual([OLDER, NEWEST]));
    await act(async () => {
      first.release({ status: 500, body: { error: 'projection_database_unavailable', topic: RUN_TRACE } });
      await first.answer;
    });
    await settle();
    // The newer read is still out: the older read's failure is not the page's answer, and the page is still loading.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Run path' })).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Loading runtime exposures');
    await act(async () => { second.release(served(stepsOf(NEWEST))); await second.answer; });
    await shows(`task of ${NEWEST}`);
    expect(panel().textContent).toContain(`Run ${NEWEST}`);
    expect(within(panel()).queryByRole('alert')).toBeNull();
  });

  it('W20: a superseded read whose catalogue fails late shows no page error while the newer read is unanswered', async () => {
    const catalogue = held();
    const second = held();
    lab.heldCatalogue = catalogue.answer;
    lab.trace = (id) => (id === NEWEST ? second.answer : served([]));
    open('/workflow');
    // The first read is waiting on the catalogue. A refresh starts a second read, which gets as far as its run's steps.
    act(() => { requestLocalPageRefresh(); });
    await waitFor(() => expect(traceAsks()).toEqual([NEWEST]));
    await act(async () => { catalogue.release({ status: 500, body: { error: 'unavailable' } }); await catalogue.answer; });
    await settle();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Loading runtime exposures');
    await act(async () => { second.release(served(stepsOf(NEWEST))); await second.answer; });
    await shows(`task of ${NEWEST}`);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('W8: run-trace.v1 not served is a typed state, and the run is not said to have no steps', async () => {
    lab.catalogue = [DECISIONS];
    open('/workflow');
    await shows(`Not served: ${RUN_TRACE}`);
    expect(panel().textContent).toContain(`Run ${NEWEST}`);
    expect(panel().textContent).not.toContain('No steps recorded');
    expect(within(panel()).queryByRole('alert')).toBeNull();
    expect(traceAsks()).toEqual([]);
  });

  it('W9: a failed read is shown as the failure, not as a run with no steps', async () => {
    lab.trace = () => ({ status: 500, body: { error: 'projection_database_unavailable', topic: RUN_TRACE } });
    open('/workflow');
    await waitFor(() => expect(within(panel()).getByRole('alert').textContent).toContain(`${RUN_TRACE}: HTTP 500`));
    expect(panel().textContent).not.toContain('No steps recorded');
    expect(within(panel()).queryAllByRole('listitem')).toHaveLength(0);
  });

  it('W10: a store with no runs says No runs yet and asks for no run\'s steps', async () => {
    lab.decisions = served([]);
    open('/workflow');
    await shows('No runs yet');
    expect(traceAsks()).toEqual([]);
  });

  it('W11: a newest run with no correlation id is a typed state, and run-trace.v1 is never asked without an id', async () => {
    lab.decisions = served([decision(null, '2026-10-11T15:05:00Z'), decision(OLDER, '2026-10-11T15:00:00Z')]);
    open('/workflow');
    await shows('The newest run has no correlation id recorded');
    expect(panel().textContent).not.toContain('task of');
    expect(traceAsks()).toEqual([]);
  });

  it('W12: a truncated answer says it is not the whole run', async () => {
    lab.trace = (id) => served(stepsOf(String(id)), { truncated: true, next_cursor: 'c-5' });
    open(`/workflow?correlation_id=${OLDER}`);
    await shows(`task of ${OLDER}`);
    expect(within(panel()).getByText(/Not the whole run: run-trace\.v1 answered a truncated page of 5 steps/)).toBeInTheDocument();
  });

  it('W12: a whole answer carries no truncation note', async () => {
    open(`/workflow?correlation_id=${OLDER}`);
    await shows(`task of ${OLDER}`);
    expect(panel().textContent).not.toContain('Not the whole run');
  });

  it.each([
    ['empty', '/workflow?correlation_id='],
    ['blank', '/workflow?correlation_id=%20%20'],
  ])('W13: an %s id in the address is no id: the newest run is shown', async (_name, path) => {
    open(path);
    await shows(`task of ${NEWEST}`);
    expect(traceAsks()).toEqual([NEWEST]);
  });

  it('W13: Newest run clears a chosen id', async () => {
    open(`/workflow?correlation_id=${OLDER}`);
    await shows(`task of ${OLDER}`);
    fireEvent.click(within(panel()).getByRole('button', { name: 'Newest run' }));
    await shows(`task of ${NEWEST}`);
    expect(new URLSearchParams(window.location.search).has('correlation_id')).toBe(false);
    expect(within(panel()).queryByRole('button', { name: 'Newest run' })).toBeNull();
  });

  it('W14: a Runs row with no correlation id has no link', () => {
    render(<RunsTable decisions={[decision(OLDER, '2026-10-11T15:00:00Z'), decision(null, '2026-10-11T15:05:00Z')]} sessions={[]} />);
    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([`/workflow?correlation_id=${OLDER}`]);
  });

  it('W15: the run\'s backend, host and tier come from its own decision row', async () => {
    open(`/workflow?correlation_id=${OLDER}`);
    await shows(`task of ${OLDER}`);
    const summary = within(panel()).getByRole('region', { name: 'Run summary' });
    expect(summary.textContent).toContain(`backend-of-${OLDER}`);
    expect(summary.textContent).toContain(`host-of-${OLDER}`);
    expect(summary.textContent).toContain('local (free_local)');
    expect(summary.textContent).not.toContain(`backend-of-${NEWEST}`);
  });

  it('W15: a run with no served decision row says so, and borrows no other run\'s', async () => {
    lab.trace = (id) => served(id === UNKNOWN ? stepsOf(UNKNOWN) : []);
    open(`/workflow?correlation_id=${UNKNOWN}`);
    await shows(`task of ${UNKNOWN}`);
    expect(within(panel()).getByText('No decision is served for this run')).toBeInTheDocument();
    expect(panel().textContent).not.toContain('backend-of-');
  });

  it('W16: without address sync a pasted id still opens that run, and the address is left alone', async () => {
    window.history.replaceState(null, '', '/somewhere');
    render(<LocalDashboardPage pageName="workflow" />);
    await shows(`task of ${NEWEST}`);
    fireEvent.change(within(panel()).getByLabelText('Correlation id'), { target: { value: OLDER } });
    fireEvent.click(within(panel()).getByRole('button', { name: 'Open run' }));
    await shows(`task of ${OLDER}`);
    expect(window.location.pathname + window.location.search).toBe('/somewhere');
  });
});
