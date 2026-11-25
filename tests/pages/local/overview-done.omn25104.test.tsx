// @vitest-environment jsdom
// OMN-25104 AC3: the Overview Done figure is the count of rows served by done-items.v1, never a list or count of its
// own; a failed or empty read shows Not measured with the reason, never 0.
import { readFileSync } from 'node:fs';
import { act, cleanup, render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const DONE_TOPIC = 'onex.snapshot.projection.done-items.v1';

type Contracts = {
  components: Array<{
    component_id: string;
    component_kind: string;
    data_bindings?: Array<{ projection_topic: string }>;
  }>;
};
const CONTRACTS = JSON.parse(readFileSync('src/pages/local/overview.contracts.yaml', 'utf8')) as Contracts;
const TOPICS = CONTRACTS.components.flatMap(component => (component.data_bindings ?? []).map(binding => binding.projection_topic));

const served = vi.hoisted(() => ({ doneRows: [] as Record<string, unknown>[], doneFails: false, doneServed: true, doneTruncated: false }));

vi.mock('echarts-for-react/lib/core', () => ({ default: () => <div /> }));
vi.mock('@/theme', () => ({ useTheme: () => ({ theme: 'light', setTheme: () => {}, availableThemes: ['light', 'dark'] }) }));
vi.mock('@/data-source', () => ({
  createSnapshotSource: () => ({
    async *readAll() { yield []; },
    readSnapshot: async (topic: string) => {
      if (topic === 'onex.snapshot.projection.done-items.v1') {
        if (served.doneFails) throw new Error('done-items read refused: 503');
        return {
          rows: served.doneRows, rowCount: served.doneRows.length, dataFreshness: 'fresh', latestEventAt: null, readAt: '2026-11-19T17:00:00Z',
          ...(served.doneTruncated ? { truncated: true } : {}),
        };
      }
      return { rows: [], rowCount: 0, dataFreshness: 'fresh', latestEventAt: null, readAt: '2026-11-19T17:00:00Z' };
    },
  }),
}));
vi.mock('@/data-source/data-source-override', () => ({ resolveEffectiveDataSource: () => ({ mode: 'http' }) }));
vi.mock('@/data-source/exposure-census', () => ({
  fetchExposureCensus: async () => ({
    rows: [...new Set(TOPICS)]
      .filter(topic => served.doneServed || topic !== 'onex.snapshot.projection.done-items.v1')
      .map(topic => ({ topic, reachability: 'reachable' })),
  }),
}));

import { LocalDashboardPage } from '@/pages/LocalDashboardPage';

const doneRow = (ticket: string) => ({
  ticket,
  done_at: '2026-11-19T16:00:00Z',
  done_row_id: 'a',
  lane: 'l',
  pr: 1,
  closes: ticket,
  projected_at: '2026-11-19T16:59:00Z',
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(Date.parse('2026-11-19T17:05:00Z'));
  served.doneRows = [];
  served.doneFails = false;
  served.doneServed = true;
  served.doneTruncated = false;
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

async function renderOverview(): Promise<HTMLElement | null> {
  const { hook, searchHook } = memoryLocation({ path: '/overview' });
  render(
    <QueryClientProvider client={new QueryClient()}><Router hook={hook} searchHook={searchHook}>
      <LocalDashboardPage pageName="overview" />
    </Router></QueryClientProvider>,
  );
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  return document.querySelector('[data-component="overview-done"]') as HTMLElement | null;
}

describe('done_figure_from_served_projection', () => {
  it('the Overview contract binds a Done card to done-items.v1', () => {
    const done = CONTRACTS.components.find(component => component.component_id === 'overview-done');
    expect(done).toBeDefined();
    expect(done?.component_kind).toBe('metric_card');
    expect(done?.data_bindings?.[0]?.projection_topic).toBe(DONE_TOPIC);
  });

  // Two different counts, so a figure fixed in code cannot pass both.
  it.each([
    [['OMN-1', 'OMN-2', 'OMN-3'], '3'],
    [['OMN-7'], '1'],
  ])('the Done figure is the number of served rows (%j)', async (tickets, figure) => {
    served.doneRows = tickets.map(doneRow);
    const card = await renderOverview();
    expect(card).not.toBeNull();
    expect(within(card!).getByText(figure)).toBeInTheDocument();
    expect(within(card!).queryByText('Not measured')).toBeNull();
  });

  it('a failed read shows Not measured with the read\'s reason, never 0', async () => {
    served.doneFails = true;
    const card = await renderOverview();
    expect(card).not.toBeNull();
    expect(within(card!).getByText('Not measured')).toBeInTheDocument();
    // The reason the read gave, not only that it failed.
    expect(within(card!).getByText(/The read failed: .*503/)).toBeInTheDocument();
    expect(within(card!).queryByText(/^\s*0\b/)).toBeNull();
  });

  it('an empty read shows Not measured with its reason, never 0', async () => {
    const card = await renderOverview();
    expect(card).not.toBeNull();
    expect(within(card!).getByText('Not measured')).toBeInTheDocument();
    expect(within(card!).getByText('The read returned no rows.')).toBeInTheDocument();
    expect(within(card!).queryByText(/^\s*0\b/)).toBeNull();
  });

  // A row without its ticket is not a done item the figure can count, so the card says why instead of counting it.
  it('a served row missing its ticket shows Not measured with the reason, not a count', async () => {
    const unkeyed: Record<string, unknown> = { ...doneRow('OMN-2') };
    delete unkeyed.ticket;
    served.doneRows = [doneRow('OMN-1'), unkeyed];
    const card = await renderOverview();
    expect(card).not.toBeNull();
    expect(within(card!).getByText('Not measured')).toBeInTheDocument();
    expect(within(card!).getByText('A served row is missing the field the count needs.')).toBeInTheDocument();
    expect(within(card!).queryByText(/^\s*[12]\b/)).toBeNull();
  });

  // A truncated read is one page of a longer list: counting its rows would show a short figure as if it were measured.
  it('a truncated read shows Not measured with the reason, not the page\'s row count', async () => {
    served.doneRows = ['OMN-1', 'OMN-2', 'OMN-3'].map(doneRow);
    served.doneTruncated = true;
    const card = await renderOverview();
    expect(card).not.toBeNull();
    expect(within(card!).getByText('Not measured')).toBeInTheDocument();
    expect(within(card!).getByText('The read returned one page of a longer list, so a count of it would be short.')).toBeInTheDocument();
    expect(within(card!).queryByText('3')).toBeNull();
  });

  it('an exposure not served yet says so once, beside one Not measured, never 0', async () => {
    served.doneServed = false;
    const card = await renderOverview();
    expect(card).not.toBeNull();
    expect(within(card!).getAllByText(/Not measured/)).toHaveLength(1);
    expect(within(card!).getByText('Done items are not served yet.')).toBeInTheDocument();
    expect(within(card!).queryByText(/^\s*0\b/)).toBeNull();
  });
});
