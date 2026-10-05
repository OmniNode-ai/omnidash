// OMN-19980 AC2d: no page of the six shows a savings figure from any exposure other than metering-summary.v1.
// The dashboard-side twin of omnimarket's SQL savings guard; both name the one allowed source, metering-summary.v1.
//
// Failure modes (Amendment 1, Approach), each with a planted control below:
//   1  a binding asks a savings field of another exposure (delegation.savings.v1, cost.savings-overview.v1)   R1
//   2  the savings field is spelled differently (baseline cost, counterfactual, cloud cost, per-run average)  classifier
//   3  a widget shows a savings key its component does not read from metering-summary.v1, or reads nothing    R2
//   4  a per-run savings figure: a savings column on a decisions-row table, or any savings field asked of
//      the per-run delegation.savings.v1 sessions                                                              R3
//   5  savings read in page or loader code rather than through a contract (session.savings_usd, a sum)       R4
//   6  the instrument itself is broken: no pages, no bindings, no savings field seen in a known-bad page        instrument
//   7  cost mistaken for savings (total_cost_usd, local_cost_usd, cost_usd, measured_cost_usd)                false positives
//   9  a savings field read off the degraded savings-series.v1 or savings.v1 exposures                         R1
//  10  the API Keys tenant id read from delegation.savings.v1 is not a savings figure (field-level, not topic)  false positives
// (8, binding an exposure the lab does not serve, is pages.test.ts "names only served projection exposures".)
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import { createElement } from 'react';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import type { ModelComponentContract } from '../../shared/types/generated/onex-models';
import {
  METERING_SUMMARY_TOPIC,
  loadLocalPageConfig,
  type LocalPageDocument,
  type LocalPageName,
} from '../../layout/local-page-loader';
import { MetricCard, PendingState, type MetricCardConfig } from '../LocalDashboardPage';

/** The one exposure a savings figure may come from; omnimarket's guard names the same string. */
const ALLOWED_SAVINGS_SOURCE = 'metering-summary.v1';
const ALLOWED_TOPIC = `onex.snapshot.projection.${ALLOWED_SAVINGS_SOURCE}`;
const DECISIONS = 'onex.snapshot.projection.delegation.decisions.v1';
const DELEGATION_SAVINGS = 'onex.snapshot.projection.delegation.savings.v1';
const SAVINGS_OVERVIEW = 'onex.snapshot.projection.cost.savings-overview.v1';

// ---- Field classifier -------------------------------------------------------------------------------------------
/** A field name that looks like a savings figure, or an input that exists only to compute one. */
const SAVINGS_NAME = /saving|counterfactual|baseline_cost|cloud_cost/i;
/**
 * Savings fields classed on purpose. cloud_cost_usd, counterfactual_baseline_usd and total_baseline_cost_usd are
 * named cost but are the baseline model's price of the same tokens: savings = counterfactual - spend
 * (omnimarket 090_savings_aggregate_excludes_model_text.sql:136-141), so they come off with the savings figure.
 */
const SAVINGS_FIELDS: ReadonlySet<string> = new Set([
  'savings_usd',
  'total_savings_usd',
  'savings_per_measured_run_usd',
  'counterfactual_usd',
  'counterfactual_baseline_usd',
  'cloud_cost_usd',
  'total_baseline_cost_usd',
]);
/** Names the pattern matches that are labels, not dollars (Lakshman, 2026-10-05 ~10:58Z: keep the labels). */
const SAVINGS_LABELS: ReadonlySet<string> = new Set(['savings_method']);
/** Spend, not savings: AC2 covers savings only, and these must never trip the guard. */
const COST_FIELDS = ['total_cost_usd', 'local_cost_usd', 'cost_usd', 'measured_cost_usd'] as const;

/** Fails closed: a new spelling the pattern matches counts as savings until it is classed on purpose. */
function isSavingsField(name: string): boolean {
  return SAVINGS_FIELDS.has(name) || (SAVINGS_NAME.test(name) && !SAVINGS_LABELS.has(name));
}

