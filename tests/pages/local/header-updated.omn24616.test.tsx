// @vitest-environment jsdom
// OMN-24616 AC6: every page header shows its Updated time, from when that page's rows were last read.
// The audit found the Updated time on two of the six pages (Overview and Usage only).
// Failure modes:
//   H1  a page other than Overview or Usage shows no Updated time even with a read published for it
//   H2  a read published for one page shows on another
//   H3  Runs never publishes its read, so its header stays empty
//   H4  Delegation Evidence never publishes its read
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Header } from '@/components/frame/Header';
import { currentLocalPageRead, publishLocalPageRead } from '@/services/local-page-refresh';
import type { AppPage } from '@/store/types';

vi.mock('@/theme', () => ({ useTheme: () => ({ theme: 'light', setTheme: () => {}, availableThemes: ['light', 'dark'] }) }));
vi.mock('echarts-for-react/lib/core', () => ({ default: () => <div /> }));
vi.mock('@/data-source/data-source-override', () => ({ resolveEffectiveDataSource: () => ({ mode: 'http' }) }));
vi.mock('@/data-source', () => ({
  createSnapshotSource: () => ({
    async *readAll() { yield []; },
    readSnapshot: async () => ({ rows: [], rowCount: 0, dataFreshness: 'fresh', latestEventAt: null, readAt: '2026-10-25T10:04:00Z' }),
  }),
}));
vi.mock('@/data-source/exposure-census', () => ({
  fetchExposureCensus: async () => ({
    rows: [{ topic: 'onex.snapshot.projection.delegation.decisions.v1', backing: 'bus', reachability: 'reachable', refusal: null }],
  }),
}));
vi.mock('@/components/dashboard/event-dash/useEventDashData', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  const read = () => ({ data: undefined, isLoading: false, dataUpdatedAt: Date.parse('2026-10-25T10:07:00Z') });
  return Object.fromEntries(Object.entries(real).map(([name, value]) => [name, name.startsWith('use') ? read : value]));
});

import { DelegationEvidencePage } from '@/pages/DelegationEvidencePage';
import { LocalDashboardPage } from '@/pages/LocalDashboardPage';

const NOW = Date.parse('2026-10-25T12:00:00Z');
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); });
afterEach(() => { cleanup(); act(() => publishLocalPageRead(null, null)); vi.useRealTimers(); });

function at(path: string, children: React.ReactNode) {
  const { hook, searchHook } = memoryLocation({ path });
  return render(<QueryClientProvider client={new QueryClient()}><Router hook={hook} searchHook={searchHook}>{children}</Router></QueryClientProvider>);
}

const PAGES: ReadonlyArray<[AppPage, string]> = [
  ['local-overview', '/overview'], ['local-runs', '/runs'], ['local-workflow', '/workflow'],
  ['local-usage', '/usage'], ['local-settings', '/settings'], ['delegation-evidence', '/delegation-evidence'],
];

describe('OMN-24616 AC6: the Updated time on every page header', () => {
  it.each(PAGES)('H1: %s shows the read published for it', (page, path) => {
    act(() => publishLocalPageRead(page, '2026-10-25T10:04:00Z'));
    at(path, <Header />);
    expect(screen.getByText('Updated 10:04 UTC')).toBeInTheDocument();
  });

  it('H2: a read published for Runs is not shown on Usage', () => {
    act(() => publishLocalPageRead('local-runs', '2026-10-25T10:04:00Z'));
    at('/usage', <Header />);
    expect(screen.queryByText(/^Updated/)).toBeNull();
  });

  it('H3: Runs publishes when its rows were read', async () => {
    at('/runs', <LocalDashboardPage pageName="runs" />);
    await vi.waitFor(() => {
      expect(currentLocalPageRead().page).toBe('local-runs');
      expect(currentLocalPageRead().readAt).toEqual(expect.any(String));
    });
  });

  it('H4: Delegation Evidence publishes when its rows were read', async () => {
    at('/delegation-evidence', <DelegationEvidencePage />);
    await vi.waitFor(() => expect(currentLocalPageRead()).toEqual({ page: 'delegation-evidence', readAt: '2026-10-25T10:07:00.000Z' }));
  });
});
