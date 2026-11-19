// OMN-19998: every page of the app holds its projection request budget.
//
// The dashboard paged a 120,896-run decisions table through the dev runtime's projection API and drove the dev Postgres
// to about 110 percent CPU. A page's request count must be a FIXED number that does not grow with the size of the store:
// this file mounts the whole app (the real providers, router, pages and fetch layer; only the network is a recording fake
// of the projection API) at every page path, once over a 600-run store and once over a 120,896-run store, and holds the
// first-load request count and the count of one refresh cycle to be equal for the two stores, with no since-page request
// and at most two decisions.v1 requests per load. Failure modes, each a page that fails its own test:
//   G1  a page whose first load walks the decisions since-pages (the Runs page, Delegation Evidence, Event Bus and
//       Experiments before this change: 201 requests for the large store against 1 for the small)
//   G2  a refresh cycle that walks them (the Overview page did, before omnidash#513: about 180 requests a minute)
//   G3  a page that reads nothing at all, which would make G1 and G2 pass for the wrong reason: each page's first load
//       must send at least the number of reads its own row below declares
import { act, render } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { Providers } from '@/providers/Providers';
import { RegistryProvider } from '@/registry/RegistryProvider';
import { PAGE_PATHS, pageForPath } from '@/navigation/page-routes';
import { REFRESH_INTERVAL_MS } from '@/theme/refresh';
import { useFrameStore } from '@/store/store';
import { queryClient } from '@/lib/queryClient';

const DECISIONS = 'onex.snapshot.projection.delegation.decisions.v1';
const PAGE_SIZE = 500;
const BASE = Date.parse('2026-11-01T00:00:00Z');

/** Every exposure the app names under src/pages, src/services, src/components and src/hooks; the catalogue lists them all as served. */
const TOPICS = [
  'onex.snapshot.projection.ab-compare.v1',
  'onex.snapshot.projection.agent-routing-decision.v1',
  'onex.snapshot.projection.automation-liveness-alarms.v1',
  'onex.snapshot.projection.automation-liveness-runs.v1',
  'onex.snapshot.projection.automation-liveness.v1',
  'onex.snapshot.projection.baselines.quality.v1',
  'onex.snapshot.projection.baselines.roi.v1',
  'onex.snapshot.projection.board-probe-results.v1',
  'onex.snapshot.projection.capability-scores.v1',
  'onex.snapshot.projection.capsules.v1',
  'onex.snapshot.projection.compaction-receipts.v1',
  'onex.snapshot.projection.consumer-flow.v1',
  'onex.snapshot.projection.context.experiment-scores.v1',
  'onex.snapshot.projection.cost.by_repo.v1',
  'onex.snapshot.projection.cost.savings-overview.v1',
  'onex.snapshot.projection.cost.summary.v1',
  'onex.snapshot.projection.cost.token_usage.v1',
  'onex.snapshot.projection.delegation.acceptance-eval.v1',
  'onex.snapshot.projection.delegation.budget-state.v1',
  'onex.snapshot.projection.delegation.correlation-trace.v1',
  'onex.snapshot.projection.delegation.daily.v1',
  'onex.snapshot.projection.delegation.decisions.v1',
  'onex.snapshot.projection.delegation.inference-response-text.v1',
  'onex.snapshot.projection.delegation.judge-verdicts.v1',
  'onex.snapshot.projection.delegation.model-routing.v1',
  'onex.snapshot.projection.delegation.quality-gate.v1',
  'onex.snapshot.projection.delegation.savings-series.v1',
  'onex.snapshot.projection.delegation.savings.v1',
  'onex.snapshot.projection.delegation.summary.v1',
  'onex.snapshot.projection.delegation.token-usage.v1',
  'onex.snapshot.projection.dep-health.findings.v1',
  'onex.snapshot.projection.deployment-evidence.v1',
  'onex.snapshot.projection.deployment-readiness.v1',
  'onex.snapshot.projection.event_chain.v1',
  'onex.snapshot.projection.evidence_pipeline.correlations.v1',
  'onex.snapshot.projection.evidence_pipeline.live_events.v1',
  'onex.snapshot.projection.evidence_pipeline.readiness.v1',
  'onex.snapshot.projection.evidence_pipeline.stages.v1',
  'onex.snapshot.projection.gate.activity.v1',
  'onex.snapshot.projection.gate.metrics.v1',
  'onex.snapshot.projection.hook.ledger.v1',
  'onex.snapshot.projection.intent-classification.distribution.v1',
  'onex.snapshot.projection.intent-classification.v1',
  'onex.snapshot.projection.invented-after-this-test-was-written.v1',
  'onex.snapshot.projection.lab.lane-health.v1',
  'onex.snapshot.projection.live-events.v1',
  'onex.snapshot.projection.llm_cost.v1',
  'onex.snapshot.projection.local-alerts.v1',
  'onex.snapshot.projection.local-environment.v1',
  'onex.snapshot.projection.mcp-tools.v1',
  'onex.snapshot.projection.metering-summary.v1',
  'onex.snapshot.projection.missing.v1',
  'onex.snapshot.projection.mystery.v1',
  'onex.snapshot.projection.omnimarket.instruction-eval-aggregate.v1',
  'onex.snapshot.projection.overnight.v1',
  'onex.snapshot.projection.pattern-learning.v1',
  'onex.snapshot.projection.pr-lifecycle-ledger.v1',
  'onex.snapshot.projection.prod-promotion-gate.v1',
  'onex.snapshot.projection.pr-state.v1',
  'onex.snapshot.projection.receipt-gate.v1',
  'onex.snapshot.projection.registration.v1',
  'onex.snapshot.projection.routing-decision.v1',
  'onex.snapshot.projection.runner-fleet.v1',
  'onex.snapshot.projection.runtime-error-fingerprints.v1',
  'onex.snapshot.projection.run-trace.v1',
  'onex.snapshot.projection.sandbox.decisions.v1',
  'onex.snapshot.projection.savings.v1',
  'onex.snapshot.projection.session.replay.v1',
  'onex.snapshot.projection.skill-executions.v1',
  'onex.snapshot.projection.swarm.runs.v1',
  'onex.snapshot.projection.tenant-credentials.v1',
  'onex.snapshot.projection.test.v1',
  'onex.snapshot.projection.topic-activity.v1',
  'onex.snapshot.projection.traces.v1',
  'onex.snapshot.projection.usage-by-model-day.v1',
  'onex.snapshot.projection.view-seam-readings.v1',
  'onex.snapshot.projection.voice.sessions.v1',
  'onex.snapshot.projection.work.events.v1',
  'onex.snapshot.projection.work.open-obligations.v1',
];

