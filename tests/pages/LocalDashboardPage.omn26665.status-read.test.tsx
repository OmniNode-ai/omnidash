// @vitest-environment jsdom
// T1  STATUS read times out (6s > 5s deadline) -> strip must say "Runtime status unavailable", not "not recorded"
// T2  all reads empty, no delay -> strip must say "Runtime status not recorded", not "unavailable"
// T3  strip with statusFailed=true says "unavailable"; same strip without the flag says "not recorded"
// T4  observed_state present -> strip says "Runtime <state>" even when statusFailed is set

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalDashboardPage, OverviewStatusStrip } from '@/pages/LocalDashboardPage';

const DECISIONS = 'onex.snapshot.projection.delegation.decisions.v1';
const METERING = 'onex.snapshot.projection.metering-summary.v1';
const STATUS = 'onex.snapshot.projection.local-environment.v1';
const NOW = Date.UTC(2026, 10, 25, 1, 30, 0);

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

const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const strip = () => screen.getAllByRole('status', { name: 'Runtime status' })[0]!;

describe('OMN-26665 AC4: the header tells an empty status read from a failed one', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date(NOW));
    window.history.replaceState(null, '', '/overview');
    harness.delays = {};
    harness.answers = { [DECISIONS]: [], [METERING]: [], [STATUS]: [] };
  });
  afterEach(() => { vi.useRealTimers(); });

  it('T1: a 6 s status read times out and the strip says unavailable', async () => {
    harness.delays[STATUS] = 6_000;
    render(<LocalDashboardPage pageName="overview" />);
    await tick(5_500);
    const text = strip().textContent!;
    expect(text).toContain('Runtime status unavailable');
    expect(text).not.toContain('Runtime status not recorded');
  });

  it('T2: empty reads with no delay say not recorded, not unavailable', async () => {
    render(<LocalDashboardPage pageName="overview" />);
    await tick(500);
    const text = strip().textContent!;
    expect(text).toContain('Runtime status not recorded');
    expect(text).not.toContain('Runtime status unavailable');
  });

  it('T3: statusFailed toggles unavailable vs not recorded on the same strip', () => {
    const utils = render(<OverviewStatusStrip env={null} statusFailed decisions={[]} routing={null} now={NOW} />);
    expect(strip().textContent).toContain('Runtime status unavailable');
    utils.rerender(<OverviewStatusStrip env={null} decisions={[]} routing={null} now={NOW} />);
    expect(strip().textContent).toContain('Runtime status not recorded');
  });

  it('T4: an observed_state is shown even when statusFailed is set', () => {
    render(<OverviewStatusStrip env={{ observed_state: 'running' }} statusFailed decisions={[]} routing={null} now={NOW} />);
    expect(strip().textContent).toContain('Runtime running');
  });
});
