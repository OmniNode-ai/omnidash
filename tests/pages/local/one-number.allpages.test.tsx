// @vitest-environment jsdom
// OMN-23330 AC1, AC2 (the operator's 2026-11-09 review: savings $21.05 on Overview but $21.19 on Usage and Delegation
// Evidence; the 2026-10-20 one-number-everywhere ruling): the three pages draw savings and tokens from one definition.
// Lakshman 2026-11-10 ("All on metering"): that definition is metering-summary.v1's all-time row, on every page, whether
// or not the local store also serves the old cost.savings-overview.v1 aggregate. Both are served here with different
// figures, so a page that reads the aggregate shows the other number.
// Failure mode F1: two pages read savings or tokens from different exposures or fields; Usage's tokens in plus out add
// up to a total other than the one Overview and Evidence show.
import { readFileSync } from 'node:fs';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const AGG = 'onex.snapshot.projection.cost.savings-overview.v1';
const METERING = 'onex.snapshot.projection.metering-summary.v1';
const DECISIONS = 'onex.snapshot.projection.delegation.decisions.v1';
/** The old aggregate, with figures that differ from metering's in every field the headlines show. */
const AGG_ROW = {
  window: 'all', captured_at: '2026-11-09T10:00:00Z', total_cost_usd: 3.1, total_baseline_cost_usd: 24.15,
  total_savings_usd: 21.05, tokens_total: 4660000, tokens_input_total: 3100000, tokens_output_total: 1560000,
  run_count: 2800, measured_run_count: 2700, estimated_run_count: 0, unknown_run_count: 100,
};
const METERING_ROW = {
  window_kind: 'all', window_start: '', as_of: '2026-11-09T10:00:00Z', baseline_model: 'claude-sonnet-5-5',
  pricing_manifest_version: '1.0.0', baseline_state: 'resolved', spend_usd: '3.20', counterfactual_usd: '24.39',
  savings_usd: '21.19', tokens_in: 3200000, tokens_out: 1490000, runs_total: 2800, runs_measured: 2713,
  runs_unknown_tokens: 87, runs_unknown_spend: 0,
};
// A store with these totals has runs: one decisions row keeps Overview out of its no-runs-yet page.
const DECISION_ROW = { correlation_id: 'c-1', created_at: '2026-11-09T09:00:00Z', model: 'qwen3.8-27b', quality_gate_passed: true };

/** Whether the local store also serves the old aggregate in the current case. */
const served = vi.hoisted(() => ({ agg: true }));

const contractTopics = (page: string) => (JSON.parse(readFileSync(`src/pages/local/${page}.contracts.yaml`, 'utf8')) as {
  components: Array<{ data_bindings?: Array<{ projection_topic: string }> }>;
}).components.flatMap(component => (component.data_bindings ?? []).map(binding => binding.projection_topic));
const TOPICS = [...new Set([...contractTopics('overview'), ...contractTopics('usage'), METERING, DECISIONS])].filter(topic => topic !== AGG);

function census() {
  return {
    rows: [
      ...TOPICS.map(topic => ({ topic, backing: 'bus', reachability: 'reachable', refusal: null })),
      served.agg
        ? { topic: AGG, backing: 'bus', reachability: 'reachable', refusal: null }
        : { topic: AGG, backing: 'not_in_local_store', reachability: 'refused', refusal: 'projection_table_missing' },
    ],
  };
}
const rowsFor = (topic: string): unknown[] => (topic === AGG ? (served.agg ? [AGG_ROW] : [])
  : topic === METERING ? [METERING_ROW] : topic === DECISIONS ? [DECISION_ROW] : []);
const result = (rows: unknown[]) => ({ rows, rowCount: rows.length, freshness: 'fresh' });

