// @vitest-environment jsdom
// OMN-21015 stage 5, U1: the six local pages are built from one set of parts. A page is a header row and a grid of
// panels; a panel is a heading with an icon and, under it, only the shared parts (a headline figure, a caption, a
// field list, a table, a chart, a bar of shares, a meter, a typed state, a filter row, a pager, the run parts).
// Nothing a reader can read sits outside them.
//
// Failure modes, each with a test below:
//   K1  a page draws text outside its header and its panels (a bare figure on the page);
//   K2  a panel draws text outside the shared parts (a bare figure in a panel);
//   K3  a panel has no heading, or its heading has no icon;
//   K4  a page's header has no icon, or is missing;
//   K5  the guard is vacuous: the page it looked at drew no panel, or a served page drew no figure at all.
// Each page is read twice: with every exposure it binds served (constructed rows), and with nothing served, because
// the typed empty states are parts too.
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const P = 'onex.snapshot.projection.';
const harness = vi.hoisted(() => ({ served: new Map<string, unknown[]>() }));

vi.mock('echarts-for-react/lib/core', () => ({ default: () => <div data-testid="served-chart" /> }));
vi.mock('@/data-source', () => ({
  createSnapshotSource: () => ({
    async *readAll() { yield []; },
    readSnapshot: async (topic: string) => {
      const rows = harness.served.get(topic) ?? [];
      return { rows, rowCount: rows.length, dataFreshness: 'fresh', latestEventAt: null, readAt: new Date().toISOString() };
    },
  }),
}));
vi.mock('@/data-source/data-source-override', () => ({ resolveEffectiveDataSource: () => ({ mode: 'http' }) }));
vi.mock('@/data-source/exposure-census', () => ({
  fetchExposureCensus: async () => ({ rows: [...harness.served.keys()].map((topic) => ({ topic, reachability: 'reachable' })) }),
}));

import { LocalDashboardPage } from './LocalDashboardPage';

type PageName = 'overview' | 'runs' | 'workflow' | 'usage' | 'credentials' | 'api-keys';
const PAGES: PageName[] = ['overview', 'runs', 'workflow', 'usage', 'credentials', 'api-keys'];
const RUN = '11111111-1111-4111-8111-111111111111';
const TENANT = '22222222-2222-4222-8222-222222222222';

// Constructed rows in the shape each exposure serves (column names read from the runtime's answers on a lab host).
const decision = (id: string, at: string) => ({
  id: 1, correlation_id: id, session_id: null, task_type: 'research', delegated_to: 'local-model', model_name: 'local-model',
  quality_gate_passed: 1, quality_gate_detail: 'completed', latency_ms: 4960, tokens_input: 318, tokens_output: 349,
  tokens_to_compliance: 667, required_bar: 0.8, actual_score: 1, escalation_count: 0, cost_tier_name: 'local',
  terminal_ok: 1, cost_usd: 0, created_at: at, written_at: at, data_source: 'real', backend_id: 'local-coder', host: 'lab-host',
  usage_source: 'measured', finish_reason: 'stop',
});
const metering = (kind: 'all' | 'day', start: string) => ({
  tenant_id: TENANT, window_kind: kind, window_start: start, as_of: '2026-10-13T10:52:43+00:00', baseline_model: 'claude-sonnet-5-5',
  pricing_manifest_version: '1.0.0', baseline_state: 'resolved', runs_total: 2, runs_measured: 2, runs_unknown_tokens: 0,
  runs_unknown_spend: 0, tokens_in: 729, tokens_out: 747, spend_usd: '0.001000', counterfactual_usd: '0.008928',
  savings_usd: '0.007928', savings_per_measured_run_usd: '0.003964', compression_ratio: null, cache_hit_rate: null,
});
const step = (sequence: number, kind: string) => ({
  tenant_id: TENANT, correlation_id: RUN, step_sequence: sequence, step_kind: kind, started_at: `2026-10-13T10:52:3${sequence}+00:00`,
  duration_ms: sequence === 3 ? 4960 : null, outcome: 'succeeded', failure_cause: null, backend_id: sequence > 1 ? 'local-coder' : null,
  model_id: sequence > 1 ? 'local-model' : null, attempt_number: sequence === 3 ? 1 : null, reason: sequence === 1 ? 'research' : null,
  candidates: sequence === 2 ? ['local', 'cheap_cloud'] : null, failing_step_sequence: null,
});
const SERVED: Array<[string, unknown[]]> = [
  ['delegation.decisions.v1', [decision(RUN, '2026-10-13T10:52:43.446325+00:00'), decision('33333333-3333-4333-8333-333333333333', '2026-10-13T10:52:36.081741+00:00')]],
  ['metering-summary.v1', [metering('all', ''), metering('day', '2026-10-12'), metering('day', '2026-10-13')]],
  ['delegation.savings.v1', [{ tenant_id: TENANT, cumulative_savings_usd: 0.007928, cumulative_local_cost_usd: 0.001, cumulative_cloud_cost_usd: 0.008928, baseline_model: 'claude-sonnet-5-5', pricing_manifest_version: '1', session_count: 2, sessions: [], captured_at: '2026-10-13T10:52:43+00:00' }]],
  ['delegation.model-routing.v1', [{ tenant_id: TENANT, total_delegations: 2, captured_at: '2026-10-13T10:52:43+00:00', by_tier: { tiers: [{ cost_tier_name: 'local', count: 1, tier_routed: true, pct_of_tier_routed: 0.5 }, { cost_tier_name: 'cheap_cloud', count: 1, tier_routed: true, pct_of_tier_routed: 0.5 }], tier_routed_total: 2, not_tier_routed_total: 0, total: 2, local_call_share: 0.5 } }]],
  ['delegation.quality-gate.v1', [{ tenant_id: TENANT, overall_pass_rate: 0.5, total_passed: 1, total_failed: 1, total_checks: 2, avg_actual_score: 0.9, avg_required_bar: 0.8, captured_at: '2026-10-13T10:52:43+00:00' }]],
  ['usage-by-model-day.v1', [{ tenant_id: TENANT, usage_day: '2026-10-13', model_id: 'local-model', input_tokens: 729, output_tokens: 747, cost_usd: 0, measured_cost_usd: 0, unmeasured_call_count: 0, call_count: 2 }]],
  ['run-trace.v1', ['request', 'routing_decision', 'provider_call', 'quality_gate', 'terminal'].map((kind, index) => step(index + 1, kind))],
  ['tenant-credentials.v1', [{ api_key_ref: 'ref-1', tenant_id: TENANT, name: 'openai-main', provider: 'openai', created_at: '2026-10-12T09:00:00+00:00', revoked_at: null }]],
];