// ---- Step A allowlist -------------------------------------------------------------------------------------------
/**
 * Time-boxed for Step A (Amendment 1, ruling 1 and open question 2): the Overview Savings total still reads
 * cost.savings-overview.v1 until Step B rebinds it to metering-summary.v1. Step B empties this list; until then
 * AC2 stays open. Asserted by name below, and an entry the tree no longer needs fails as stale.
 */
const STEP_A_ALLOWLIST: ReadonlyArray<{ binding_id: string; projection_topic: string; fields: readonly string[] }> = [
  { binding_id: 'overview-savings-snapshot', projection_topic: SAVINGS_OVERVIEW, fields: ['total_savings_usd', 'total_baseline_cost_usd'] },
];

type Binding = NonNullable<ModelComponentContract['data_bindings']>[number];

function allowlisted(binding: Binding, field: string): boolean {
  return STEP_A_ALLOWLIST.some((entry) => entry.binding_id === binding.binding_id
    && entry.projection_topic === binding.projection_topic && entry.fields.includes(field));
}

// ---- The six pages ----------------------------------------------------------------------------------------------
interface LoadedPage { name: string; doc: LocalPageDocument }

const PAGES_DIR = resolve(process.cwd(), 'src/pages/local');
/** The pages on disk, not a typed list: a seventh page is guarded the day it lands. */
const pageNames = readdirSync(PAGES_DIR).filter((file) => file.endsWith('.page.yaml')).map((file) => file.replace('.page.yaml', '')).sort();
const loadPages = (): LoadedPage[] => pageNames.map((name) => ({ name, doc: loadLocalPageConfig(name as LocalPageName) }));

interface WidgetKey { page: string; componentId: string; key: string }

function widgetKeys(page: LoadedPage): WidgetKey[] {
  return page.doc.dashboard.widgets.flatMap((widget) => {
    const config = (widget.config ?? {}) as { metric_key?: unknown; columns?: Array<{ key?: unknown }> };
    const keys = [
      ...(typeof config.metric_key === 'string' ? [config.metric_key] : []),
      ...(config.columns ?? []).map((column) => column.key).filter((key): key is string => typeof key === 'string'),
    ];
    return keys.map((key) => ({ page: page.name, componentId: String(widget.data_source), key }));
  });
}

function bindingsOf(page: LoadedPage): Array<{ component: ModelComponentContract; binding: Binding }> {
  return page.doc.components.flatMap((component) => (component.data_bindings ?? []).map((binding) => ({ component, binding })));
}

/** Every field name the six pages declare: binding fields, metric keys and table column keys. */
function fieldNames(pages: readonly LoadedPage[]): Set<string> {
  return new Set(pages.flatMap((page) => [
    ...bindingsOf(page).flatMap(({ binding }) => binding.required_fields ?? []),
    ...widgetKeys(page).map((entry) => entry.key),
  ]));
}

// ---- Rules: each a function from the pages to findings, so each can be removed and shown red --------------------
/** R1 binding: a savings field in a binding requires the binding to read metering-summary.v1. */
function ruleR1Binding(pages: readonly LoadedPage[]): string[] {
  const findings: string[] = [];
  for (const page of pages) {
    for (const { binding } of bindingsOf(page)) {
      for (const field of binding.required_fields ?? []) {
        if (!isSavingsField(field) || binding.projection_topic === ALLOWED_TOPIC || allowlisted(binding, field)) continue;
        findings.push(`R1 ${page.name}/${binding.binding_id}: ${field} from ${binding.projection_topic}`);
      }
    }
  }
  return findings;
}

/**
 * R2 widget: a savings metric key or column needs its component's first binding to read metering-summary.v1 and
 * list the key, or the component to bind nothing and wait typed (upstream-blocked).
 */
