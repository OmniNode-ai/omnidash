// @vitest-environment jsdom
// OMN-20009: the Overview's Run locally share and Avg saving / call, each from a served field, never 0 when unmeasured.
//
// Failure modes, each with a test below:
//   H1  the share card shows the served local_call_share unchanged, never a ratio the browser computed from counts;
//   H2  the share card names the served counts, the not-tier-routed count included, so the gap stays visible;
//   H3  no model-routing row (no runs) is the typed no-runs state, never 0%;
//   H4  a served row without local_call_share (a backend before the view change) is a typed not-served state;
//   H5  a null share is Not measured, never 0%;
//   H6  a measured zero share (runs, none local) is a real 0.0%, not an empty state;
//   S1  the per-run saving card shows the served decimal text unchanged, never savings over runs from the browser;
//   S2  a null per-run saving says why: no measured run, or an unresolved baseline; never $0;
//   S3  a row without the field is a typed not-served state;
//   S4  only the all-time row is read; no all-time row, or one per baseline model, is a typed state, not a guess;
//   S5  a negative saving keeps its sign;
//   P1  on the page, the Run locally card reads delegation.model-routing.v1 and shows its served share;
//   P2  on the page, the per-run saving card waits on metering-summary.v1 while the lab does not serve it.
import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ROUTING = 'onex.snapshot.projection.delegation.model-routing.v1';
const OVERVIEW = 'onex.snapshot.projection.cost.savings-overview.v1';

const harness = vi.hoisted(() => ({
  reachable: new Set<string>(),
  answer: (_topic: string): Promise<unknown[]> => Promise.resolve([]),
}));

vi.mock('@/data-source', () => ({
  createSnapshotSource: () => ({
    async *readAll() { yield []; },
    readSnapshot: async (topic: string) => {
      const rows = await harness.answer(topic);
      return { rows, rowCount: rows.length, dataFreshness: 'fresh', latestEventAt: null, readAt: new Date().toISOString() };
    },
  }),
}));
vi.mock('@/data-source/data-source-override', () => ({ resolveEffectiveDataSource: () => ({ mode: 'http' }) }));
vi.mock('@/data-source/exposure-census', () => ({
  fetchExposureCensus: async () => ({
    rows: [...harness.reachable].map((topic) => ({ topic, reachability: 'reachable' })),
  }),
}));

import { LocalDashboardPage, RunLocallyCard, SavingsPerRunCard } from './LocalDashboardPage';

/** The lab's model-routing by_tier on 2026-10-04 14:26Z, with the keys the OMN-20009 view adds. */
const labByTier = {
  tiers: [
    { count: 104, tier_routed: true, cost_tier_name: 'local', pct_of_tier_routed: 1 },
    { count: 20, tier_routed: false, cost_tier_name: 'not_tier_routed', pct_of_tier_routed: 0 },
  ],
  total_tasks: 124,
  tier_routed_total: 104,
  not_tier_routed_count: 20,
  local_call_count: 104,
  total_call_count: 124,
  local_call_share: 104 / 124,
};

const allRow = (fields: Record<string, unknown> = {}) => ({
  window_kind: 'all', window_start: '', baseline_model: 'claude-opus-4-6', baseline_state: 'resolved',
  runs_total: 4, runs_measured: 3, savings_usd: '2.9', savings_per_measured_run_usd: '0.966667', ...fields,
});

