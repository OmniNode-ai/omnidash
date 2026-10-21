// @vitest-environment jsdom
// OMN-19920: one run whole on the Workflow page. Selecting a run in Runs opens Workflow for its correlation id; that
// view already shows the run's model, backend, tokens, recorded cost and status from delegation.decisions.v1. It now
// also shows the run's answer, read from delegation.correlation-trace.v1 for exactly that correlation id (the per-run
// detail surface over delegation_events, keyed on correlation_id), its typed cause when it failed, and its receipt id.
// The saving against the named baseline is NOT in this change: it waits on a ruling about the per-run saving guard.
//
// "SQLite mode" here is the local store `onex dashboard` serves: the page reads it through the same HTTP projection
// path as every live mode (CLAUDE.md, Data sources), and the catalogue marks it as a local store the way the other
// SQLite-backed page tests do (a topic refused as not_in_local_store). The real HttpSnapshotSource, exposure census and
// tenant resolution run; only fetch is stubbed.
//
// Failure modes, each with a test below:
//   R1  a run opened from the Runs list shows another run's fields, or one of answer, model, backend, tokens in/out,
//       recorded cost or status is missing from its view (AC2, TI3);
//   R2  the answer is read without the run's correlation id (every tenant's answers at once), with another id, or is
//       read but not shown (AC4 a);
//   R2s the answer's read states collapse into one: not served, read failed, and served-but-no-answer must each say
//       so, and an unread answer is never shown as an empty one;
//   R2f the exposure answers a row of another correlation id and it is shown as this run's answer;
//   R3  a failed run's typed cause is not on the view (AC5);
//   R4  the receipt id is missing, or is not the run's correlation id (the id receipt.json records as receipt_id) (AC5);
//   R5  the answer is rendered as markup: HTML in the answer creates elements (an img with an onerror handler runs),
//       or markdown is turned into HTML (AC6);
//   R5l a very long answer floods the page instead of being folded, or is cut so the whole text is lost;
//   R6  the page reads a field its contract does not declare, or one the captured lab catalogue does not serve;
//   R7  an earlier run's late answer is shown after the run changed, or the previous run's answer is kept on screen
//       when the next run's answer read fails.
import { readFileSync } from 'node:fs';
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

import { LocalDashboardPage } from './LocalDashboardPage';
import { RunAnswer } from './local/workflow-analysis';
import { resetExposureMetadataCache } from '@/data-source/projection-tenant';
import { requestLocalPageRefresh } from '@/services/local-page-refresh';

const PREFIX = 'onex.snapshot.projection.';
const DECISIONS = `${PREFIX}delegation.decisions.v1`;
const SAVINGS = `${PREFIX}delegation.savings.v1`;
const RUN_TRACE = `${PREFIX}run-trace.v1`;
const ANSWERS = `${PREFIX}delegation.correlation-trace.v1`;
/** Refused by a local SQLite store that has no table for it: how the catalogue of `onex dashboard` names its store. */
const NOT_IN_LOCAL_STORE = `${PREFIX}cost.savings-overview.v1`;
const OLDER = '11111111-1111-4111-8111-111111111111';
const NEWEST = '22222222-2222-4222-8222-222222222222';

type Row = Record<string, unknown>;
type Answer = { status: number; body: unknown };

function decision(id: string, writtenAt: string, extra: Row = {}): Row {
  const older = id === OLDER;
  return {
    correlation_id: id, written_at: writtenAt, created_at: writtenAt, quality_gate_passed: true,
    quality_gate_detail: 'completed', model_name: older ? 'model-of-older' : 'model-of-newest', latency_ms: 813,
    tokens_input: older ? 162 : 90, tokens_output: older ? 52 : 20, task_type: 'summarization', cost_tier_name: 'local',
    cost_tier_type: 'free_local', actual_score: '1.000', data_source: 'real', backend_id: `backend-of-${id}`,
    host: `host-of-${id}`, cost_usd: older ? '0.0021' : '0.0009', terminal_ok: 1, ...extra,
  };
}

/** One delegation_events row for the run, as correlation-trace.v1 serves it. */
function answerRow(id: string, text: unknown = `answer of ${id}`, extra: Row = {}): Row {
  return {
    correlation_id: id, response_text: text, model_name: id === OLDER ? 'model-of-older' : 'model-of-newest',
    created_at: '2026-10-11T15:00:00Z', data_source: 'real', tenant_id: TENANT, ...extra,
  };
}