function ruleR2Widget(pages: readonly LoadedPage[]): string[] {
  const findings: string[] = [];
  for (const page of pages) {
    for (const { componentId, key } of widgetKeys(page)) {
      if (!isSavingsField(key)) continue;
      const component = page.doc.components.find((candidate) => candidate.component_id === componentId);
      const bindings = component?.data_bindings ?? [];
      const first = bindings[0];
      const lists = first !== undefined && (first.required_fields ?? []).includes(key);
      const fromMetering = lists && first.projection_topic === ALLOWED_TOPIC;
      const waits = component !== undefined && bindings.length === 0
        && JSON.stringify(component.supported_empty_state_reasons ?? []) === JSON.stringify(['upstream-blocked']);
      if (fromMetering || waits || (lists && allowlisted(first, key))) continue;
      findings.push(`R2 ${page.name}/${componentId}: shows ${key} from ${first?.projection_topic ?? 'no binding'}`);
    }
  }
  return findings;
}

/**
 * R3 per-run: no savings column on a table whose rows are decisions (one row per run), and no savings field asked of
 * the per-run delegation.savings.v1 sessions, whatever else the component binds.
 */
function ruleR3PerRun(pages: readonly LoadedPage[]): string[] {
  const findings: string[] = [];
  for (const page of pages) {
    for (const { componentId, key } of widgetKeys(page)) {
      const component = page.doc.components.find((candidate) => candidate.component_id === componentId);
      if (isSavingsField(key) && component?.data_bindings?.[0]?.projection_topic === DECISIONS) {
        findings.push(`R3 ${page.name}/${componentId}: per-run column ${key}`);
      }
    }
    for (const { binding } of bindingsOf(page)) {
      if (binding.projection_topic !== DELEGATION_SAVINGS) continue;
      for (const field of (binding.required_fields ?? []).filter(isSavingsField)) {
        findings.push(`R3 ${page.name}/${binding.binding_id}: per-run ${field} from ${DELEGATION_SAVINGS}`);
      }
    }
  }
  return findings;
}

/** R4: the only code that may read a savings field by name; nothing else computes or shows one. */
const R4_ALLOWED_OWNERS: ReadonlySet<string> = new Set(['SavingsPerRunCard']);
const SOURCE_FILES = ['src/pages/LocalDashboardPage.tsx', 'src/layout/local-page-loader.ts'] as const;
/** A data field name: lower snake case with at least one underscore (savings_usd), never prose or a constant. */
const FIELD_TOKEN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;

function ownerOf(node: ts.Node): string {
  let statement = node;
  while (statement.parent !== undefined && !ts.isSourceFile(statement.parent)) statement = statement.parent;
  if ((ts.isFunctionDeclaration(statement) || ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement))
    && statement.name) return statement.name.text;
  if (ts.isVariableStatement(statement)) {
    const name = statement.declarationList.declarations[0]?.name;
    if (name && ts.isIdentifier(name)) return name.text;
  }
  return ts.SyntaxKind[statement.kind];
}

