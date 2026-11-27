// @vitest-environment jsdom
// OMN-26665 AC4 (review blocker): the Overview header tells a served-empty status read ("Runtime status not recorded")
// from a failed or timed-out one ("Runtime status unavailable"). Failure modes:
//   T1  a timed-out status read in the page reads "not recorded", the words of an empty store
//   T2  (control) a served-empty status read still reads "Runtime status not recorded"
//   T3  the strip given a failed status read reads "Runtime status unavailable"
//   T4  a failed read does not hide a state that was read: a served running row still reads "Runtime running"
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DECISIONS = 'onex.snapshot.projection.delegation.decisions.v1';
const METERING = 'onex.snapshot.projection.metering-summary.v1';
const STATUS = 'onex.snapshot.projection.local-environment.v1';

const harness = vi.hoisted(() => ({
  delays: {} as Record<string, number>,
  answers: {} as Record<string, unknown[]>,
}));

vi.mock('@/data-source', () => ({
  createSnapshotSource: () => ({
    async *readAll() { yield []; },
    readSnapshot: async (topic: string) => {
      const wait = harness.delays[topic] ?? 0;
      if (wait > 0) await new Promise<void>((resolve) => { setTimeout(resolve, wait); });
      const rows = harness.answers[topic] ?? [];
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
  fetchExposureCensus: async () => ({ rows: [DECISIONS, METERING, STATUS].map((topic) => ({ topic, reachability: 'reachable' })) }),
}));

import { LocalDashboardPage, OverviewStatusStrip } from '@/pages/LocalDashboardPage';

const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const strip = () => screen.getAllByRole('status', { name: 'Runtime status' })[0]!;
const NOW = Date.UTC(2026, 10, 25, 1, 30, 0);

describe('OMN-26665 AC4: the header tells an empty status read from a failed one', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date(NOW));
    window.history.replaceState(null, '', '/overview');
    harness.delays = {};
    harness.answers = { [DECISIONS]: [], [METERING]: [], [STATUS]: [] };
  });
  afterEach(() => { vi.useRealTimers(); });

  it('T1: a status read that times out at 5 s says Runtime status unavailable', async () => {
    harness.delays = { [STATUS]: 6_000 };
    render(<LocalDashboardPage pageName="overview" />);
    await tick(5_500);
    expect(strip().textContent).toContain('Runtime status unavailable');
    expect(strip().textContent).not.toContain('Runtime status not recorded');
  });

  it('T2 control: a served-empty status read still says Runtime status not recorded', async () => {
    render(<LocalDashboardPage pageName="overview" />);
    await tick(500);
    expect(strip().textContent).toContain('Runtime status not recorded');
    expect(strip().textContent).not.toContain('Runtime status unavailable');
  });

  it('T3: the strip given a failed status read says Runtime status unavailable, and an empty one not recorded', () => {
    const { rerender } = render(<OverviewStatusStrip env={null} statusFailed decisions={[]} routing={null} now={NOW} />);
    expect(strip().textContent).toContain('Runtime status unavailable');
    rerender(<OverviewStatusStrip env={null} decisions={[]} routing={null} now={NOW} />);
    expect(strip().textContent).toContain('Runtime status not recorded');
  });

  it('T4: a state that was read is shown even when the flag is set', () => {
    render(<OverviewStatusStrip env={{ observed_state: 'running' }} statusFailed decisions={[]} routing={null} now={NOW} />);
    expect(strip().textContent).toContain('Runtime running');
  });
});