/** The parts a panel may draw its text in. Anything else in a panel is a bare figure. */
const PARTS = [
  'h2', 'details > summary', '.local-dashboard-metric', '.local-dashboard-caption', '.local-dashboard-asof', 'dl.local-dashboard-fields',
  '.local-dashboard-table-wrap', '.local-dashboard-empty', '[role="status"]', '[role="alert"]', 'figure.local-chart',
  '.local-share', '.local-meter', '.local-dashboard-filters', '.local-dashboard-pager', '.local-run-title',
  'nav.local-run-diagram', 'ol.local-dashboard-steps', '.usage-tokens-day',
].join(', ');
/** Where a page may draw text at all. */
const PAGE_PARTS = 'details.local-overview-secondary > summary, header.local-dashboard-header, article.local-dashboard-panel, main > [role="status"], main > [role="alert"]';

function texts(root: Element): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const found: Text[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if ((node.textContent ?? '').trim() !== '') found.push(node as Text);
  }
  return found;
}
const where = (node: Text) => `"${(node.textContent ?? '').trim().slice(0, 40)}" in <${node.parentElement?.tagName.toLowerCase()} class="${node.parentElement?.className ?? ''}">`;

async function open(pageName: PageName, served: boolean): Promise<HTMLElement> {
  harness.served = new Map(served ? SERVED.map(([name, rows]) => [P + name, rows]) : []);
  const { container } = render(<LocalDashboardPage pageName={pageName} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  return container;
}

beforeEach(() => { vi.useFakeTimers({ now: new Date('2026-10-13T12:00:00Z') }); });
afterEach(() => { cleanup(); vi.useRealTimers(); window.history.replaceState(null, '', '/'); });

describe.each([[true, 'every bound exposure served'], [false, 'nothing served']] as const)('OMN-21015 U1: one look (served: %s, %s)', (served, _state) => {
  it.each(PAGES)('K1, K5: %s draws its text only in the header and in panels', async (pageName) => {
    const container = await open(pageName, served);
    const panels = container.querySelectorAll('article.local-dashboard-panel');
    expect(panels.length).toBeGreaterThan(0);
    const outside = texts(container).filter((node) => node.parentElement?.closest(PAGE_PARTS) === null);
    expect(outside.map(where)).toEqual([]);
  });

  it.each(PAGES)('K2: every panel of %s draws its text only in the shared parts', async (pageName) => {
    const container = await open(pageName, served);
    const bare = [...container.querySelectorAll('article.local-dashboard-panel')].flatMap((panel) =>
      texts(panel).filter((node) => node.parentElement?.closest(PARTS) === null));
    expect(bare.map(where)).toEqual([]);
  });

  it.each(PAGES)('K3, K4: %s has a header with an icon, and every panel a heading with an icon', async (pageName) => {
    const container = await open(pageName, served);
    expect(container.querySelector('header.local-dashboard-header .local-dashboard-page-icon svg')).not.toBeNull();
    const headings = [...container.querySelectorAll('article.local-dashboard-panel')].map((panel) => {
      const heading = panel.querySelector(':scope > h2');
      return `${heading?.textContent ?? '(no heading)'}: ${heading?.querySelector('svg.lucide') ? 'icon' : 'NO ICON'}`;
    });
    expect(headings.filter((line) => line.startsWith('(no heading)') || line.endsWith('NO ICON'))).toEqual([]);
  });
});

describe('OMN-21015 U1: the guard is looking at drawn pages', () => {
  // A value only the constructed rows carry, and the part it must be drawn in. A page that drew its panels without
  // the served rows would still pass K1 to K4, so each served page is held to one served value.
  it.each([
    ['overview', '.local-dashboard-metric', '729 in · 747 out'],
    ['runs', 'table tbody tr', RUN],
    ['workflow', 'ol.local-dashboard-steps > li', 'Provider call'],
    ['usage', 'table tbody tr', '747'],
    ['credentials', 'table tbody tr', 'openai-main'],
  ] as const)('K5: served %s draws a served value (%s)', async (pageName, selector, value) => {
    const container = await open(pageName, true);
    // OMN-21166 R-A: a run table writes a long run id short; the served id stays whole on its link's title.
    const drawn = [...container.querySelectorAll(selector)].map((node) => `${node.textContent ?? ''} ${[...node.querySelectorAll('[title]')].map((el) => el.getAttribute('title')).join(' ')}`);
    expect(drawn.filter((text) => text.includes(value)).length).toBeGreaterThan(0);
  });

  it('K5: served api-keys draws its field list', async () => {
    // Its exposure (local-identity.v1) is not served by any runtime yet, so the page is held to its typed fields.
    const container = await open('api-keys', true);
    expect(container.querySelectorAll('dl.local-dashboard-fields dd').length).toBeGreaterThan(0);
  });
});
