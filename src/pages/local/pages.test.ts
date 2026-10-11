import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv from 'ajv';
import { describe, expect, it, vi } from 'vitest';
import dashboardConfigSchema from './model-dashboard-config.schema.json';
import componentContractSchema from '../../components/dashboard/contract-inspector/component-contract-schema.json';
import type {
  ModelComponentContract,
  ModelDataBindingContract,
} from '../../shared/types/generated/onex-models';
import {
  loadLocalPageSnapshots,
  loadLocalPageConfig,
  rowsForLocalBinding,
  rowsForLocalComponent,
  resolveLocalPageEmptyState,
  type LocalPageDocument,
} from '../../layout/local-page-loader';

const pages = ['overview', 'runs', 'workflow', 'usage', 'credentials', 'api-keys'] as const;
// Amendment 7 (AC1): every page names at least one served exposure.
const servedPages = pages;
// The exposures the lab projection API answers `ok`, captured read-only from
// GET /projections. A hand-written list here once called a degraded exposure
// served, so the Overview it backed rendered nothing on the lab.
const servedExposureCatalogue = new Set(
  (JSON.parse(readFileSync(resolve(process.cwd(), 'src/pages/local/served-catalogue.lab.json'), 'utf8')) as {
    exposures: Array<{ topic: string; status: string }>;
  }).exposures.filter((exposure) => exposure.status === 'ok').map((exposure) => exposure.topic),
);
const componentValidator = new Ajv({ allErrors: true, validateFormats: false }).compile(componentContractSchema);
// Generated from omnibase_core.ModelDashboardConfig.model_json_schema() at
// core worktree 47187e6a3513733e135dc5f3b0d290ca4956c0c6; this is schema-only,
// because omnibase_core's curated TS export intentionally omits this model.
const dashboardConfigValidator = new Ajv({ allErrors: true, validateFormats: false, strict: false }).compile(dashboardConfigSchema);

const readPage = (page: (typeof pages)[number]): LocalPageDocument => loadLocalPageConfig(page);