describe('RunLocallyCard (OMN-20009 AC1, AC2, AC4)', () => {
  it('H1: shows the served share, not the tier-routed share and not a ratio of the counts', () => {
    // Served deliberately unlike 104/124 (0.8387): a browser that divides the counts would show 83.9%.
    render(<RunLocallyCard row={{ by_tier: { ...labByTier, local_call_share: 0.5 } }} />);
    expect(screen.getByText('50.0%')).toBeInTheDocument();
    expect(screen.queryByText('83.9%')).toBeNull();
    expect(screen.queryByText('100.0%')).toBeNull();
  });

  it('H1, H2: renders the lab row as 83.9% with its served counts and the not-tier-routed gap', () => {
    render(<RunLocallyCard row={{ by_tier: labByTier }} />);
    expect(screen.getByText('83.9%')).toBeInTheDocument();
    expect(screen.getByText('104 of 124 runs local · 20 not tier-routed')).toBeInTheDocument();
  });

  it('H3: no served row is the typed no-runs state, never 0%', () => {
    render(<RunLocallyCard row={null} />);
    expect(screen.getByText('No runs yet')).toBeInTheDocument();
    expect(screen.queryByText(/0(\.0)?%/)).toBeNull();
  });

  it('H4: a row without local_call_share says what it waits on', () => {
    const { local_call_share: _drop, ...older } = labByTier;
    render(<RunLocallyCard row={{ by_tier: older }} />);
    expect(screen.getByText('Not served yet: waits on local_call_share in delegation.model-routing.v1')).toBeInTheDocument();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it('H4: a row without by_tier says what it waits on', () => {
    render(<RunLocallyCard row={{ total_delegations: 3 }} />);
    expect(screen.getByText('Not served yet: waits on local_call_share in delegation.model-routing.v1')).toBeInTheDocument();
  });

  it('H5: a null share is Not measured, never 0%', () => {
    render(<RunLocallyCard row={{ by_tier: { ...labByTier, local_call_share: null } }} />);
    expect(screen.getByText('Not measured')).toBeInTheDocument();
    expect(screen.queryByText(/0(\.0)?%/)).toBeNull();
  });

  it('H6: a measured zero share is 0.0%', () => {
    render(<RunLocallyCard row={{ by_tier: { ...labByTier, local_call_count: 0, local_call_share: 0 } }} />);
    expect(screen.getByText('0.0%')).toBeInTheDocument();
  });
});

describe('SavingsPerRunCard (OMN-20009 AC1, AC2, AC3)', () => {
  it('S1: shows the served decimal text unchanged, not savings over runs', () => {
    // 2.9 / 3 = 0.966667 and 2.9 / 4 = 0.725; the served value is deliberately neither.
    render(<SavingsPerRunCard rows={[allRow({ savings_per_measured_run_usd: '0.500000' })]} />);
    expect(screen.getByText('$0.500000')).toBeInTheDocument();
    expect(screen.queryByText(/0\.9666|0\.725/)).toBeNull();
    expect(screen.getByText('Over 3 measured runs · baseline claude-opus-4-6')).toBeInTheDocument();
  });

  it('S2: no measured run is Not measured with its reason, never $0', () => {
    render(<SavingsPerRunCard rows={[allRow({ runs_measured: 0, savings_usd: null, savings_per_measured_run_usd: null })]} />);
    expect(screen.getByText('Not measured: no measured runs')).toBeInTheDocument();
    expect(screen.queryByText(/\$0/)).toBeNull();
  });

  it('S2: an unresolved baseline is Baseline unresolved, never $0', () => {
    render(<SavingsPerRunCard rows={[allRow({ baseline_state: 'unresolved', savings_usd: null, savings_per_measured_run_usd: null })]} />);
    expect(screen.getByText('Baseline unresolved')).toBeInTheDocument();
    expect(screen.queryByText(/\$0/)).toBeNull();
  });

  it('S3: a row without the field says what it waits on', () => {
    const { savings_per_measured_run_usd: _drop, ...older } = allRow();
    render(<SavingsPerRunCard rows={[older]} />);
    expect(screen.getByText('Not served yet: waits on savings_per_measured_run_usd in metering-summary.v1')).toBeInTheDocument();
  });

  it('S4: reads only the all-time row', () => {
    render(<SavingsPerRunCard rows={[
      { ...allRow({ savings_per_measured_run_usd: '9.000000' }), window_kind: 'day', window_start: '2026-10-04' },
      allRow(),
    ]} />);
    expect(screen.getByText('$0.966667')).toBeInTheDocument();
    expect(screen.queryByText('$9.000000')).toBeNull();
  });

  it('S4: no all-time row is a typed state', () => {
    render(<SavingsPerRunCard rows={[{ ...allRow(), window_kind: 'day', window_start: '2026-10-04' }]} />);
    expect(screen.getByText('Not measured: no all-time row')).toBeInTheDocument();
  });

  it('S4: two all-time rows refreshed at the same moment are not guessed between', () => {
    render(<SavingsPerRunCard rows={[
      allRow({ as_of: '2026-10-04T14:00:00Z' }),
      allRow({ as_of: '2026-10-04T14:00:00Z', baseline_model: 'gpt-5', savings_per_measured_run_usd: '0.1' }),
    ]} />);
    expect(screen.getByText('Not measured: 2 baseline models')).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).toBeNull();
  });

  it('S4b: after a baseline change the newest as_of all-time row is shown with its baseline', () => {
    render(<SavingsPerRunCard rows={[
      allRow({ as_of: '2026-10-04T14:00:00Z', baseline_model: 'claude-opus-4-6', savings_per_measured_run_usd: '0.1' }),
      allRow({ as_of: '2026-10-05T09:30:00Z', baseline_model: 'gpt-5', savings_per_measured_run_usd: '0.250000' }),
    ]} />);
    expect(screen.getByText('$0.250000')).toBeInTheDocument();
    expect(screen.getByText('Over 3 measured runs · baseline gpt-5')).toBeInTheDocument();
    expect(screen.queryByText(/baseline models/)).toBeNull();
    expect(screen.queryByText('$0.1')).toBeNull();
  });

  it('S4b: the newest row wins whichever order the rows are served in', () => {
    render(<SavingsPerRunCard rows={[
      allRow({ as_of: '2026-10-05T09:30:00Z', baseline_model: 'gpt-5', savings_per_measured_run_usd: '0.250000' }),
      allRow({ as_of: '2026-10-04T14:00:00Z', savings_per_measured_run_usd: '0.1' }),
    ]} />);
    expect(screen.getByText('$0.250000')).toBeInTheDocument();
  });

  it('S4c: a day row newer than the all-time row is ignored', () => {
    render(<SavingsPerRunCard rows={[
      allRow({ as_of: '2026-10-04T14:00:00Z', savings_per_measured_run_usd: '0.500000' }),
      { ...allRow({ as_of: '2026-10-06T01:00:00Z', savings_per_measured_run_usd: '9.000000' }), window_kind: 'day', window_start: '2026-10-06' },
    ]} />);
    expect(screen.getByText('$0.500000')).toBeInTheDocument();
    expect(screen.queryByText('$9.000000')).toBeNull();
  });

  it('S5: a negative saving keeps its sign', () => {
    render(<SavingsPerRunCard rows={[allRow({ savings_per_measured_run_usd: '-0.500000' })]} />);
    expect(screen.getByText('-$0.500000')).toBeInTheDocument();
  });
});

describe('Overview page (OMN-20009 P1, P2)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-10-04T14:30:00Z'));
    harness.reachable = new Set([ROUTING, OVERVIEW]);
    harness.answer = (topic) => Promise.resolve(topic === ROUTING
      ? [{ tenant_id: 'tenant-a', total_delegations: 124, captured_at: '2026-10-04T14:26:13Z', by_tier: labByTier }]
      : [{ total_cost_usd: 0.01, total_savings_usd: 1.29, total_baseline_cost_usd: 1.3, measured_run_count: 124, zero_token_run_count: 0 }]);
  });
  afterEach(() => { vi.useRealTimers(); });

  async function panel(title: string) {
    render(<LocalDashboardPage pageName="overview" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    return screen.getByRole('heading', { name: title }).closest('article') as HTMLElement;
  }

  it('P1: the Run locally panel shows the served share from delegation.model-routing.v1', async () => {
    const card = await panel('Run locally');
    expect(within(card).getByText('83.9%')).toBeInTheDocument();
    expect(within(card).getByText('104 of 124 runs local · 20 not tier-routed')).toBeInTheDocument();
  });

  it('P1: the Run locally panel says the exposure is not served when the census does not serve it', async () => {
    harness.reachable = new Set([OVERVIEW]);
    const card = await panel('Run locally');
    expect(within(card).getByText(`Not served: ${ROUTING}`)).toBeInTheDocument();
    expect(within(card).queryByText(/%/)).toBeNull();
  });

  it('P2: the Avg saving / call panel waits on metering-summary.v1, never $0', async () => {
    const card = await panel('Avg saving / call');
    expect(within(card).getByText('Not served yet: waits on metering-summary.v1')).toBeInTheDocument();
    expect(within(card).queryByText(/\$0/)).toBeNull();
  });
});
