// @vitest-environment jsdom
// OMN-19994 AC1: a fresh install shows Runs rows after one delegation. Measured on .201 2026-10-05 18:18Z: the
// store served one decision, but `delegation.savings.v1` answered 503 `projection_table_missing` ("the local store
// has no table 'projection_delegation_savings'"), and the Runs page hid the decision and printed
// "HTTP 503 Service Unavailable". That code is a refusal the read node's contract declares (this store does not
// serve the exposure), so it is a typed not-served state, and a lookup binding that is not served must not hide
// the rows its table's first binding served.
//
// Real data path: HttpSnapshotSource, the exposure census and tenant resolution all run; only fetch is stubbed,
// with the bodies `onex dashboard` sent in the lab.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/config/generated/data-source-defaults', () => ({
  DATA_SOURCE_DEFAULT_MODE: 'http',
  DATA_SOURCE_DEFAULT_URL: '',
  DATA_SOURCE_DEFAULT_SQLITE_DB_PATH: '',
  PROJECTION_TENANT_ID_DEFAULT: 'c94fa3c5-ea87-4dbb-a4fc-424343bac7a0',
}));

import { LocalDashboardPage } from './LocalDashboardPage';
import { resetExposureMetadataCache } from '@/data-source/projection-tenant';

const DECISIONS = 'onex.snapshot.projection.delegation.decisions.v1';
const SAVINGS = 'onex.snapshot.projection.delegation.savings.v1';
const RUN_ID = '9c7083c2-213e-4a84-aae7-fae9c18af576';

const decision = {
  correlation_id: RUN_ID, written_at: '2026-10-05T18:10:56Z', created_at: '2026-10-05T18:10:56Z',
  quality_gate_passed: true, quality_gate_detail: 'completed', model_name: 'Qwen3.8-27B', latency_ms: 813,
  tokens_input: 162, tokens_output: 52, task_type: 'summarization', cost_tier_name: 'local', actual_score: '1.000',
  data_source: 'real', backend_id: 'local-coder', host: 'lab', cost_tier_type: 'local',
};

type Answer = { status: number; body: unknown };

const lab = {
  catalogue: [DECISIONS, SAVINGS] as string[],
  answers: {} as Record<string, Answer>,
};

const TABLE_MISSING: Answer = {
  status: 503,
  body: {
    status: 'degraded', error: 'projection_table_missing', topic: SAVINGS,
    detail: "the local store has no table 'projection_delegation_savings'",
  },
};

function respond({ status, body }: Answer): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : status === 503 ? 'Service Unavailable' : 'Internal Server Error',
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
          topics: lab.catalogue.map((topic) => ({
            topic, status: 'ok', bus_backed: true, backing: 'bus', tenant_column: 'tenant_id', tenant_scoped: true,
          })),
        },
      });
    }
    const topic = decodeURIComponent(url.pathname.replace(/^\/projection\//, ''));
    return respond(lab.answers[topic] ?? { status: 404, body: { error: 'unknown_topic', topic } });
  }));
}

function panel(title: string): HTMLElement {
  return screen.getByRole('heading', { name: title }).closest('article') as HTMLElement;
}

beforeEach(() => {
  vi.stubEnv('VITE_DATA_SOURCE', 'http');
  resetExposureMetadataCache();
  lab.catalogue = [DECISIONS, SAVINGS];
  lab.answers = {
    [DECISIONS]: { status: 200, body: { rows: [decision], row_count: 1 } },
    [SAVINGS]: TABLE_MISSING,
  };
  stubFetch();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Runs with a savings lookup this store does not serve (OMN-19994 AC1)', () => {
  it('shows the served run and names the unserved lookup as a typed state, not an HTTP error', async () => {
    render(<LocalDashboardPage pageName="runs" />);
    const runs = await waitFor(() => panel('Recent runs'));
    await waitFor(() => expect(within(runs).getByText(RUN_ID)).toBeInTheDocument());
    expect(within(runs).getByText(`Not served: ${SAVINGS} (this store has no table for it)`)).toBeInTheDocument();
    expect(within(runs).queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/HTTP 503/)).toBeNull();
  });

  it('shows the served run when the census does not declare the lookup at all', async () => {
    lab.catalogue = [DECISIONS];
    render(<LocalDashboardPage pageName="runs" />);
    const runs = await waitFor(() => panel('Recent runs'));
    await waitFor(() => expect(within(runs).getByText(RUN_ID)).toBeInTheDocument());
    expect(within(runs).getByText(`Not served: ${SAVINGS}`)).toBeInTheDocument();
    expect(within(runs).queryByRole('alert')).toBeNull();
  });

  it('still shows a real lookup failure as an error, beside the served run', async () => {
    lab.answers[SAVINGS] = { status: 500, body: { error: 'projection_database_unavailable', topic: SAVINGS } };
    render(<LocalDashboardPage pageName="runs" />);
    const runs = await waitFor(() => panel('Recent runs'));
    await waitFor(() => expect(within(runs).getByText(RUN_ID)).toBeInTheDocument());
    expect(within(runs).getByRole('alert').textContent).toContain(`${SAVINGS}: HTTP 500`);
  });

  it('keeps any other 503 an error: only the declared table-missing refusal is not-served', async () => {
    lab.answers[DECISIONS] = { status: 503, body: { error: 'projection_database_unavailable', topic: DECISIONS } };
    render(<LocalDashboardPage pageName="runs" />);
    const runs = await waitFor(() => panel('Recent runs'));
    await waitFor(() => expect(within(runs).getAllByRole('alert').map((alert) => alert.textContent))
      .toContain(`${DECISIONS}: HTTP 503 Service Unavailable`));
    expect(within(runs).queryByText(RUN_ID)).toBeNull();
    expect(within(runs).queryByText(/^Not served: .*decisions/)).toBeNull();
  });

  it('says the run table itself is not served when the decisions table is missing', async () => {
    lab.answers[DECISIONS] = { ...TABLE_MISSING, body: { ...(TABLE_MISSING.body as object), topic: DECISIONS } };
    render(<LocalDashboardPage pageName="runs" />);
    const runs = await waitFor(() => panel('Recent runs'));
    await waitFor(() => expect(within(runs).getByText(`Not served: ${DECISIONS} (this store has no table for it)`))
      .toBeInTheDocument());
    expect(within(runs).queryByText(RUN_ID)).toBeNull();
    expect(screen.queryByText(/HTTP 503/)).toBeNull();
  });

  it('shows No runs yet on a fresh store before the first delegation', async () => {
    lab.answers[DECISIONS] = { status: 200, body: { rows: [], row_count: 0 } };
    render(<LocalDashboardPage pageName="runs" />);
    const runs = await waitFor(() => panel('Recent runs'));
    await waitFor(() => expect(within(runs).getByText('No runs yet')).toBeInTheDocument());
    expect(screen.queryByText(/HTTP 503/)).toBeNull();
  });
});

describe('Overview run tables with the same unserved lookup (OMN-19994 AC1, same class)', () => {
  it('shows the run in Recent runs and Last run', async () => {
    render(<LocalDashboardPage pageName="overview" />);
    const recent = await waitFor(() => panel('Recent runs'));
    await waitFor(() => expect(within(recent).getByText(RUN_ID)).toBeInTheDocument());
    expect(within(panel('Last run')).getByText(RUN_ID)).toBeInTheDocument();
    expect(within(recent).queryByRole('alert')).toBeNull();
  });
});