const served = (rows: Row[], extra: Row = {}): Answer => ({ status: 200, body: { rows, row_count: rows.length, ...extra } });

const lab = {
  catalogue: [] as string[],
  decisions: served([]) as Answer,
  answer: ((_id: string | null) => served([])) as (id: string | null) => Answer | Promise<Answer>,
  requests: [] as URL[],
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
      return respond({
        status: 200,
        body: {
          topics: [
            ...lab.catalogue.map((topic) => ({
              topic, status: 'ok', bus_backed: true, backing: 'bus', tenant_column: 'tenant_id', tenant_scoped: true,
            })),
            { topic: NOT_IN_LOCAL_STORE, status: 'degraded', bus_backed: false, backing: 'not_in_local_store',
              degraded_reason: 'projection_table_missing' },
          ],
        },
      });
    }
    lab.requests.push(url);
    const topic = topicOf(url);
    if (topic === DECISIONS) return respond(lab.decisions);
    if (topic === ANSWERS) return respond(await lab.answer(url.searchParams.get('correlation_id')));
    if (topic === RUN_TRACE) return respond(served([]));
    if (topic === SAVINGS) return respond(served([{ sessions: [] }]));
    return respond({ status: 404, body: { error: 'unknown_topic', topic } });
  }));
}

function topicOf(url: URL): string {
  return decodeURIComponent(url.pathname.replace(/^\/projection\//, ''));
}

/** The correlation id of every correlation-trace.v1 request sent so far, in order (null: the request named none). */
function answerAsks(): Array<string | null> {
  return lab.requests.filter((url) => topicOf(url) === ANSWERS).map((url) => url.searchParams.get('correlation_id'));
}

function panel(): HTMLElement {
  return screen.getByRole('heading', { name: 'Run path' }).closest('article') as HTMLElement;
}

/** The run's answer card. */
function answerCard(): HTMLElement {
  return within(panel()).getByRole('region', { name: 'Answer' });
}

/** Every label and its value the panel shows, from its definition lists. */
function fieldsShown(): Record<string, string> {
  return Object.fromEntries(within(panel()).getAllByRole('term')
    .map((term) => [term.textContent ?? '', term.nextElementSibling?.textContent ?? '']));
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
  lab.catalogue = [DECISIONS, RUN_TRACE, SAVINGS, ANSWERS];
  lab.decisions = served([decision(OLDER, '2026-10-11T15:00:00Z'), decision(NEWEST, '2026-10-11T15:05:00Z')]);
  lab.answer = (id) => served(id === OLDER || id === NEWEST ? [answerRow(id)] : []);
  lab.requests = [];
  stubFetch();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.history.replaceState(null, '', '/');
});

describe('OMN-19920: one run whole on the Workflow page', () => {
  it('R1: a run chosen in Runs opens Workflow with its answer, model, backend, tokens, cost and status', async () => {
    function Pages() {
      const [path] = useLocation();
      return path === '/workflow'
        ? <LocalDashboardPage pageName="workflow" syncUrl />
        : <LocalDashboardPage pageName="runs" syncUrl />;
    }
    window.history.replaceState(null, '', '/runs');
    render(<Pages />);
    fireEvent.click(await screen.findByRole('link', { name: OLDER }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Run path' })).toBeInTheDocument());
    await shows(`answer of ${OLDER}`);
    expect(answerCard().textContent).toContain(`answer of ${OLDER}`);
    const shown = fieldsShown();
    expect({
      Model: shown.Model, Backend: shown.Backend, 'Tokens in': shown['Tokens in'], 'Tokens out': shown['Tokens out'],
      'Recorded cost (USD)': shown['Recorded cost (USD)'], Status: shown.Status,
    }).toEqual({
      Model: 'model-of-older', Backend: `backend-of-${OLDER}`, 'Tokens in': '162', 'Tokens out': '52',
      'Recorded cost (USD)': '$0.0021', Status: 'passed',
    });
    expect(panel().textContent).not.toContain(`answer of ${NEWEST}`);
    expect(answerAsks()).toEqual([OLDER]);
  });

  it('R2: in SQLite mode the answer is read for exactly the run\'s correlation id, never unfiltered, and shown', async () => {
    open(`/workflow?correlation_id=${OLDER}`);
    await shows(`answer of ${OLDER}`);
    expect(answerAsks()).toEqual([OLDER]);
    const ask = lab.requests.find((url) => topicOf(url) === ANSWERS)!;
    expect(ask.searchParams.get('tenant')).toBe(TENANT);
  });

  it('R2: with no id in the address the answer is read for the newest run only', async () => {
    open('/workflow');
    await shows(`answer of ${NEWEST}`);
    expect(answerAsks()).toEqual([NEWEST]);
    expect(panel().textContent).not.toContain(`answer of ${OLDER}`);
  });

  it('R2s: correlation-trace.v1 not served is said, never asked, and never shown as an empty answer', async () => {
    lab.catalogue = [DECISIONS, RUN_TRACE, SAVINGS];
    open(`/workflow?correlation_id=${OLDER}`);
    await waitFor(() => expect(answerCard().textContent).toContain('The answer is not served'));
    expect(answerCard().textContent).not.toContain('No answer recorded');
    expect(answerAsks()).toEqual([]);
  });

  it('R2s: a failed answer read is named as the failure, not as a run with no answer', async () => {
    lab.answer = () => ({ status: 500, body: { error: 'projection_database_unavailable', topic: ANSWERS } });
    open(`/workflow?correlation_id=${OLDER}`);
    await waitFor(() => expect(answerCard().textContent).toContain('The answer could not be read'));
    expect(answerCard().textContent).toContain('HTTP 500');
    expect(answerCard().textContent).not.toContain('No answer recorded');
  });

  it.each([
    ['no row', () => served([])],
    ['a row with no response_text', () => served([answerRow(OLDER, null)])],
    ['a row with an empty response_text', () => served([answerRow(OLDER, '')])],
  ])('R2s: %s for the run reads No answer recorded', async (_name, answer) => {
    lab.answer = answer;
    open(`/workflow?correlation_id=${OLDER}`);
    await waitFor(() => expect(answerCard().textContent).toContain('No answer recorded for this run'));
  });

  it('R2f: an answer row of another correlation id is refused, not shown under this run', async () => {
    lab.answer = () => served([answerRow(NEWEST)]);
    open(`/workflow?correlation_id=${OLDER}`);
    await waitFor(() => expect(answerCard().textContent).toContain('answered another run'));
    expect(panel().textContent).not.toContain(`answer of ${NEWEST}`);
  });

  it('R3: a failed run shows its typed cause', async () => {
    lab.decisions = served([decision(OLDER, '2026-10-11T15:00:00Z', {
      quality_gate_passed: false, quality_gate_detail: 'provider_timeout: no answer in 30 s', terminal_ok: 0,
    })]);
    open(`/workflow?correlation_id=${OLDER}`);
    await shows(`backend-of-${OLDER}`);
    const shown = fieldsShown();
    expect([shown.Status, shown.Cause]).toEqual(['failed', 'provider_timeout: no answer in 30 s']);
  });

  it('R4: the receipt id is the run\'s correlation id', async () => {
    open(`/workflow?correlation_id=${OLDER}`);
    await shows(`backend-of-${OLDER}`);
    expect(fieldsShown()['Receipt id']).toBe(OLDER);
  });

  it.each([
    ['HTML', '<img src=x onerror=alert(1)><b>x</b>'],
    ['markdown', '**bold** and `code`\n# heading\n[link](http://example.invalid)'],
  ])('R5: %s in the answer is shown as text and creates no element', async (_name, text) => {
    lab.answer = (id) => served([answerRow(String(id), text)]);
    open(`/workflow?correlation_id=${OLDER}`);
    await waitFor(() => expect(answerCard().textContent).toContain(text));
    for (const tag of ['img', 'b', 'strong', 'code', 'h1', 'a', 'script']) {
      expect(`${tag}: ${answerCard().querySelectorAll(tag).length}`).toBe(`${tag}: 0`);
    }
  });

  it('R5l: a long answer is folded, and its whole text is kept', async () => {
    const long = Array.from({ length: 80 }, (_, line) => `line ${line + 1} of a long answer`).join('\n');
    lab.answer = (id) => served([answerRow(String(id), long)]);
    open(`/workflow?correlation_id=${OLDER}`);
    await waitFor(() => expect(answerCard().querySelector('details')).not.toBeNull());
    const fold = answerCard().querySelector('details')!;
    expect(fold.open).toBe(false);
    expect(fold.textContent).toContain(long);
  });

  it('R5l: a short answer is not folded', async () => {
    open(`/workflow?correlation_id=${OLDER}`);
    await shows(`answer of ${OLDER}`);
    expect(answerCard().querySelector('details')).toBeNull();
  });

  it('R6: the Workflow contract declares each field the answer and record read, and the lab catalogue serves each', () => {
    const contracts = JSON.parse(readFileSync('src/pages/local/workflow.contracts.yaml', 'utf8')) as {
      components: Array<{ component_id: string; data_bindings: Array<{ binding_id: string; projection_topic: string; required_fields: string[] }> }>;
    };
    const catalogue = JSON.parse(readFileSync('src/pages/local/served-catalogue.lab.json', 'utf8')) as {
      exposures: Array<{ topic: string; status: string; columns: string[] }>;
    };
    const bindings = contracts.components.find((c) => c.component_id === 'workflow-run-path')?.data_bindings ?? [];
    const check = (bindingId: string, topic: string, fields: string[]) => {
      const binding = bindings.find((b) => b.binding_id === bindingId);
      const exposure = catalogue.exposures.find((e) => e.topic === topic);
      expect(`${bindingId}: ${binding?.projection_topic}, ${exposure?.status}`).toBe(`${bindingId}: ${topic}, ok`);
      for (const field of fields) {
        expect(`${field}: declared ${binding?.required_fields.includes(field)}, served ${exposure?.columns.includes(field)}`)
          .toBe(`${field}: declared true, served true`);
      }
    };
    check('workflow-run-answer', ANSWERS, ['correlation_id', 'response_text', 'model_name', 'created_at', 'data_source']);
    check('workflow-run-path-decisions', DECISIONS, ['terminal_ok', 'cost_usd']);
  });

  it('R7: an earlier run\'s late answer is never shown after the run changed', async () => {
    let release: (answer: Answer) => void = () => {};
    const late = new Promise<Answer>((resolve) => { release = resolve; });
    lab.answer = (id) => (id === OLDER ? late : served(id === NEWEST ? [answerRow(NEWEST)] : []));
    open(`/workflow?correlation_id=${OLDER}`);
    await waitFor(() => expect(answerAsks()).toContain(OLDER));
    act(() => { window.history.pushState(null, '', `/workflow?correlation_id=${NEWEST}`); });
    await shows(`answer of ${NEWEST}`);
    await act(async () => { release(served([answerRow(OLDER)])); await late; });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 60)); });
    expect(panel().textContent).toContain(`Run ${NEWEST}`);
    expect(panel().textContent).toContain(`answer of ${NEWEST}`);
    expect(panel().textContent).not.toContain(`answer of ${OLDER}`);
  });

  it('R7: the answer card shows no answer read for another run, whatever snapshot it is handed', () => {
    render(<RunAnswer runId={NEWEST} read={{
      topic: ANSWERS, runId: OLDER, rows: [answerRow(OLDER)], rowCount: 1, dataFreshness: 'fresh', latestEventAt: null,
      readAt: '2026-10-11T15:00:00Z',
    }} />);
    const card = screen.getByRole('region', { name: 'Answer' });
    expect(card.textContent).not.toContain(`answer of ${OLDER}`);
    expect(card.textContent).toContain('Reading the answer');
  });

  it('R7: when the newest run changes and its answer read fails, the previous run\'s answer is not kept', async () => {
    lab.decisions = served([decision(OLDER, '2026-10-11T15:00:00Z')]);
    open('/workflow');
    await shows(`answer of ${OLDER}`);
    lab.decisions = served([decision(OLDER, '2026-10-11T15:00:00Z'), decision(NEWEST, '2026-10-11T15:05:00Z')]);
    lab.answer = (id) => (id === NEWEST
      ? { status: 500, body: { error: 'projection_database_unavailable', topic: ANSWERS } }
      : served([answerRow(String(id))]));
    act(() => { requestLocalPageRefresh(); });
    await waitFor(() => expect(answerCard().textContent).toContain('The answer could not be read'));
    expect(panel().textContent).toContain(`Run ${NEWEST}`);
    expect(panel().textContent).not.toContain(`answer of ${OLDER}`);
  });
});
