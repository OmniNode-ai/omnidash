// @vitest-environment jsdom
// OMN-21166 part 14, AC77 end to end in the browser tree: the Overview page publishes the read time its served rows carry
// and the top bar shows it; leaving the page takes it away. Failure modes: U1 (clock instead of read time) and U2
// (the line outlives its page), as in header-updated.omn21166.test.tsx.
import { readFileSync } from 'node:fs';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const TOPICS = (JSON.parse(readFileSync('src/pages/local/overview.contracts.yaml', 'utf8')) as { components: Array<{ data_bindings?: Array<{ projection_topic: string }> }> })
  .components.flatMap(component => (component.data_bindings ?? []).map(binding => binding.projection_topic));

vi.mock('echarts-for-react/lib/core', () => ({ default: () => <div /> }));
vi.mock('@/theme', () => ({ useTheme: () => ({ theme: 'light', setTheme: () => {}, availableThemes: ['light', 'dark'] }) }));
vi.mock('@/data-source', () => ({
  createSnapshotSource: () => ({
    async *readAll() { yield []; },
    readSnapshot: async () => ({ rows: [], rowCount: 0, dataFreshness: 'fresh', latestEventAt: null, readAt: '2026-10-25T10:04:00Z' }),
  }),
}));
vi.mock('@/data-source/data-source-override', () => ({ resolveEffectiveDataSource: () => ({ mode: 'http' }) }));
vi.mock('@/data-source/exposure-census', () => ({
  fetchExposureCensus: async () => ({ rows: [...new Set(TOPICS)].map(topic => ({ topic, reachability: 'reachable' })) }),
}));

import { Header } from '@/components/frame/Header';
import { LocalDashboardPage } from '@/pages/LocalDashboardPage';

beforeEach(() => { vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] }); vi.setSystemTime(Date.parse('2026-10-25T12:00:00Z')); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('Overview tells the top bar when its rows were read', () => {
  it('U1, U2: shows the served read time, and it goes with the page', async () => {
    const { hook, searchHook } = memoryLocation({ path: '/overview' });
    const tree = (withPage: boolean) => (
      <QueryClientProvider client={new QueryClient()}><Router hook={hook} searchHook={searchHook}>
        <Header />{withPage && <LocalDashboardPage pageName="overview" />}
      </Router></QueryClientProvider>
    );
    const view = render(tree(true));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText('Updated 10:04 UTC')).toBeInTheDocument();
    view.rerender(tree(false));
    expect(screen.queryByText(/^Updated/)).toBeNull();
  });
});
