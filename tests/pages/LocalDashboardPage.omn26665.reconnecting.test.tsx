// @vitest-environment jsdom
// OMN-26665 AC3: when the server cannot be reached, the page keeps the last rows it read on screen and says it is
// reconnecting; the notice clears as soon as reads succeed again. Failure modes, each with a test below:
//   C1  every read failing (catalogue and projections) blanking the rows instead of keeping them
//   C2  rows kept but no word that the page is reconnecting, so stale rows read as current
//   C3  the notice outliving the outage once reads succeed again
//   C4  (control) one exposure failing while the server answers is that panel's own state, not a reconnect
//   C5  a first load that never succeeded has no rows to keep, so it must not claim to be reconnecting
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DECISIONS = 'onex.snapshot.projection.delegation.decisions.v1';
const SAVINGS = 'onex.snapshot.projection.delegation.savings.v1';

const harness = vi.hoisted(() => ({
  serverDown: false,
  failTopic: null as string | null,
}));

vi.mock('@/data-source', () => ({
  createSnapshotSource: () => ({
    async *readAll() { yield []; },
    readSnapshot: async (topic: string) => {
      if (harness.serverDown || harness.failTopic === topic) {
        throw new Error(harness.serverDown ? 'fetch failed' : `Projection ${topic} failed: HTTP 503 Service Unavailable`);
      }
      const rows = topic === DECISIONS ? [decisionRow('run-1')] : [{ sessions: [] }];
      return { rows, rowCount: rows.length, dataFreshness: 'fresh' as const, latestEventAt: null, readAt: new Date().toISOString() };
    },
  }),
}));
vi.mock('@/data-source/data-source-override', () => ({ resolveEffectiveDataSource: () => ({ mode: 'http' }) }));
vi.mock('@/data-source/projection-tenant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data-source/projection-tenant')>()),
  resolveConfiguredTenant: () => 'tenant-a',
}));
vi.mock('@/data-source/exposure-census', () => ({
  fetchExposureCensus: async () => {
    if (harness.serverDown) throw new Error('fetch failed');
    return { rows: [DECISIONS, SAVINGS].map((topic) => ({ topic, reachability: 'reachable' })) };
  },
}));

import { LocalDashboardPage } from '@/pages/LocalDashboardPage';

function decisionRow(id: string) {
  return {
    correlation_id: id, written_at: '2026-11-25T01:00:00Z', created_at: '2026-11-25T01:00:00Z', quality_gate_passed: true,
    quality_gate_detail: 'completed', model_name: 'Qwen3.8-27B', latency_ms: 813, tokens_input: 162, tokens_output: 52,
    task_type: 'summarization', cost_tier_name: 'local', actual_score: '1.000', data_source: 'real',
  };
}

async function settle() {
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}
const nextPoll = () => act(async () => { await vi.advanceTimersByTimeAsync(125_000); });
const reconnecting = () => screen.queryByText(/reconnecting/i);

describe('OMN-26665 AC3: an unreachable server keeps the last rows and says it is reconnecting', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-11-25T01:30:00Z'));
    window.history.replaceState(null, '', '/runs');
    harness.serverDown = false;
    harness.failTopic = null;
  });
  afterEach(() => { vi.useRealTimers(); });

  it('C1+C2: every read failing keeps run-1 on screen and shows the reconnecting text', async () => {
    render(<LocalDashboardPage pageName="runs" />);
    await settle();
    expect(screen.getByRole('link', { name: 'run-1' })).toBeInTheDocument();
    expect(reconnecting()).toBeNull();

    harness.serverDown = true;
    await nextPoll();
    expect(screen.getByRole('link', { name: 'run-1' })).toBeInTheDocument();
    expect(reconnecting()).toBeInTheDocument();
  });

  it('C3: the notice clears once reads succeed again, and run-1 is still there', async () => {
    render(<LocalDashboardPage pageName="runs" />);
    await settle();
    harness.serverDown = true;
    await nextPoll();
    expect(reconnecting()).toBeInTheDocument();

    harness.serverDown = false;
    await nextPoll();
    expect(reconnecting()).toBeNull();
    expect(screen.getByRole('link', { name: 'run-1' })).toBeInTheDocument();
  });

  it('C4 control: one exposure failing while the server answers is not a reconnect', async () => {
    render(<LocalDashboardPage pageName="runs" />);
    await settle();
    harness.failTopic = SAVINGS;
    await nextPoll();
    expect(reconnecting()).toBeNull();
    expect(screen.getByRole('link', { name: 'run-1' })).toBeInTheDocument();
  });

  it('C5 control: a page whose first read already failed has nothing to keep and does not claim to reconnect', async () => {
    harness.serverDown = true;
    render(<LocalDashboardPage pageName="runs" />);
    await settle();
    expect(reconnecting()).toBeNull();
  });

  // AC6 (hosted proof, mechanism b, page half): what a viewer sees while a pod rolls out. Reads fail while the server is
  // away; the last rows stay and the page says it is reconnecting; when the server is back the notice goes and the rows stay.
  it('AC6 rollout: the page keeps its rows and reads Reconnecting while reads fail, then clears', async () => {
    render(<LocalDashboardPage pageName="runs" />);
    await settle();
    expect(reconnecting()).toBeNull();

    harness.serverDown = true;
    await nextPoll();
    expect(screen.getByRole('link', { name: 'run-1' })).toBeInTheDocument();
    expect(screen.getByTestId('reconnecting')).toHaveTextContent(/^Reconnecting to the runtime/);
    expect(screen.getByRole('link', { name: 'run-1' })).toBeVisible();

    harness.serverDown = false;
    await nextPoll();
    expect(screen.queryByTestId('reconnecting')).toBeNull();
    expect(screen.getByRole('link', { name: 'run-1' })).toBeInTheDocument();
  });
});