describe('local dashboard page contracts', () => {
  it.each(servedPages)('%s names only served projection exposures', async (pageName) => {
    const page = await readPage(pageName);
    const bindings = page.components.flatMap((component) => component.data_bindings ?? []);

    expect(page.dashboard.name).toBeTruthy();
    expect(page.dashboard.widgets.length).toBeGreaterThan(0);
    expect(bindings.length).toBeGreaterThan(0);
    for (const binding of bindings) {
      expect(servedExposureCatalogue.has(binding.projection_topic)).toBe(true);
    }
  });

  it.each(pages)('%s page file has ModelDashboardConfig fields at its root', async (pageName) => {
    const raw = JSON.parse(readFileSync(resolve(process.cwd(), `src/pages/local/${pageName}.page.yaml`), 'utf8')) as Record<string, unknown>;
    expect(dashboardConfigValidator(raw), JSON.stringify(dashboardConfigValidator.errors)).toBe(true);
  });

  it('uses a positive control to prove the dashboard model validator rejects extra fields', async () => {
    const page = JSON.parse(readFileSync(resolve(process.cwd(), 'src/pages/local/overview.page.yaml'), 'utf8')) as Record<string, unknown>;
    expect(dashboardConfigValidator(page)).toBe(true);
    expect(dashboardConfigValidator({ ...page, components: [] })).toBe(false);
  });

  // Ticket AC2: no widget on a local page names a topic a server reader answers by hand-written SQL. The SQLite reader
  // is deleted (AC3), so the Postgres reader is the one left to read; every local page is checked.
  const sqlFoldTopics = (file: string): Set<string> => {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8');
    return new Set([...source.matchAll(/case\s+'(onex\.snapshot\.projection\.[^']+)'\s*:/g)].map((match) => match[1]));
  };

  it('AC3: the hand-written SQLite reader is deleted', () => {
    expect(existsSync(resolve(process.cwd(), 'server/sqlite-projection-reader.ts'))).toBe(false);
  });

  it('reads the Postgres reader\'s hand-written SQL topics (positive control)', () => {
    for (const file of ['server/postgres-projection-reader.ts']) {
      expect(sqlFoldTopics(file).has('onex.snapshot.projection.delegation.summary.v1'), file).toBe(true);
    }
  });

  it.each(pages)('%s does not name a topic the reader answers by hand-written SQL', (pageName) => {
    const page = readPage(pageName);
    for (const file of ['server/postgres-projection-reader.ts']) {
      const sqlTopics = sqlFoldTopics(file);
      for (const binding of page.components.flatMap((component) => component.data_bindings ?? [])) {
        expect(sqlTopics.has(binding.projection_topic), `${file} answers ${binding.projection_topic}`).toBe(false);
      }
    }
  });

  it.each(pages)('%s uses the generated core component and binding contracts', async (pageName) => {
    const page = await readPage(pageName);
    expect(page.components.length).toBeGreaterThan(0);
    for (const component of page.components) {
      const coreComponent: ModelComponentContract = component;
      expect(componentValidator(coreComponent), JSON.stringify(componentValidator.errors)).toBe(true);
      for (const binding of coreComponent.data_bindings ?? []) {
        const coreBinding: ModelDataBindingContract = binding;
        expect(componentValidator({
          component_id: 'binding-validation',
          component_kind: 'table',
          title: 'Binding validation',
          contract_version: { major: 1, minor: 0, patch: 0 },
          data_bindings: [coreBinding],
        })).toBe(true);
      }
    }
  });

  it('loads page bindings only in HTTP mode and preserves empty results as typed state', async () => {
    const page = await readPage('overview');
    const source = {
      async *readAll() { yield []; },
      readSnapshot: vi.fn(async () => ({
        rows: [],
        rowCount: 0,
        dataFreshness: 'idle' as const,
        latestEventAt: null,
        readAt: '2026-10-01T00:00:00.000Z',
      })),
    };

    const snapshots = await loadLocalPageSnapshots(page, source, {
      mode: 'http',
      availableTopics: servedExposureCatalogue,
    });

    expect(source.readSnapshot).toHaveBeenCalledTimes(
      new Set(page.components.flatMap((component) => (component.data_bindings ?? []).map((binding) => binding.projection_topic))).size,
    );
    expect(resolveLocalPageEmptyState(page, snapshots)).toBe('NO_RUNS_YET');
    expect(snapshots.some((snapshot) => snapshot.rows.some((row) => (row as Record<string, unknown>).savings_usd === 0))).toBe(false);
  });

  it('surfaces unresolved baseline instead of a savings number', async () => {
    const page = await readPage('overview');
    // OMN-19980 Amendment 2: the headline cards read metering-summary.v1, whose rows never decide the page state
    // (each card says why its own figure is missing), so the page state is read off the first other binding.
    const overviewBinding = page.components.map((c) => c.data_bindings?.[0])
      .find((b) => b !== undefined && b.projection_topic !== 'onex.snapshot.projection.metering-summary.v1');
    expect(overviewBinding).toBeDefined();
    const snapshots = [{
      topic: overviewBinding?.projection_topic ?? '',
      rows: [{ savings_usd: null, baseline_state: 'BASELINE_UNRESOLVED' }],
      rowCount: 1,
      dataFreshness: 'fresh' as const,
      latestEventAt: null,
      readAt: '2026-10-01T00:00:00.000Z',
    }];

    expect(resolveLocalPageEmptyState(page, snapshots)).toBe('BASELINE_UNRESOLVED');
  });

  it('binds Runs to delegation decisions, with the savings session as its lookup (RU-1, Amendment 6)', () => {
    const runs = readPage('runs');
    const [rowsBinding, lookup] = runs.components[0]?.data_bindings ?? [];

    expect(rowsBinding?.projection_topic).toBe('onex.snapshot.projection.delegation.decisions.v1');
    expect(rowsBinding?.ordering_authority_field).toBe('written_at');
    expect(rowsBinding?.required_fields).toEqual(expect.arrayContaining([
      'correlation_id', 'created_at', 'written_at', 'quality_gate_passed', 'quality_gate_detail', 'model_name',
      'tokens_input', 'tokens_output', 'task_type', 'latency_ms', 'tokens_to_compliance', 'cost_tier_name',
      'actual_score', 'data_source',
    ]));
    expect(lookup?.projection_topic).toBe('onex.snapshot.projection.delegation.savings.v1');
    // OMN-19980 AC2b: the lookup carries the run's cost and the baseline labels only; per-run savings, baseline and
    // counterfactual dollars come off (savings are window totals from metering-summary.v1).
    expect(lookup?.required_fields).toEqual([
      'sessions', 'session_id', 'local_cost_usd', 'baseline_model', 'usage_source', 'savings_method',
    ]);
    expect(JSON.stringify(runs.components[0])).not.toMatch(/swarm\.runs|run_id|started_at/);
  });

  it('flattens the delegation-savings sessions of the Runs lookup without losing fields', () => {
    const runs = readPage('runs');
    const snapshots = [{
      topic: 'onex.snapshot.projection.delegation.savings.v1',
      rows: [{
        tenant_id: 'tenant-a',
        sessions: [{
          session_id: 'session-42',
          model_name: 'local-model',
          counterfactual_baseline_usd: 0.1,
          usage_source: 'measured',
          tokens_to_compliance: 165,
        }],
      }],
      rowCount: 1,
      dataFreshness: 'fresh' as const,
      latestEventAt: '2026-10-01T13:40:00Z',
      readAt: '2026-10-01T13:41:00Z',
    }];

    expect(rowsForLocalBinding(runs.components[0]!, snapshots, 1)).toEqual([
      expect.objectContaining({
        session_id: 'session-42',
        model_name: 'local-model',
        counterfactual_baseline_usd: 0.1,
        usage_source: 'measured',
        tokens_to_compliance: 165,
      }),
    ]);
  });

  it('maps no served decisions to NO_RUNS_YET', () => {
    const runs = readPage('runs');
    const snapshots = [
      { topic: 'onex.snapshot.projection.delegation.decisions.v1', rows: [] },
      { topic: 'onex.snapshot.projection.delegation.savings.v1', rows: [{ tenant_id: 'tenant-a', sessions: [] }] },
    ].map((snapshot) => ({ ...snapshot, rowCount: snapshot.rows.length, dataFreshness: 'fresh' as const, latestEventAt: null, readAt: '2026-10-01T13:41:00Z' }));

    expect(rowsForLocalComponent(runs.components[0]!, snapshots)).toEqual([]);
    expect(resolveLocalPageEmptyState(runs, snapshots)).toBe('NO_RUNS_YET');
  });

  it('does not call a page NO_RUNS_YET when one of its reads failed (F26)', () => {
    const runs = readPage('runs');
    const snapshots = [
      { topic: 'onex.snapshot.projection.delegation.decisions.v1', rows: [], failure: { kind: 'error' as const, message: 'HTTP 503' } },
      { topic: 'onex.snapshot.projection.delegation.savings.v1', rows: [] },
    ].map((snapshot) => ({ ...snapshot, rowCount: 0, dataFreshness: 'fresh' as const, latestEventAt: null, readAt: '2026-10-01T13:41:00Z' }));

    expect(resolveLocalPageEmptyState(runs, snapshots)).toBeNull();
  });

  it('keeps a run with an unresolved session as a Runs row so the row can show the typed state', () => {
    const runs = readPage('runs');
    const snapshots = [
      { topic: 'onex.snapshot.projection.delegation.decisions.v1', rows: [{ correlation_id: 'unresolved' }] },
      { topic: 'onex.snapshot.projection.delegation.savings.v1', rows: [{ sessions: [{ session_id: 'unresolved', baseline_model: null, savings_usd: 0 }] }] },
    ].map((snapshot) => ({ ...snapshot, rowCount: 1, dataFreshness: 'fresh' as const, latestEventAt: null, readAt: '2026-10-01T13:41:00Z' }));

    expect(resolveLocalPageEmptyState(runs, snapshots)).toBeNull();
  });


  it('reads Runs through ProtocolSnapshotSource using the delegation-savings and decisions topics only', async () => {
    const runs = readPage('runs');
    const source = {
      async *readAll() { yield []; },
      readSnapshot: vi.fn(async () => ({
        rows: [],
        rowCount: 0,
        dataFreshness: 'idle' as const,
        latestEventAt: null,
        readAt: '2026-10-01T13:41:00Z',
      })),
    };

    await loadLocalPageSnapshots(runs, source, {
      mode: 'http',
      availableTopics: servedExposureCatalogue,
    });

    expect(source.readSnapshot).toHaveBeenCalledTimes(2);
    expect(source.readSnapshot).toHaveBeenCalledWith('onex.snapshot.projection.delegation.savings.v1');
    expect(source.readSnapshot).toHaveBeenCalledWith('onex.snapshot.projection.delegation.decisions.v1');
  });
});

describe('local pages against the captured lab catalogue', () => {
  // GET /projections on the lab projection API, captured read-only. A degraded
  // exposure answers 503 on every read, so a page bound to one renders nothing.
  const labCatalogue = JSON.parse(
    readFileSync(resolve(process.cwd(), 'src/pages/local/served-catalogue.lab.json'), 'utf8'),
  ) as { exposures: Array<{ topic: string; status: string }> };
  const okTopics = new Set(labCatalogue.exposures.filter((e) => e.status === 'ok').map((e) => e.topic));

  it('the captured catalogue can tell ok from degraded', () => {
    expect(okTopics.has('onex.snapshot.projection.delegation.savings.v1')).toBe(true);
    expect(okTopics.has('onex.snapshot.projection.baselines.roi.v1')).toBe(false);
  });

  it.each(pages)('%s binds only exposures the lab catalogue marks ok', (pageName) => {
    const page = readPage(pageName);
    for (const binding of page.components.flatMap((component) => component.data_bindings ?? [])) {
      expect(okTopics.has(binding.projection_topic), binding.projection_topic).toBe(true);
    }
  });

  it('Overview shows spend, savings, measured runs and a typed tokens state (requirements OV-3, SV-2, SV-3)', () => {
    const page = readPage('overview');
    const topics = page.components.flatMap((c) => (c.data_bindings ?? []).map((b) => b.projection_topic));
    expect(new Set(topics)).toEqual(new Set([
      // Per-run cost lookups for Last run and Recent runs (ruling 2: every per-run cost figure stays).
      'onex.snapshot.projection.delegation.savings.v1',
      'onex.snapshot.projection.delegation.decisions.v1',
      // OMN-19980 Step B and Amendment 2: Spend, Savings, Measured runs and Tokens, all from the one all-time row;
      // cost.savings-overview.v1 is no longer read by Overview.
      'onex.snapshot.projection.metering-summary.v1',
      // OMN-20225 AC3: the quality panel and the tier-mix panel.
      'onex.snapshot.projection.delegation.quality-gate.v1',
      'onex.snapshot.projection.delegation.model-routing.v1',
    ]));
    const keys = page.dashboard.widgets
      .filter((w) => (w.config as Record<string, unknown>).config_kind === 'metric_card')
      .map((w) => (w.config as Record<string, unknown>).metric_key);
    expect(keys).toEqual([
      'spend_usd', 'savings_usd', 'runs_measured', 'tokens_in_and_out',
      // OMN-20009: the served run-locally share and the served saving per measured run.
      'by_tier.local_call_share', 'savings_per_measured_run_usd',
      // OMN-20752: Baseline spend, the same all-time row's served counterfactual_usd.
      'counterfactual_usd',
      // OMN-20226: compression and cache hit rate, each a served metering-summary.v1 column, Not measured until produced.
      'compression_ratio', 'cache_hit_rate',
    ]);
    const savings = page.components.find((c) => c.component_id === 'overview-savings');
    // SV-2 / OV-3 and OMN-19980 Step B: the figure, its baseline model and its pricing manifest version all come from
    // the one metering-summary.v1 all-time row, so there is no second (caption) binding.
    expect(savings?.data_bindings?.map((b) => b.projection_topic)).toEqual(['onex.snapshot.projection.metering-summary.v1']);
    expect(savings?.data_bindings?.[0]?.required_fields).toEqual(
      ['window_kind', 'as_of', 'baseline_model', 'pricing_manifest_version', 'baseline_state', 'savings_usd'],
    );
    // Measured runs' excluded counts are the same row's run classes, not a second exposure's (Amendment 2).
    const measured = page.components.find((c) => c.component_id === 'overview-measured');
    expect(measured?.data_bindings?.map((b) => b.projection_topic)).toEqual(['onex.snapshot.projection.metering-summary.v1']);
    expect(measured?.data_bindings?.[0]?.required_fields).toEqual(
      ['window_kind', 'as_of', 'runs_measured', 'runs_total', 'runs_unknown_tokens', 'runs_unknown_spend'],
    );
  });

  it('Overview shows no combined token total, and tokens in and out are read from metering-summary.v1 (SV-3)', () => {
    const page = readPage('overview');
    for (const widget of page.dashboard.widgets) {
      const key = String((widget.config as Record<string, unknown>).metric_key);
      expect(key, 'a combined token total').not.toBe('tokens_total');
      for (const column of ((widget.config as { columns?: Array<{ key: string }> }).columns ?? [])) {
        expect(column.key, 'a combined token column').not.toBe('tokens_total');
      }
    }
    // OMN-19980 Amendment 2: the two served columns, from the all-time row; not a combined total.
    const tokens = page.components.find((c) => c.component_id === 'overview-tokens');
    expect(tokens?.data_bindings?.map((b) => b.projection_topic)).toEqual(['onex.snapshot.projection.metering-summary.v1']);
    expect(tokens?.data_bindings?.[0]?.required_fields).toEqual(expect.arrayContaining(['tokens_in', 'tokens_out']));
    expect(tokens?.data_bindings?.[0]?.required_fields).not.toContain('tokens_total');
  });


  it('Overview never reads local_token_pct, a literal 0 the view does not measure', () => {
    for (const file of ['overview.page.yaml', 'overview.contracts.yaml']) {
      const raw = readFileSync(resolve(process.cwd(), `src/pages/local/${file}`), 'utf8');
      expect(raw.includes('local_token_pct'), file).toBe(false);
    }
  });
});

describe('Amendment 5: last run, recent runs and run status from delegation decisions', () => {
  const DECISIONS = 'onex.snapshot.projection.delegation.decisions.v1';
  const SAVINGS = 'onex.snapshot.projection.delegation.savings.v1';
  const decisionFields = [
    'correlation_id', 'written_at', 'quality_gate_passed', 'quality_gate_detail', 'model_name',
    'latency_ms', 'tokens_input', 'tokens_output', 'task_type', 'cost_tier_name',
  ];

  it.each([['overview-last-run', 1], ['overview-recent-runs', 10]] as const)(
    'Overview %s reads decisions, newest first by written_at, with its cost from the savings session (OV-4, OV-5)',
    (componentId, pageSize) => {
      const page = readPage('overview');
      const component = page.components.find((c) => c.component_id === componentId);
      const [first, second] = component?.data_bindings ?? [];
      expect(first?.projection_topic).toBe(DECISIONS);
      expect(first?.ordering_authority_field).toBe('written_at');
      expect(first?.ordering_direction).toBe('descending');
      expect(first?.required_fields).toEqual(expect.arrayContaining(decisionFields));
      expect(second?.projection_topic).toBe(SAVINGS);
      expect(second?.required_fields).toEqual(expect.arrayContaining(['sessions', 'session_id', 'local_cost_usd']));
      const widget = page.dashboard.widgets.find((w) => w.data_source === componentId);
      expect((widget?.config as Record<string, unknown>).page_size).toBe(pageSize);
    },
  );

  it('Runs rows come from decisions, not from the savings lookup (Amendment 6, F28)', () => {
    const runs = readPage('runs');
    const snapshots = [
      { topic: SAVINGS, rows: [{ sessions: [{ session_id: 'session-1' }] }] },
      { topic: DECISIONS, rows: [{ correlation_id: 'session-1' }, { correlation_id: 'failed-no-session' }] },
    ].map((snapshot) => ({
      ...snapshot,
      rowCount: snapshot.rows.length,
      dataFreshness: 'fresh' as const,
      latestEventAt: null,
      readAt: '2026-10-02T10:12:00Z',
    }));
    expect(rowsForLocalComponent(runs.components[0]!, snapshots)).toEqual([
      { correlation_id: 'session-1' }, { correlation_id: 'failed-no-session' },
    ]);
  });


  it('Overview with served decisions but no savings rows is not NO_RUNS_YET', () => {
    const page = readPage('overview');
    const snapshots = [{
      topic: DECISIONS,
      rows: [{ correlation_id: 'run-1', written_at: '2026-10-02T10:07:00Z' }],
      rowCount: 1,
      dataFreshness: 'fresh' as const,
      latestEventAt: null,
      readAt: '2026-10-02T10:12:00Z',
    }];
    expect(resolveLocalPageEmptyState(page, snapshots)).toBeNull();
  });
});

describe('OMN-20225: run rows carry verdict, backend, host and tier; Overview gains quality and tier-mix panels', () => {
  const runBindings = [
    ['runs', 'recent-runs', 'runs-decisions'],
    ['overview', 'overview-last-run', 'overview-last-run-decisions'],
    ['overview', 'overview-recent-runs', 'overview-recent-runs-decisions'],
    ['workflow', 'workflow-run-path', 'workflow-run-path-decisions'],
  ] as const;

  it.each(runBindings)('%s %s requests the served verdict, score, backend, host and tier (AC1, AC2)', (pageName, componentId, bindingId) => {
    const component = readPage(pageName).components.find((c) => c.component_id === componentId);
    const binding = component?.data_bindings?.find((b) => b.binding_id === bindingId);
    expect(binding?.projection_topic).toBe('onex.snapshot.projection.delegation.decisions.v1');
    for (const field of ['quality_gate_passed', 'actual_score', 'backend_id', 'host', 'cost_tier_name', 'cost_tier_type']) {
      expect(binding?.required_fields, `${componentId} ${field}`).toContain(field);
    }
  });

  it('Runs and Overview recent runs show a Host column beside Backend (AC2)', () => {
    for (const [pageName, componentId] of [['runs', 'recent-runs'], ['overview', 'overview-recent-runs']] as const) {
      const widget = readPage(pageName).dashboard.widgets.find((w) => w.data_source === componentId);
      const keys = ((widget?.config as { columns?: Array<{ key: string }> }).columns ?? []).map((c) => c.key);
      expect(keys.indexOf('host'), componentId).toBe(keys.indexOf('backend') + 1);
    }
  });

  it('Overview binds the quality panel to quality-gate.v1 and the tier mix to model-routing.v1 by_tier (AC3)', () => {
    const page = readPage('overview');
    const quality = page.components.find((c) => c.component_id === 'overview-quality');
    expect(quality?.data_bindings?.map((b) => b.projection_topic)).toEqual(['onex.snapshot.projection.delegation.quality-gate.v1']);
    expect(quality?.data_bindings?.[0]?.required_fields).toEqual([
      'overall_pass_rate', 'total_passed', 'total_failed', 'total_checks', 'avg_actual_score', 'avg_required_bar',
    ]);
    const tierMix = page.components.find((c) => c.component_id === 'overview-tier-mix');
    expect(tierMix?.data_bindings?.map((b) => b.projection_topic)).toEqual(['onex.snapshot.projection.delegation.model-routing.v1']);
    expect(tierMix?.data_bindings?.[0]?.required_fields).toEqual(['by_tier']);
    for (const id of ['overview-quality', 'overview-tier-mix']) {
      expect(page.dashboard.widgets.some((w) => w.data_source === id), id).toBe(true);
    }
  });

  // The served-catalogue check the two panels rely on, as a function, so a planted binding can prove it goes red.
  const unservedTopics = (page: LocalPageDocument): string[] => page.components
    .flatMap((c) => c.data_bindings ?? [])
    .map((b) => b.projection_topic)
    .filter((topic) => !servedExposureCatalogue.has(topic));

  it('the panels bind only served exposures, and a tier mix bound to the degraded savings-series is caught (AC3)', () => {
    const page = readPage('overview');
    expect(unservedTopics(page)).toEqual([]);
    // Positive control: the savings-series tier mix (local_pct, cheap_pct, prem_pct) answers not_yet_bus_backed.
    const planted = structuredClone(page);
    const tierMix = planted.components.find((c) => c.component_id === 'overview-tier-mix');
    tierMix!.data_bindings![0]!.projection_topic = 'onex.snapshot.projection.delegation.savings-series.v1';
    expect(unservedTopics(planted)).toEqual(['onex.snapshot.projection.delegation.savings-series.v1']);
  });
});

describe('Amendment 6: the six local pages and the loader', () => {
  it.each(pages)('%s names at least one exposure, and only served ones (AC1)', (pageName) => {
    const page = readPage(pageName);
    const topics = page.components.flatMap((c) => (c.data_bindings ?? []).map((b) => b.projection_topic));
    expect(topics.length, pageName).toBeGreaterThan(0);
  });

  it('Usage reads usage-by-model-day with tokens in and out apart and measured cost (US-1, US-2, US-4, SV-3)', () => {
    const binding = readPage('usage').components[0]?.data_bindings?.[0];
    expect(binding?.projection_topic).toBe('onex.snapshot.projection.usage-by-model-day.v1');
    expect(binding?.ordering_authority_field).toBe('usage_day');
    expect(binding?.required_fields).toEqual(expect.arrayContaining([
      'tenant_id', 'usage_day', 'model_id', 'input_tokens', 'output_tokens', 'measured_cost_usd',
      'unmeasured_call_count', 'call_count',
    ]));
    // cost_usd sums estimated cost too; the page shows the measured cost only (AC3).
    expect(binding?.required_fields).not.toContain('cost_usd');
  });

  it('Usage binds the savings series to metering-summary.v1 now that it is served (US-3, AC-US3)', () => {
    const page = readPage('usage');
    const series = page.components.find((c) => c.component_id === 'usage-savings-series');
    expect(series?.component_kind).toBe('table');
    // Bound once the lab serves it (omnimarket#3368, catalogued on dev by omnidash#365); never to an unserved exposure.
    expect(servedExposureCatalogue.has('onex.snapshot.projection.metering-summary.v1')).toBe(true);
    expect(series?.data_bindings?.map((b) => b.projection_topic)).toEqual(['onex.snapshot.projection.metering-summary.v1']);
    // The fields MeteringDaySeries reads: day rows grouped by baseline, each day's savings and runs.
    expect(series?.data_bindings?.[0]?.required_fields).toEqual(expect.arrayContaining([
      'window_kind', 'window_start', 'baseline_model', 'baseline_state', 'savings_usd', 'runs_total',
    ]));
    expect(page.dashboard.widgets.some((w) => w.data_source === 'usage-savings-series')).toBe(true);
  });

  it('Workflow reads the newest run from delegation decisions until run-trace is served (WF-3)', () => {
    const binding = readPage('workflow').components[0]?.data_bindings?.[0];
    expect(binding?.projection_topic).toBe('onex.snapshot.projection.delegation.decisions.v1');
    expect(binding?.ordering_authority_field).toBe('written_at');
    expect(binding?.ordering_direction).toBe('descending');
    expect(binding?.required_fields).toEqual(expect.arrayContaining([
      'correlation_id', 'created_at', 'written_at', 'cost_tier_name', 'model_name', 'quality_gate_passed',
      'quality_gate_detail', 'actual_score', 'latency_ms',
    ]));
  });

  it('API Keys reads the tenant id from a served exposure and binds nothing for cloud keys (AK-1, AK-3)', () => {
    const page = readPage('api-keys');
    const identity = page.components.find((c) => c.component_id === 'api-keys-local-identity');
    expect(identity?.data_bindings?.[0]?.projection_topic).toBe('onex.snapshot.projection.delegation.savings.v1');
    expect(identity?.data_bindings?.[0]?.required_fields).toContain('tenant_id');
    expect(page.components.find((c) => c.component_id === 'api-keys-cloud')?.data_bindings).toEqual([]);
  });

  it('Credentials reads the tenant credentials exposure and declares no value field (CR-1, CR-3)', () => {
    const page = readPage('credentials');
    const binding = page.components[0]?.data_bindings?.[0];
    expect(binding?.projection_topic).toBe('onex.snapshot.projection.tenant-credentials.v1');
    expect(binding?.required_fields).toEqual(['provider', 'name', 'created_at', 'revoked_at']);
    expect(JSON.stringify(page)).not.toMatch(/value|secret_value|api_key_value/);
  });

  it('two loads of a page at once share one read per exposure (first-load double read, Amendment 7)', async () => {
    const page = readPage('runs');
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const source = {
      async *readAll() { yield []; },
      readSnapshot: vi.fn(async () => {
        await gate;
        return { rows: [{ correlation_id: 'run-1' }], rowCount: 1, dataFreshness: 'fresh' as const, latestEventAt: null, readAt: '2026-10-02T10:12:00Z' };
      }),
    };
    const options = {
      mode: 'http' as const,
      availableTopics: new Set(['onex.snapshot.projection.delegation.decisions.v1', 'onex.snapshot.projection.delegation.savings.v1']),
    };
    const both = Promise.all([loadLocalPageSnapshots(page, source, options), loadLocalPageSnapshots(page, source, options)]);
    release();
    const [first, second] = await both;
    expect(source.readSnapshot).toHaveBeenCalledTimes(2);
    expect(first.map((s) => s.rows)).toEqual(second.map((s) => s.rows));
    // A later load reads again: sharing covers only reads still in flight.
    await loadLocalPageSnapshots(page, source, options);
    expect(source.readSnapshot).toHaveBeenCalledTimes(4);
  });

  it('a topic the census does not serve fails only its own reads, and the page still loads (F26)', async () => {
    const page = readPage('overview');
    const source = {
      async *readAll() { yield []; },
      readSnapshot: vi.fn(async () => ({ rows: [{ correlation_id: 'run-1' }], rowCount: 1, dataFreshness: 'fresh' as const, latestEventAt: null, readAt: '2026-10-02T10:12:00Z' })),
    };
    const snapshots = await loadLocalPageSnapshots(page, source, {
      mode: 'http',
      availableTopics: new Set(['onex.snapshot.projection.delegation.decisions.v1', 'onex.snapshot.projection.delegation.savings.v1']),
    });
    // OMN-19980 Amendment 2: the headline cards' exposure is the one Overview topic this census leaves out.
    const metering = snapshots.find((s) => s.topic === 'onex.snapshot.projection.metering-summary.v1');
    expect(metering?.failure).toEqual({ kind: 'not-served', message: 'Not served: onex.snapshot.projection.metering-summary.v1' });
    expect(snapshots.find((s) => s.topic === 'onex.snapshot.projection.delegation.decisions.v1')?.failure).toBeUndefined();
    expect(source.readSnapshot).not.toHaveBeenCalledWith('onex.snapshot.projection.metering-summary.v1');
  });
});
