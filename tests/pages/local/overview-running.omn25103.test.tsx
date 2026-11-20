// @vitest-environment jsdom
// OMN-25103 AC2/AC3 on the Overview page: the Running figure is the number of rows floor-integration-rows.v1 serves
// marked running, never a list or count of its own; a failed, empty or not-served read shows Not measured with the
// reason, never 0. Served rows with none running are a measured 0.
import { readFileSync } from 'node:fs';
import { act, cleanup, render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const RUNNING_TOPIC = 'onex.snapshot.projection.floor-integration-rows.v1';

type Contracts = {
  components: Array<{
    component_id: string;
    component_kind: string;
    data_bindings?: Array<{ projection_topic: string }>;
  }>;
};
const CONTRACTS = JSON.parse(readFileSync('src/pages/local/overview.contracts.yaml', 'utf8')) as Contracts;
const TOPICS = CONTRACTS.components.flatMap(component => (component.data_bindings ?? []).map(binding => binding.projection_topic));

const served = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], fails: false, isServed: true }));

vi.mock('echarts-for-react/lib/core', () => ({ default: () => <div /> }));
vi.mock('@/theme', () => ({ useTheme: () => ({ theme: 'light', setTheme: () => {}, availableThemes: ['light', 'dark'] }) }));
vi.mock('@/data-source', () => ({
  createSnapshotSource: () => ({
    async *readAll() { yield []; },
    readSnapshot: async (topic: string) => {
      if (topic === 'onex.snapshot.projection.floor-integration-rows.v1') {
        if (served.fails) throw new Error('floor-integration-rows read refused: 503');
        return { rows: served.rows, rowCount: served.rows.length, dataFreshness: 'fresh', latestEventAt: null, readAt: '2026-11-20T02:00:00Z' };
      }
      return { rows: [], rowCount: 0, dataFreshness: 'fresh', latestEventAt: null, readAt: '2026-11-20T02:00:00Z' };
    },
  }),
}));
vi.mock('@/data-source/data-source-override', () => ({ resolveEffectiveDataSource: () => ({ mode: 'http' }) }));
vi.mock('@/data-source/exposure-census', () => ({
  fetchExposureCensus: async () => ({
    rows: [...new Set(TOPICS)]
      .filter(topic => served.isServed || topic !== 'onex.snapshot.projection.floor-integration-rows.v1')
      .map(topic => ({ topic, reachability: 'reachable' })),
  }),
}));

import { LocalDashboardPage } from '@/pages/LocalDashboardPage';

const passRow = (key: string, state: unknown) => ({
  key,
  repository: 'OmniNode-ai/omnimarket',
  number: 1,
  title: 't',
  merged_at: '2026-11-20T01:00:00Z',
  state,
  as_of: '2026-11-20T01:30:00Z',
  projected_at: '2026-11-20T01:31:00Z',
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(Date.parse('2026-11-20T02:05:00Z'));
  served.rows = [];
  served.fails = false;
  served.isServed = true;
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
  return document.querySelector('[data-component="overview-running"]') as HTMLElement | null;
}

describe('running_figure_from_served_projection', () => {
  it('the Overview contract binds a Running card to floor-integration-rows.v1', () => {
    const running = CONTRACTS.components.find(component => component.component_id === 'overview-running');
    expect(running).toBeDefined();
    expect(running?.component_kind).toBe('metric_card');
    expect(running?.data_bindings?.[0]?.projection_topic).toBe(RUNNING_TOPIC);
  });

  // Two different counts from rows that are not all running, so neither a fixed figure nor the row count passes both.
  it.each([
    [['running', 'running', 'integrated', 'running'], '3'],
    [['integrated', 'running'], '1'],
    // States other than running and integrated, so only an exact 'running' match gives 2.
    [['queued', 'running', 'failed', 'settled', 'running'], '2'],
  ])('the Running figure is the number of served rows marked running (%j)', async (states, figure) => {
    served.rows = states.map((state, index) => passRow(`k${index}`, state));
    const card = await renderOverview();
    expect(card).not.toBeNull();
    expect(within(card!).getByText(figure)).toBeInTheDocument();
    expect(within(card!).queryByText('Not measured')).toBeNull();
  });

  it('served rows with none running are a measured 0', async () => {
    served.rows = [passRow('k1', 'integrated'), passRow('k2', 'settled')];
    const card = await renderOverview();
    expect(card).not.toBeNull();
    expect(within(card!).getByText('0')).toBeInTheDocument();
    expect(within(card!).queryByText('Not measured')).toBeNull();
  });
});

describe('running_figure_unavailable', () => {
  it('a failed read shows Not measured with the read\'s reason, never 0', async () => {
    served.fails = true;
    const card = await renderOverview();
    expect(card).not.toBeNull();
    expect(within(card!).getByText('Not measured')).toBeInTheDocument();
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

  it('a served row without its state shows Not measured with the reason, not a partial count', async () => {
    served.rows = [passRow('k1', 'running'), passRow('k2', '')];
    const card = await renderOverview();
    expect(card).not.toBeNull();
    expect(within(card!).getByText('Not measured')).toBeInTheDocument();
    expect(within(card!).getByText('A served row is missing the field the count needs.')).toBeInTheDocument();
    expect(within(card!).queryByText(/^\s*[01]\b/)).toBeNull();
  });

  it('an exposure not served yet says so once, beside one Not measured, never 0', async () => {
    served.isServed = false;
    const card = await renderOverview();
    expect(card).not.toBeNull();
    expect(within(card!).getAllByText(/Not measured/)).toHaveLength(1);
    expect(within(card!).getByText('Running changes are not served yet.')).toBeInTheDocument();
    expect(within(card!).queryByText(/^\s*0\b/)).toBeNull();
  });
});