vi.mock('echarts-for-react/lib/core', () => ({ default: () => <div /> }));
vi.mock('@/theme', () => ({ useTheme: () => ({ theme: 'light', setTheme: () => {}, availableThemes: ['light', 'dark'] }) }));
vi.mock('@/data-source/data-source-override', () => ({ resolveEffectiveDataSource: () => ({ mode: 'http' }) }));
vi.mock('@/data-source', () => ({
  createSnapshotSource: () => ({
    async *readAll() { yield []; },
    readSnapshot: async (topic: string) => {
      const rows = rowsFor(topic);
      return { rows, rowCount: rows.length, dataFreshness: 'fresh', latestEventAt: null, readAt: '2026-11-09T10:05:00Z' };
    },
  }),
}));
vi.mock('@/data-source/exposure-census', () => ({ fetchExposureCensus: async () => census() }));
vi.mock('@/components/dashboard/event-dash/useEventDashData', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  const idle = () => ({ data: undefined, isLoading: false });
  return {
    ...Object.fromEntries(Object.entries(real).map(([name, value]) => [name, name.startsWith('use') ? idle : value])),
    useExposureCensus: () => ({ data: census(), isLoading: false }),
    useCostSavingsOverview: () => ({ data: served.agg ? result([AGG_ROW]) : undefined, isLoading: false }),
    useMeteringSummary: () => ({ data: result([METERING_ROW]), isLoading: false }),
  };
});

import { DelegationEvidencePage } from '@/pages/DelegationEvidencePage';
import { LocalDashboardPage } from '@/pages/LocalDashboardPage';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(Date.parse('2026-11-09T12:00:00Z'));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

type Page = 'overview' | 'usage' | 'evidence';
const PAGES: readonly Page[] = ['overview', 'usage', 'evidence'];

async function headline(page: Page): Promise<HTMLElement> {
  const { hook, searchHook } = memoryLocation({ path: page === 'evidence' ? '/delegation-evidence' : `/${page}` });
  render(
    <QueryClientProvider client={new QueryClient()}><Router hook={hook} searchHook={searchHook}>
      {page === 'evidence' ? <DelegationEvidencePage /> : <LocalDashboardPage pageName={page} />}
    </Router></QueryClientProvider>,
  );
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  const name = { overview: 'Runtime summary', usage: 'Usage summary', evidence: 'Delegation summary' }[page];
  return screen.getByRole('region', { name });
}

/** One page's headline text, unmounted before the next page renders. */
async function text(page: Page): Promise<string> {
  const content = (await headline(page)).textContent ?? '';
  cleanup();
  return content;
}

/** A Usage headline card's text, by its label. */
function card(strip: HTMLElement, label: string): string {
  return within(strip).queryByText(label, { exact: true })?.closest('article')?.textContent ?? `no card labelled ${label}`;
}

describe.each([
  { store: 'the store also serves the old aggregate', agg: true },
  { store: 'the store serves metering only', agg: false },
])('OMN-23330 AC1/AC2 when $store', ({ agg }) => {
  beforeEach(() => { served.agg = agg; });

  it('AC1: Overview, Usage and Evidence all show metering\'s $21.19 savings, never the aggregate\'s $21.05', async () => {
    for (const page of PAGES) {
      const content = await text(page);
      expect({ page, metering: content.includes('$21.19'), aggregate: content.includes('$21.05') })
        .toEqual({ page, metering: true, aggregate: false });
    }
  });

  it('AC2: Overview and Evidence show 4.69M tokens, and Usage\'s in and out (3.2M + 1.49M) add up to it', async () => {
    for (const page of ['overview', 'evidence'] as const) {
      const content = await text(page);
      expect({ page, metering: content.includes('4.69M'), aggregate: content.includes('4.66M') })
        .toEqual({ page, metering: true, aggregate: false });
    }
    const usage = await headline('usage');
    expect(card(usage, 'Tokens in')).toContain('3.2M');
    expect(card(usage, 'Tokens out')).toContain('1.49M');
    expect(usage.textContent).not.toMatch(/3\.1M|1\.56M|4\.66M/);
  });
});

describe('OMN-23330 AC1/AC2 controls', () => {
  it('positive control: the aggregate really is served with different figures, so AC1 and AC2 can fail', () => {
    served.agg = true;
    expect(rowsFor(AGG)).toEqual([expect.objectContaining({ total_savings_usd: 21.05, tokens_total: 4660000 })]);
    expect(census().rows.find(row => row.topic === AGG)?.reachability).toBe('reachable');
    expect(3200000 + 1490000).toBe(4690000);
  });

  it('no local page contract binds the old aggregate any more', () => {
    for (const page of ['overview', 'runs', 'workflow', 'usage', 'credentials', 'api-keys', 'status', 'pricing']) {
      let topics: string[] = [];
      try { topics = contractTopics(page); } catch { continue; }
      expect({ page, aggregate: topics.includes(AGG) }).toEqual({ page, aggregate: false });
    }
    expect(contractTopics('overview')).toContain(METERING);
  });
});