/** R4 source scan: savings field names in code (identifiers and whole-name strings; comments and prose are not code). */
function ruleR4Source(files: ReadonlyArray<{ file: string; source: string }>): string[] {
  const findings: string[] = [];
  for (const { file, source } of files) {
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node: ts.Node) => {
      const token = ts.isIdentifier(node) || ts.isStringLiteralLike(node) ? node.text : null;
      if (token !== null && FIELD_TOKEN.test(token) && isSavingsField(token)) {
        const owner = ownerOf(node);
        if (!R4_ALLOWED_OWNERS.has(owner)) {
          const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
          findings.push(`R4 ${file}:${line} ${owner}: ${token}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
  }
  return findings;
}

const readSources = () => SOURCE_FILES.map((file) => ({ file, source: readFileSync(resolve(process.cwd(), file), 'utf8') }));

/** The instrument: all six pages loaded and at least one binding read, or nothing above proves anything. */
function instrumentProblems(pages: readonly LoadedPage[]): string[] {
  const problems: string[] = [];
  if (pages.length !== 6) problems.push(`expected the six local pages, loaded ${pages.length}`);
  if (pages.flatMap(bindingsOf).length === 0) problems.push('no binding read');
  return problems;
}

// ---- Planted pages ----------------------------------------------------------------------------------------------
function binding(binding_id: string, projection_topic: string, required_fields: string[]): Binding {
  return { binding_id, projection_topic, ordering_authority_field: 'captured_at', ordering_direction: 'descending', required_fields } as Binding;
}

function plantedComponent(
  component_id: string,
  data_bindings: Binding[],
  reasons: string[] = ['no-data'],
  kind: ModelComponentContract['component_kind'] = 'table',
): ModelComponentContract {
  return {
    component_id, component_kind: kind, title: component_id,
    contract_version: { major: 1, minor: 0, patch: 0 },
    data_bindings, supported_empty_state_reasons: reasons,
  } as ModelComponentContract;
}

/** A copy of the real pages with one planted page: components and the widgets that show them. */
function plant(components: ModelComponentContract[], widgets: Array<{ data_source: string; config: Record<string, unknown> }>): LoadedPage[] {
  const pages = loadPages().map((page) => structuredClone(page));
  const doc = structuredClone(pages[0]!.doc);
  doc.components = components;
  doc.dashboard.widgets = widgets.map((widget, index) => ({ widget_id: `planted-${index}`, title: widget.data_source, ...widget }));
  return [...pages, { name: 'planted', doc }];
}

const metric = (key: string) => ({ config_kind: 'metric_card', widget_type: 'metric_card', metric_key: key, label: key });
const table = (...keys: string[]) => ({ config_kind: 'table', widget_type: 'table', columns: keys.map((key) => ({ key, header: key })) });
const plantedOnly = (findings: string[]) => findings.filter((finding) => finding.includes(' planted/'));

// ---- Tests ------------------------------------------------------------------------------------------------------
describe('OMN-19980 AC2d: savings figures come from metering-summary.v1 only', () => {
  it('instrument: loads the six local pages and reads their bindings', () => {
    const pages = loadPages();
    expect(pageNames).toEqual(['api-keys', 'credentials', 'overview', 'runs', 'usage', 'workflow']);
    expect(instrumentProblems(pages)).toEqual([]);
    // The allowed topic is the loader's metering-summary topic, the one OMN-20009's card waits on.
    expect(ALLOWED_TOPIC).toBe(METERING_SUMMARY_TOPIC);
  });

  it('instrument: an empty or binding-free load is reported, never read as clean', () => {
    expect(instrumentProblems([])).toEqual(['expected the six local pages, loaded 0', 'no binding read']);
    const unbound = loadPages().map((page) => ({ ...page, doc: { ...page.doc, components: [] } }));
    expect(instrumentProblems(unbound)).toEqual(['no binding read']);
  });

  it('R1: every savings field in a binding reads metering-summary.v1', () => {
    const findings = ruleR1Binding(loadPages());
    expect(findings, findings.join('\n')).toEqual([]);
  });

  it('R2: every savings widget key is read from metering-summary.v1, or its card binds nothing and waits', () => {
    const findings = ruleR2Widget(loadPages());
    expect(findings, findings.join('\n')).toEqual([]);
  });

  it('R3: no page shows a per-run savings figure', () => {
    const findings = ruleR3PerRun(loadPages());
    expect(findings, findings.join('\n')).toEqual([]);
  });

  it('R4: page and loader code read no savings field outside SavingsPerRunCard', () => {
    const findings = ruleR4Source(readSources());
    expect(findings, findings.join('\n')).toEqual([]);
  });
});

describe('OMN-19980 AC2d: field classifier', () => {
  it('classes every pattern-matching field name on the six pages on purpose, and the list agrees with the pattern', () => {
    const names = [...fieldNames(loadPages())];
    expect(names.length).toBeGreaterThan(0);
    const unclassed = names.filter((name) => SAVINGS_NAME.test(name) && !SAVINGS_FIELDS.has(name) && !SAVINGS_LABELS.has(name));
    expect(unclassed, 'a new savings-like spelling must be added to SAVINGS_FIELDS or SAVINGS_LABELS').toEqual([]);
    for (const name of [...SAVINGS_FIELDS, ...SAVINGS_LABELS]) expect(SAVINGS_NAME.test(name), name).toBe(true);
  });

  it('a new spelling on a page is caught as unclassed and still counted as savings (fails closed)', () => {
    const pages = plant([plantedComponent('planted-avg', [binding('planted-avg', DELEGATION_SAVINGS, ['avg_saving_per_call_usd'])])], []);
    const unclassed = [...fieldNames(pages)].filter((name) => SAVINGS_NAME.test(name) && !SAVINGS_FIELDS.has(name) && !SAVINGS_LABELS.has(name));
    expect(unclassed).toEqual(['avg_saving_per_call_usd']);
    expect(isSavingsField('avg_saving_per_call_usd')).toBe(true);
  });

  it('classes the other spellings of a savings figure as savings', () => {
    for (const name of ['total_baseline_cost_usd', 'counterfactual_baseline_usd', 'cloud_cost_usd', 'savings_per_measured_run_usd', 'counterfactual_usd']) {
      expect(isSavingsField(name), name).toBe(true);
    }
  });

  it('false positives: cost, the savings method label and the tenant id are not savings, on any exposure', () => {
    for (const name of [...COST_FIELDS, 'savings_method', 'baseline_model', 'pricing_manifest_version', 'tenant_id', 'cost', 'cost_tier_name']) {
      expect(isSavingsField(name), name).toBe(false);
    }
    const pages = plant([
      plantedComponent('planted-cost-runs', [
        binding('planted-cost-decisions', DECISIONS, ['correlation_id', 'cost_tier_name']),
        binding('planted-cost-sessions', DELEGATION_SAVINGS, ['sessions', 'session_id', 'local_cost_usd', 'savings_method', 'baseline_model']),
      ]),
      plantedComponent('planted-cost-total', [binding('planted-cost-total', SAVINGS_OVERVIEW, ['total_cost_usd'])], ['no-data'], 'metric_card'),
      plantedComponent('planted-cost-usage', [binding('planted-cost-usage', 'onex.snapshot.projection.usage-by-model-day.v1', ['cost_usd', 'measured_cost_usd'])]),
      plantedComponent('planted-tenant', [binding('planted-tenant', DELEGATION_SAVINGS, ['tenant_id'])]),
    ], [
      { data_source: 'planted-cost-runs', config: table('local_cost_usd', 'savings_method', 'baseline_model') },
      { data_source: 'planted-cost-total', config: metric('total_cost_usd') },
      { data_source: 'planted-cost-usage', config: table('cost_usd', 'measured_cost_usd') },
    ]);
    expect(plantedOnly([...ruleR1Binding(pages), ...ruleR2Widget(pages), ...ruleR3PerRun(pages)])).toEqual([]);
  });
});

describe('OMN-19980 AC2d: planted controls (each rule catches its violation)', () => {
  it('known-bad page: the classifier sees its savings fields (the instrument can see a violation at all)', () => {
    const pages = plant([plantedComponent('planted-bad', [binding('planted-bad', DELEGATION_SAVINGS, ['savings_usd'])])], []);
    expect([...fieldNames(pages)].filter(isSavingsField)).toContain('savings_usd');
  });

  it('R1 catches savings asked of delegation.savings.v1, cost.savings-overview.v1 and the degraded savings exposures', () => {
    const pages = plant([
      plantedComponent('planted-r1', [
        binding('planted-r1-sessions', DELEGATION_SAVINGS, ['sessions', 'savings_usd']),
        binding('planted-r1-total', SAVINGS_OVERVIEW, ['total_savings_usd']),
        binding('planted-r1-series', 'onex.snapshot.projection.delegation.savings-series.v1', ['savings_usd']),
        binding('planted-r1-legacy', 'onex.snapshot.projection.savings.v1', ['counterfactual_baseline_usd']),
        binding('planted-r1-metering', ALLOWED_TOPIC, ['savings_usd', 'counterfactual_usd']),
      ]),
    ], []);
    expect(plantedOnly(ruleR1Binding(pages))).toEqual([
      `R1 planted/planted-r1-sessions: savings_usd from ${DELEGATION_SAVINGS}`,
      `R1 planted/planted-r1-total: total_savings_usd from ${SAVINGS_OVERVIEW}`,
      'R1 planted/planted-r1-series: savings_usd from onex.snapshot.projection.delegation.savings-series.v1',
      'R1 planted/planted-r1-legacy: counterfactual_baseline_usd from onex.snapshot.projection.savings.v1',
    ]);
  });

  it('R1: the Step A allowlist exempts only its own binding id on its own exposure', () => {
    const pages = plant([
      plantedComponent('planted-r1-allow', [
        binding('overview-savings-snapshot', DELEGATION_SAVINGS, ['total_savings_usd']),
        binding('planted-other-id', SAVINGS_OVERVIEW, ['total_baseline_cost_usd']),
      ]),
    ], []);
    expect(plantedOnly(ruleR1Binding(pages))).toEqual([
      `R1 planted/overview-savings-snapshot: total_savings_usd from ${DELEGATION_SAVINGS}`,
      `R1 planted/planted-other-id: total_baseline_cost_usd from ${SAVINGS_OVERVIEW}`,
    ]);
  });

  it('R2 catches a savings key its card does not read from metering-summary.v1, or reads from nothing', () => {
    const pages = plant([
      plantedComponent('planted-r2-unlisted', [binding('planted-r2-unlisted', ALLOWED_TOPIC, ['runs_total'])], ['no-data'], 'metric_card'),
      plantedComponent('planted-r2-unbound', [], ['no-data'], 'metric_card'),
      plantedComponent('planted-r2-waits', [], ['upstream-blocked'], 'metric_card'),
      plantedComponent('planted-r2-served', [binding('planted-r2-served', ALLOWED_TOPIC, ['savings_usd'])], ['no-data'], 'metric_card'),
    ], [
      { data_source: 'planted-r2-unlisted', config: metric('savings_usd') },
      { data_source: 'planted-r2-unbound', config: metric('savings_per_measured_run_usd') },
      { data_source: 'planted-r2-orphan', config: table('savings_usd') },
      { data_source: 'planted-r2-waits', config: metric('savings_per_measured_run_usd') },
      { data_source: 'planted-r2-served', config: metric('savings_usd') },
    ]);
    expect(plantedOnly(ruleR2Widget(pages))).toEqual([
      `R2 planted/planted-r2-unlisted: shows savings_usd from ${ALLOWED_TOPIC}`,
      'R2 planted/planted-r2-unbound: shows savings_per_measured_run_usd from no binding',
      'R2 planted/planted-r2-orphan: shows savings_usd from no binding',
    ]);
  });

  it('R3 catches a per-run savings column and a savings field asked of the delegation.savings.v1 sessions', () => {
    const pages = plant([
      plantedComponent('planted-r3', [
        binding('planted-r3-decisions', DECISIONS, ['correlation_id']),
        binding('planted-r3-sessions', DELEGATION_SAVINGS, ['sessions', 'session_id', 'local_cost_usd', 'cloud_cost_usd']),
      ]),
    ], [{ data_source: 'planted-r3', config: table('correlation_id', 'local_cost_usd', 'savings_usd') }]);
    expect(plantedOnly(ruleR3PerRun(pages))).toEqual([
      'R3 planted/planted-r3: per-run column savings_usd',
      `R3 planted/planted-r3-sessions: per-run cloud_cost_usd from ${DELEGATION_SAVINGS}`,
    ]);
  });

  it('R4 catches savings read in code outside SavingsPerRunCard, and ignores comments and prose', () => {
    const source = [
      '// session.savings_usd in a comment is not a read',
      'export function SavingsPerRunCard({ row }: { row: Record<string, unknown> }) { return row.savings_per_measured_run_usd; }',
      'function RecentRunsTable({ session }: { session: Record<string, number> }) { return session.savings_usd; }',
      "const baselineOf = (session: Record<string, number>) => session['counterfactual_baseline_usd'] - session.local_cost_usd;",
      "const PENDING = 'Not served yet: waits on savings_per_measured_run_usd in metering-summary.v1';",
    ].join('\n');
    expect(ruleR4Source([{ file: 'planted.tsx', source }])).toEqual([
      'R4 planted.tsx:3 RecentRunsTable: savings_usd',
      'R4 planted.tsx:4 baselineOf: counterfactual_baseline_usd',
    ]);
  });

  it('R4 reads both source files, and the scan can see a savings name in them (positive control)', () => {
    const sources = readSources();
    expect(sources.map(({ file }) => file)).toEqual([...SOURCE_FILES]);
    // SavingsPerRunCard reads savings_per_measured_run_usd: allowed, but proof the scanner finds real tokens.
    const withoutAllowance = sources.map(({ file, source }) => ({ file, source: source.replace(/function SavingsPerRunCard\b/, 'function PlantedCard') }));
    expect(ruleR4Source(withoutAllowance).some((finding) => finding.endsWith('PlantedCard: savings_per_measured_run_usd'))).toBe(true);
  });
});

describe('OMN-19980 Step A allowlist (time-boxed; Step B empties it)', () => {
  it('names exactly the Overview Savings total binding and its two fields', () => {
    expect(STEP_A_ALLOWLIST).toEqual([
      { binding_id: 'overview-savings-snapshot', projection_topic: SAVINGS_OVERVIEW, fields: ['total_savings_usd', 'total_baseline_cost_usd'] },
    ]);
    expect([...R4_ALLOWED_OWNERS]).toEqual(['SavingsPerRunCard']);
  });

  it('every allowlisted field is still bound where the entry says (a stale entry fails)', () => {
    const bound = loadPages().flatMap(bindingsOf).map(({ binding: b }) => b);
    for (const entry of STEP_A_ALLOWLIST) {
      const match = bound.find((b) => b.binding_id === entry.binding_id && b.projection_topic === entry.projection_topic);
      expect(match, entry.binding_id).toBeDefined();
      for (const field of entry.fields) expect(match?.required_fields, `${entry.binding_id} ${field}`).toContain(field);
    }
  });
});

describe('OMN-19980 AC2c: a savings card with no served source says what it waits on', () => {
  /** The savings cards the pages show with no binding: the text each renders, by the page's own renderer. */
  function unboundSavingsTexts(pages: readonly LoadedPage[]): Array<{ id: string; text: string }> {
    const out: Array<{ id: string; text: string }> = [];
    for (const page of pages) {
      for (const component of page.doc.components) {
        if ((component.data_bindings ?? []).length > 0) continue;
        const keys = widgetKeys(page).filter((entry) => entry.componentId === component.component_id).map((entry) => entry.key);
        if (!keys.some(isSavingsField)) continue;
        const widget = page.doc.dashboard.widgets.find((candidate) => candidate.data_source === component.component_id);
        const view = component.component_kind === 'metric_card'
          ? render(createElement(MetricCard, { component, config: widget?.config as unknown as MetricCardConfig, row: {} }))
          : render(createElement(PendingState, { componentId: component.component_id }));
        out.push({ id: component.component_id, text: view.container.textContent ?? '' });
        view.unmount();
      }
    }
    return out;
  }

  it('every unbound savings card names metering-summary.v1 and shows no figure', () => {
    const texts = unboundSavingsTexts(loadPages());
    expect(texts.length).toBeGreaterThan(0);
    for (const { id, text } of texts) {
      expect(text, id).toBe(`Not served yet: waits on ${ALLOWED_SAVINGS_SOURCE}`);
    }
  });

  it('planted: an unbound savings card with no named source is caught', () => {
    const pages = plant([plantedComponent('planted-unnamed-savings', [], ['upstream-blocked'], 'metric_card')],
      [{ data_source: 'planted-unnamed-savings', config: metric('savings_usd') }]);
    const planted = unboundSavingsTexts(pages).find((entry) => entry.id === 'planted-unnamed-savings');
    expect(planted?.text).toBe('Not served yet: waits on its exposure');
  });
});
