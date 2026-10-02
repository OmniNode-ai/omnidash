import { readFileSync } from 'node:fs';
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
  rowsForLocalComponent,
  resolveLocalPageEmptyState,
  type LocalPageDocument,
} from '../../layout/local-page-loader';

const pages = ['overview', 'runs'] as const;
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
  it.each(pages)('%s names only served projection exposures', async (pageName) => {
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

  // Ticket AC2: no widget on a local page names a topic either server reader
  // answers by hand-written SQL. Both readers are read, every local page is checked.
  const sqlFoldTopics = (file: string): Set<string> => {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8');
    return new Set([...source.matchAll(/case\s+'(onex\.snapshot\.projection\.[^']+)'\s*:/g)].map((match) => match[1]));
  };

  it('reads both readers\' hand-written SQL topics (positive control)', () => {
    for (const file of ['server/sqlite-projection-reader.ts', 'server/postgres-projection-reader.ts']) {
      expect(sqlFoldTopics(file).has('onex.snapshot.projection.delegation.decisions.v1'), file).toBe(true);
    }
  });

  it.each(pages)('%s does not name a topic either reader answers by hand-written SQL', (pageName) => {
    const page = readPage(pageName);
    for (const file of ['server/sqlite-projection-reader.ts', 'server/postgres-projection-reader.ts']) {
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
    const overviewBinding = page.components[0]?.data_bindings?.[0];
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

  it('binds Runs to the delegation-savings envelope and declares every displayed session field', () => {
    const runs = readPage('runs');
    const binding = runs.components[0]?.data_bindings?.[0];

    expect(binding?.projection_topic).toBe('onex.snapshot.projection.delegation.savings.v1');
    expect(binding?.ordering_authority_field).toBe('created_at');
    expect(binding?.required_fields).toEqual(expect.arrayContaining([
      'sessions',
      'session_id',
      'created_at',
      'model_name',
      'prompt_tokens',
      'completion_tokens',
      'local_cost_usd',
      'cloud_cost_usd',
      'counterfactual_baseline_usd',
      'baseline_model',
      'savings_usd',
      'usage_source',
      'savings_method',
      'task_type',
      'latency_ms',
      'tokens_to_compliance',
    ]));
    expect(JSON.stringify(binding)).not.toMatch(/swarm\.runs|run_id|status|started_at/);
  });

  it('flattens delegation-savings sessions into Runs rows without losing fields', () => {
    const runs = readPage('runs');
    const snapshots = [{
      topic: 'onex.snapshot.projection.delegation.savings.v1',
      rows: [{
        tenant_id: 'tenant-a',
        sessions: [{
          session_id: 'session-42',
          created_at: '2026-10-01T13:40:00Z',
          model_name: 'local-model',
          prompt_tokens: 120,
          completion_tokens: 45,
          local_cost_usd: 0.01,
          cloud_cost_usd: 0.09,
          counterfactual_baseline_usd: 0.1,
          baseline_model: 'cloud-model',
          savings_usd: 0.09,
          usage_source: 'measured',
          savings_method: 'measured',
          task_type: 'delegation',
          latency_ms: 250,
          tokens_to_compliance: 165,
        }],
      }],
      rowCount: 1,
      dataFreshness: 'fresh' as const,
      latestEventAt: '2026-10-01T13:40:00Z',
      readAt: '2026-10-01T13:41:00Z',
    }];

    expect(rowsForLocalComponent(runs.components[0]!, snapshots)).toEqual([
      expect.objectContaining({
        session_id: 'session-42',
        model_name: 'local-model',
        counterfactual_baseline_usd: 0.1,
        usage_source: 'measured',
        tokens_to_compliance: 165,
      }),
    ]);
    expect(resolveLocalPageEmptyState(runs, snapshots)).toBeNull();
  });

  it('maps an empty delegation-savings sessions envelope to NO_RUNS_YET', () => {
    const runs = readPage('runs');
    const snapshots = [{
      topic: 'onex.snapshot.projection.delegation.savings.v1',
      rows: [{ tenant_id: 'tenant-a', sessions: [] }],
      rowCount: 1,
      dataFreshness: 'fresh' as const,
      latestEventAt: null,
      readAt: '2026-10-01T13:41:00Z',
    }];

    expect(rowsForLocalComponent(runs.components[0]!, snapshots)).toEqual([]);
    expect(resolveLocalPageEmptyState(runs, snapshots)).toBe('NO_RUNS_YET');
  });

  it('keeps unresolved sessions as Runs rows so the row can show the typed state', () => {
    const runs = readPage('runs');
    const snapshots = [{
      topic: 'onex.snapshot.projection.delegation.savings.v1',
      rows: [{ sessions: [{ session_id: 'unresolved', baseline_model: null, savings_usd: 0 }] }],
      rowCount: 1,
      dataFreshness: 'fresh' as const,
      latestEventAt: null,
      readAt: '2026-10-01T13:41:00Z',
    }];

    expect(resolveLocalPageEmptyState(runs, snapshots)).toBeNull();
  });

  it('reads Runs through ProtocolSnapshotSource using only the delegation-savings topic', async () => {
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

    expect(source.readSnapshot).toHaveBeenCalledOnce();
    expect(source.readSnapshot).toHaveBeenCalledWith('onex.snapshot.projection.delegation.savings.v1');
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

  it('Overview shows spend, savings and tokens from cost.savings-overview.v1', () => {
    const page = readPage('overview');
    const topics = page.components.flatMap((c) => (c.data_bindings ?? []).map((b) => b.projection_topic));
    expect(new Set(topics)).toEqual(new Set(['onex.snapshot.projection.cost.savings-overview.v1']));
    const keys = page.dashboard.widgets.map((w) => (w.config as Record<string, unknown>).metric_key);
    expect(keys).toEqual(['total_cost_usd', 'total_savings_usd', 'tokens_total']);
    const savings = page.components.find((c) => c.component_id === 'overview-savings');
    expect(savings?.data_bindings?.[0]?.required_fields).toEqual(['total_savings_usd', 'total_baseline_cost_usd']);
  });

  it('Overview never reads local_token_pct, a literal 0 the view does not measure', () => {
    for (const file of ['overview.page.yaml', 'overview.contracts.yaml']) {
      const raw = readFileSync(resolve(process.cwd(), `src/pages/local/${file}`), 'utf8');
      expect(raw.includes('local_token_pct'), file).toBe(false);
    }
  });
});
