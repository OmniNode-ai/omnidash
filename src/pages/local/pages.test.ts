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
  resolveLocalPageEmptyState,
  type LocalPageDocument,
} from '../../layout/local-page-loader';

const pages = ['overview', 'runs'] as const;
const servedExposureCatalogue = new Set([
  'onex.snapshot.projection.baselines.roi.v1',
  'onex.snapshot.projection.swarm.runs.v1',
]);
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

  it.each(pages)('%s does not name a topic served by hand-written SQL', async (pageName) => {
    const page = await readPage(pageName);
    const sqlReader = readFileSync(resolve(process.cwd(), 'server/sqlite-projection-reader.ts'), 'utf8');
    const sqlTopics = new Set(
      [...sqlReader.matchAll(/case\s+'(onex\.snapshot\.projection\.[^']+)'\s*:/g)].map((match) => match[1]),
    );

    for (const component of page.components) {
      for (const binding of component.data_bindings ?? []) {
        expect(sqlTopics.has(binding.projection_topic)).toBe(false);
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
});
