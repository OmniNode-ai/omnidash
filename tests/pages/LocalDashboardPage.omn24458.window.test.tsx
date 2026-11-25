// @vitest-environment jsdom
// OMN-24458: the Overview on a rolling window names that window on its decisions read (`window=7d`, the projection
// route's own form), on the mount, on every timer poll, and again when the viewer picks another window. The dev access
// log of the 7-day Overview showed `decisions?limit=100` and nothing else, so the route's windowed read (and its page
// cache keyed by window) was never used. Failure modes, each with a test below:
//   W1  a 7-day Overview that reads decisions with no window, on the mount or on a timer poll
//   W2  the window leaking onto the all-time Overview, a picked day, the Runs page, or another exposure
//   W3  a window picked in the menu not reaching the next read, so a 30-day view shows the 7-day rows
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DECISIONS = 'onex.snapshot.projection.delegation.decisions.v1';

const harness = vi.hoisted(() => ({
  calls: [] as Array<{ topic: string; params: Record<string, string> | undefined }>,
  reachable: new Set<string>(),
}));

vi.mock('@/data-source', () => ({
  createSnapshotSource: () => ({
    async *readAll() { yield []; },
    readSnapshot: async (topic: string, params?: Record<string, string>) => {
      harness.calls.push({ topic, params: params === undefined ? undefined : { ...params } });
      return { rows: [], rowCount: 0, dataFreshness: 'fresh' as const, latestEventAt: null, readAt: new Date().toISOString() };
    },
  }),
}));
vi.mock('@/data-source/data-source-override', () => ({ resolveEffectiveDataSource: () => ({ mode: 'http' }) }));
vi.mock('@/data-source/projection-tenant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data-source/projection-tenant')>()),
  resolveConfiguredTenant: () => 'tenant-a',
}));
vi.mock('@/data-source/exposure-census', () => ({
  fetchExposureCensus: async () => ({
    rows: [...harness.reachable].map((topic) => ({ topic, reachability: 'reachable' })),
  }),
}));

import { LocalDashboardPage } from '@/pages/LocalDashboardPage';

async function settle() {
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

const decisionsCalls = () => harness.calls.filter(call => call.topic === DECISIONS);
const windows = () => decisionsCalls().map(call => call.params?.window);

describe('OMN-24458: the Overview decisions read carries its window', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-11-24T02:00:00Z'));
    window.history.replaceState(null, '', '/');
    harness.calls = [];
    harness.reachable = new Set([DECISIONS, 'onex.snapshot.projection.delegation.daily.v1']);
  });
  afterEach(() => { vi.useRealTimers(); });

  it('W1: a 7-day Overview sends window=7d on the mount and on its next timer poll', async () => {
    window.history.replaceState(null, '', '/overview?window=7d');
    render(<LocalDashboardPage pageName="overview" />);
    await settle();
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(windows()).toEqual(['7d', '7d']);
    expect(decisionsCalls().every(call => call.params?.since === undefined)).toBe(true);
  });

  it('W2: the all-time Overview sends no window', async () => {
    window.history.replaceState(null, '', '/overview');
    render(<LocalDashboardPage pageName="overview" />);
    await settle();
    expect(decisionsCalls()).toHaveLength(1);
    expect(windows()).toEqual([undefined]);
  });

  it('W2: a picked day sends no window', async () => {
    window.history.replaceState(null, '', '/overview?day=2026-11-10');
    render(<LocalDashboardPage pageName="overview" />);
    await settle();
    expect(windows()).toEqual([undefined]);
  });

  it('W2: the Runs page sends no window and no other exposure carries one', async () => {
    window.history.replaceState(null, '', '/runs?window=7d');
    render(<LocalDashboardPage pageName="runs" />);
    await settle();
    expect(windows()).toEqual([undefined]);
    expect(harness.calls.every(call => call.params?.window === undefined)).toBe(true);
  });

  it('W2: on the 7-day Overview only the decisions read carries a window', async () => {
    window.history.replaceState(null, '', '/overview?window=7d');
    render(<LocalDashboardPage pageName="overview" />);
    await settle();
    const windowed = harness.calls.filter(call => call.params?.window !== undefined);
    expect(windowed.map(call => call.topic)).toEqual([DECISIONS]);
  });

  it('W3: picking Last 30 days reads decisions again with window=30d', async () => {
    window.history.replaceState(null, '', '/overview?window=7d');
    render(<LocalDashboardPage pageName="overview" />);
    await settle();
    expect(windows()).toEqual(['7d']);
    await act(async () => { fireEvent.click(document.querySelector('.local-window-trigger')!); });
    await act(async () => { fireEvent.click(screen.getByRole('radio', { name: 'Last 30 days (UTC)' })); });
    await settle();
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(windows()).toEqual(['7d', '30d']);
  });
});