/** The least first-load projection reads each page sends over the fake (G3): a page that reads less is not being measured. */
const MIN_FIRST_LOAD_READS: Record<string, number> = {
  '/overview': 5, '/runs': 3, '/workflow': 3, '/usage': 4, '/settings': 0, '/dashboard': 0,
  '/delegation-evidence': 4, '/event-bus': 1, '/experiments': 1, '/agent-workbench': 0, '/lab': 0,
  '/feature-flags': 0, '/instruction-eval': 0,
};

vi.mock('@/data-source/data-source-override', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data-source/data-source-override')>()),
  resolveEffectiveDataSource: () => ({ mode: 'http', baseUrl: 'http://projection.test' }),
}));
vi.mock('@/data-source/projection-base-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data-source/projection-base-url')>()),
  resolveProjectionBaseUrl: () => '',
  projectionUrl: (topic: string, query?: string) =>
    query ? `/projection/${encodeURIComponent(topic)}?${query}` : `/projection/${encodeURIComponent(topic)}`,
}));
vi.mock('@/data-source/projection-tenant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data-source/projection-tenant')>()),
  resolveConfiguredTenant: () => 'tenant-a',
}));

interface Read { topic: string; since: string | null }

/** A recording fake of the projection API over a store of `runs` decisions (the read node's paging: newest 500 ranked, next_cursor '0' starts an ascending walk, 500 a since page). */
function serveProjectionApi(runs: number) {
  const reads: Read[] = [];
  const row = (cursor: number) => ({
    projection_cursor: cursor, correlation_id: `run-${cursor}`, id: `run-${cursor}`,
    written_at: new Date(BASE + cursor * 60_000).toISOString(), created_at: new Date(BASE + cursor * 60_000).toISOString(), quality_gate_passed: true, terminal_ok: true,
    model_name: 'model-a', latency_ms: 900, task_type: 'coding',
  });
  const envelope = (rows: unknown[], extra: Record<string, unknown> = {}) => new Response(
    JSON.stringify({ rows, row_count: rows.length, data_freshness: 'fresh', latest_event_at: null, ...extra }), { status: 200 });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input instanceof Request ? input.url : input), 'http://projection.test');
    if (url.pathname.endsWith('/projections')) {
      return new Response(JSON.stringify({ topics: TOPICS.map((topic) => ({ topic, backing: 'bus', bus_backed: true, status: 'ok' })) }), { status: 200 });
    }
    const match = /\/projection\/([^/]+)$/.exec(url.pathname);
    if (match === null) return new Response(JSON.stringify({ detail: 'not_found' }), { status: 404 });
    const topic = decodeURIComponent(match[1]!);
    const since = url.searchParams.get('since');
    reads.push({ topic, since });
    if (topic !== DECISIONS) return envelope([]);
    if (since === null) {
      const newest = Array.from({ length: Math.min(PAGE_SIZE, runs) }, (_, index) => row(runs - index));
      return runs > PAGE_SIZE ? envelope(newest, { truncated: true, next_cursor: '0' }) : envelope(newest);
    }
    const after = Number(since);
    const page = Array.from({ length: Math.min(PAGE_SIZE, Math.max(0, runs - after)) }, (_, index) => row(after + 1 + index));
    return runs - after - page.length > 0
      ? envelope(page, { truncated: true, next_cursor: String(after + page.length) })
      : envelope(page);
  }));
  return reads;
}

function renderApp(path: string) {
  window.history.replaceState(null, '', path);
  useFrameStore.setState({ activePage: pageForPath(path) ?? 'local-overview' });
  return render(
    <Providers>
      <RegistryProvider manifest={{ manifestVersion: '1.0', generatedAt: '2026-04-10T00:00:00Z', components: {} }}>
        <App />
      </RegistryProvider>
    </Providers>,
  );
}

/** Advance fake time until the request count holds still for three seconds, and return it. */
async function settle(reads: Read[]): Promise<number> {
  let last = -1;
  let still = 0;
  for (let step = 0; step < 60 && still < 3; step += 1) {
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    still = reads.length === last ? still + 1 : 0;
    last = reads.length;
  }
  return reads.length;
}

async function measure(path: string, runs: number) {
  // The app's one query client outlives a render: a second page load would read its cache, not the network.
  queryClient.clear();
  const reads = serveProjectionApi(runs);
  const view = renderApp(path);
  const first = await settle(reads);
  const firstReads = reads.slice();
  await act(async () => { await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS); });
  const cycle = (await settle(reads)) - first;
  view.unmount();
  return { first, cycle, reads, firstReads };
}

// Every page is a lazy destination (src/App.tsx): load the chunks first, as src/App.integration.test.tsx does, so a page
// renders on microtasks and the fake clock below is all the time the measurement needs.
beforeAll(async () => {
  await Promise.all([
    import('@/theme/design-system/page-sheets'), import('@/pages/LocalDashboardPage'), import('@/pages/SettingsPage'),
    import('@/pages/DashboardView'), import('@/pages/DelegationEvidencePage'), import('@/pages/EventBusPage'),
    import('@/pages/ExperimentsPage'), import('@/pages/SeaControlPage'), import('@/pages/LabPage'),
    import('@/pages/FeatureFlagDashboard'), import('@/pages/InstructionEvalPage'),
  ]);
}, 120_000);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(new Date('2026-11-01T10:12:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('OMN-19998: every page of the app holds its projection request budget', () => {
  for (const path of Object.values(PAGE_PATHS)) {
    it(`${path}: first load and one refresh cycle send the same requests over a 600-run and a 120,896-run store`, async () => {
      const small = await measure(path, 600);
      const large = await measure(path, 120_896);
      // G1: the control. On the code before this change the Runs page (203 reads on the large store), Delegation Evidence,
      // Event Bus and Experiments pages walked 200 since-pages on a first load, so these counts differed with the store.
      expect(large.first, `${path}: first-load requests must not grow with the store`).toBe(small.first);
      // G2: a refresh cycle must not grow with the store either.
      expect(large.cycle, `${path}: refresh-cycle requests must not grow with the store`).toBe(small.cycle);
      for (const run of [small, large]) {
        expect(run.reads.filter((read) => read.since !== null), `${path}: no request may carry a since parameter`).toEqual([]);
        // The Lab page binds decisions.v1 in two widgets, so a load reads it twice; no page reads it more often than that.
        expect(run.firstReads.filter((read) => read.topic === DECISIONS).length, `${path}: at most two decisions.v1 reads per load`).toBeLessThanOrEqual(2);
      }
      // G3: the page is really being measured.
      expect(small.first, `${path}: sent fewer first-load reads than its declared floor`).toBeGreaterThanOrEqual(MIN_FIRST_LOAD_READS[path] ?? 0);
    });
  }
});
