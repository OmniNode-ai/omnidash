// 2026-10-19 user override: Overview headlines use the restored legacy all-time aggregate.
// All other metering/per-run source boundaries and their negative controls remain enforced.
// OMN-19980 AC2d: no page of the six shows a savings figure from any exposure other than metering-summary.v1.
// The dashboard-side twin of omnimarket's SQL savings guard; both name the one allowed source, metering-summary.v1.
//
// Failure modes (Amendment 1, Approach), each with a planted control below:
//   1  a binding asks a savings field of another exposure (delegation.savings.v1, cost.savings-overview.v1)   R1
//   2  the savings field is spelled differently (baseline cost, counterfactual, cloud cost, per-run average)  classifier
//   3  a widget shows a savings key its component does not read from metering-summary.v1, or reads nothing    R2
//   4  a per-run savings figure: a savings column on a decisions-row table, or any savings field asked of
//      the per-run delegation.savings.v1 sessions                                                              R3
//   5  savings read in page, loader or page-mounted dashboard module code rather than through a contract     R4
//      (session.savings_usd, a sum); an allowed read names its file, owner and metering-bound component
//   6  the instrument itself is broken: no pages, no bindings, no savings field seen in a known-bad page        instrument
//   7  cost mistaken for savings (total_cost_usd, local_cost_usd, cost_usd, measured_cost_usd)                false positives
//   9  a savings field read off the degraded savings-series.v1 or savings.v1 exposures                         R1
//  10  the API Keys tenant id read from delegation.savings.v1 is not a savings figure (field-level, not topic)  false positives
// (8, binding an exposure the lab does not serve, is pages.test.ts "names only served projection exposures".)
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { posix, resolve } from 'node:path';
import { render } from '@testing-library/react';
import { createElement } from 'react';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import type { ModelComponentContract } from '@/shared/types/generated/onex-models';
import {
  METERING_SUMMARY_TOPIC,
  loadLocalPageConfig,
  type LocalPageDocument,
  type LocalPageName,
} from '@/layout/local-page-loader';
import { MetricCard, PENDING_SOURCES, PendingState, type MetricCardConfig } from '@/pages/LocalDashboardPage';

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
  // OMN-20008 AC5: savings_usd / counterfactual_usd, served by metering-summary.v1 (a ratio, but of the savings figure).
  'savings_pct_of_counterfactual',
  // OMN-21015 AC3: one run's modelled saving, served per run on delegation.decisions.v1 (the PER_RUN_SAVING exception).
  'modelled_savings_usd',
]);
/**
 * Names the pattern matches that are labels, not dollars (Lakshman, 2026-10-05 ~10:58Z: keep the labels). The three
 * savings_* labels describe the per-run figure: the baseline it was priced against, the price list and whether the run
 * was measured (Jonah, OMN-21015, 2026-10-14T04:50Z: "its labels classed as labels").
 */
const SAVINGS_LABELS: ReadonlySet<string> = new Set([
  'savings_method', 'savings_baseline_model', 'savings_pricing_manifest_version', 'savings_measurement',
]);

/**
 * The one per-run exception (Jonah, OMN-21015: 2026-10-13T06:59Z "serve one per-run savings figure from the metering
 * compute on delegation.decisions.v1 ... and amend R3 to allow exactly that one served field"; 2026-10-14T04:50Z
 * "amending R3 does mean the same one-field exception in R1, R3 and R4"). Exactly this field, from exactly this
 * exposure, in exactly this binding of this component. Anything else stays refused by every rule.
 */
const PER_RUN_SAVING = { componentId: 'recent-runs', bindingId: 'runs-decisions', topic: DECISIONS, field: 'modelled_savings_usd' } as const;

function isPerRunSaving(componentId: string, bindingId: string | undefined, topic: string | undefined, field: string): boolean {
  return componentId === PER_RUN_SAVING.componentId && field === PER_RUN_SAVING.field && topic === PER_RUN_SAVING.topic
    && (bindingId === undefined || bindingId === PER_RUN_SAVING.bindingId);
}
/** Spend, not savings: AC2 covers savings only, and these must never trip the guard. */
const COST_FIELDS = ['total_cost_usd', 'local_cost_usd', 'cost_usd', 'measured_cost_usd'] as const;

/** Fails closed: a new spelling the pattern matches counts as savings until it is classed on purpose. */
function isSavingsField(name: string): boolean {
  return SAVINGS_FIELDS.has(name) || (SAVINGS_NAME.test(name) && !SAVINGS_LABELS.has(name));
}

// ---- Step A allowlist, emptied by Step B -------------------------------------------------------------------------
/**
 * Step A (Amendment 1, ruling 1 and open question 2) let the Overview Savings total read cost.savings-overview.v1
 * through one named entry here. Step B rebinds it to metering-summary.v1's all-time row, so the list is empty and
 * asserted empty below: no savings figure on the six pages is exempt from R1 and R2 any more.
 */
// Lakshman 2026-10-19: restore Overview to its populated old aggregate; no other page/source is exempt.
const OVERVIEW_RESTORE_ALLOWLIST: ReadonlyArray<{ component_id: string; binding_id: string; projection_topic: string; fields: readonly string[] }> = [
  { component_id: 'overview-savings', binding_id: 'overview-savings-legacy', projection_topic: SAVINGS_OVERVIEW, fields: ['total_savings_usd'] },
];

type Binding = NonNullable<ModelComponentContract['data_bindings']>[number];

function allowlisted(binding: Binding, field: string, componentId: string): boolean {
  return OVERVIEW_RESTORE_ALLOWLIST.some((entry) => entry.component_id === componentId && entry.binding_id === binding.binding_id
    && entry.projection_topic === binding.projection_topic && entry.fields.includes(field));
}

// ---- The six pages ----------------------------------------------------------------------------------------------
interface LoadedPage { name: string; doc: LocalPageDocument }

const PAGES_DIR = resolve(process.cwd(), 'src/pages/local');
/** The pages on disk, not a typed list: a seventh page is guarded the day it lands. */
const pageNames = readdirSync(PAGES_DIR).filter((file) => !file.startsWith('.') && file.endsWith('.page.yaml')).map((file) => file.replace('.page.yaml', '')).sort();
const loadPages = (): LoadedPage[] => pageNames.map((name) => ({ name, doc: loadLocalPageConfig(name as LocalPageName) }));

interface WidgetKey { page: string; componentId: string; key: string }

function widgetKeys(page: LoadedPage): WidgetKey[] {
  return page.doc.dashboard.widgets.flatMap((widget) => {
    const config = (widget.config ?? {}) as { config_kind?: unknown; metric_key?: unknown; columns?: unknown };
    let keys: string[];
    switch (config.config_kind) {
      case 'metric_card':
        if (typeof config.metric_key !== 'string') throw new TypeError('metric_card metric_key must be a string');
        keys = [config.metric_key];
        break;
      case 'table':
        if (!Array.isArray(config.columns)) throw new TypeError('table columns must be an array');
        keys = config.columns.map((column: unknown) => {
          if (typeof column !== 'object' || column === null || !('key' in column) || typeof column.key !== 'string') {
            throw new TypeError('table column key must be a string');
          }
          return column.key;
        });
        break;
      case 'status_grid':
        if (typeof config.columns !== 'number' || !Number.isInteger(config.columns) || config.columns < 1) {
          throw new TypeError('status_grid columns must be a positive layout count');
        }
        keys = []; // Layout count; field identities remain scanned through the component's required_fields.
        break;
      default:
        throw new TypeError(`Unsupported widget configuration: ${String(config.config_kind)}`);
    }
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
    for (const { component, binding } of bindingsOf(page)) {
      for (const field of binding.required_fields ?? []) {
        if (!isSavingsField(field) || binding.projection_topic === ALLOWED_TOPIC || allowlisted(binding, field, component.component_id)) continue;
        if (isPerRunSaving(component.component_id, binding.binding_id, binding.projection_topic, field)) continue;
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
      if (fromMetering || waits || (lists && allowlisted(first, key, componentId))) continue;
      if (lists && isPerRunSaving(componentId, first.binding_id, first.projection_topic, key)) continue;
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
      const first = component?.data_bindings?.[0];
      if (first !== undefined && (first.required_fields ?? []).includes(key)
        && isPerRunSaving(componentId, first.binding_id, first.projection_topic, key)) continue;
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

/**
 * R4: the only code that may read a savings field by name; nothing else computes or shows one. It scans the page, the
 * loader and every repository source file reachable from the page's imports, transitively: a component the page
 * mounts, and any helper it imports from anywhere in src/ or shared/, is page code too (Codex's #358 reviews, 2026-10-06). An allowed read names its file, its owner,
 * the exact fields it may read and the component whose bound rows it reads. Step B proves each allowed field is a
 * required field of that component's binding and the component binds metering-summary.v1 and nothing else.
 * A 'pending' allowance (OMN-20009's Avg saving / call card was one, omnidash#359) is a read whose exposure is not served
 * yet: it is valid only while its component binds nothing, and it fails the moment a binding appears, so the entry
 * must then become 'bound' and pass the binding check above.
 */
type R4Allowance = {
  file: string; owner: string; fields: readonly string[]; componentId: string; pageName?: string; state: 'bound' | 'pending' | 'compatibility';
};
const R4_ALLOWED: readonly R4Allowance[] = [
  // US-3 (OMN-20006): the Usage savings series renders the day rows of its one binding, metering-summary.v1, as
  // served: the row type names savings_usd, and savings() formats it or says why there is none. It sums nothing.
  { file: 'src/components/dashboard/usage/SavingsSeriesWidget.tsx', owner: 'MeteringSummaryRow', fields: ['savings_usd'], componentId: 'usage-savings-series', state: 'bound' },
  { file: 'src/components/dashboard/usage/SavingsSeriesWidget.tsx', owner: 'savings', fields: ['savings_usd'], componentId: 'usage-savings-series', state: 'bound' },
  // OMN-20009 (omnidash#359): the Avg saving / call card reads the served per-run quotient, a column rather than a
  // metric key. Pending until the captured lab catalogue served the column (the lab recapture of 2026-10-07, after
  // metering_summary 0002 reached the lab); its card now binds metering-summary.v1 with the field required.
  { file: 'src/pages/LocalDashboardPage.tsx', owner: 'SavingsPerRunCard', fields: ['savings_per_measured_run_usd'], componentId: 'overview-avg-saving-per-call', pageName: 'overview', state: 'bound' },
  // OMN-20008 AC5 (Jonah's decision, 4f0e618d): the Savings card's percentage line reads the served ratio from the
  // same all-time row as its figure and formats it; it divides nothing and reads no other savings field.
  { file: 'src/pages/LocalDashboardPage.tsx', owner: 'MeteringTotalCard', fields: ['savings_pct_of_counterfactual'], componentId: 'overview-savings', state: 'compatibility' },
  // OMN-21015 AC3 (the PER_RUN_SAVING exception): the Runs table's cell formats one run's served modelled saving and
  // names its baseline; it sums nothing and reads no other savings field.
  { file: 'src/pages/LocalDashboardPage.tsx', owner: 'runModelledCell', fields: ['modelled_savings_usd'], componentId: 'recent-runs', state: 'bound' },
  // OMN-21166 AC26: this renderer receives the rows of the Overview's separately declared, meter-only daily-spend
  // binding. The activity analysis does not read savings from decision rows or switch source after a failed read.
  { file: 'src/pages/local/insight-aggregates.ts', owner: 'aggregateMeteringWindow', fields: ['savings_usd', 'counterfactual_usd'], componentId: 'overview-spend-by-day', pageName: 'overview', state: 'bound' },
  // OMN-21166 AC66: Usage's savings panel (bound to metering-summary.v1 with savings_usd required) lists the runtime's
  // own per-model breakdown of its all-time row, summary_json.by_model, as served; it sums nothing.
  { file: 'src/pages/LocalDashboardPage.tsx', owner: 'SavingsByModel', fields: ['savings_usd'], componentId: 'usage-savings-series', pageName: 'usage', state: 'bound' },
];
const PAGE_FILE = 'src/pages/LocalDashboardPage.tsx';
/** Imports of these assets carry no code, so they are not scanned (the page imports its stylesheet). */
const ASSET_IMPORT = /\.(css|svg|png|json)$/;

/**
 * A module specifier as a repo-relative file: `@/x` is `src/x`, `@shared/x` is `shared/x`, `./x` is beside the
 * importer; null for a package (react, vitest) or an asset import.
 */
function resolveImport(importer: string, spec: string, exists: (file: string) => boolean): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = `src/${spec.slice(2)}`;
  else if (spec.startsWith('@shared/')) base = `shared/${spec.slice('@shared/'.length)}`;
  else if (spec.startsWith('./') || spec.startsWith('../')) base = posix.normalize(posix.join(posix.dirname(importer), spec));
  else return null;
  if (ASSET_IMPORT.test(base)) return null;
  // A specifier that resolves to no file is kept as written, so reading it fails and the scan cannot skip it.
  return ['', '.tsx', '.ts', '/index.tsx', '/index.ts'].map((ext) => `${base}${ext}`).find((file) => /\.tsx?$/.test(file) && exists(file)) ?? base;
}

/**
 * Every module a file names: import and re-export declarations, `import x = require('y')`, and anywhere in the file a
 * dynamic `import('y')` or `require('y')`. A dynamic import or require whose argument is not a string literal cannot be
 * followed, so it throws: the scan fails rather than miss what it loads (Codex's fourth #358 review).
 */
function moduleSpecifiers(file: string, tree: ts.SourceFile): string[] {
  const specs: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      specs.push(node.moduleSpecifier.text);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)
      && ts.isStringLiteral(node.moduleReference.expression)) {
      specs.push(node.moduleReference.expression.text);
    } else if (ts.isCallExpression(node)
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      const arg = node.arguments[0];
      if (arg === undefined || !ts.isStringLiteralLike(arg)) {
        const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
        throw new Error(`${file}:${line}: a dynamic import or require with a non-literal argument cannot be scanned`);
      }
      specs.push(arg.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return specs;
}

/** Every repository source file reachable from `root` through any module reference, in discovery order. */
function dashboardModuleClosure(root: string, read: (file: string) => string, exists: (file: string) => boolean): string[] {
  const seen: string[] = [];
  const queue = [root];
  while (queue.length > 0) {
    const file = queue.shift()!;
    const tree = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    for (const spec of moduleSpecifiers(file, tree)) {
      const target = resolveImport(file, spec, exists);
      if (target === null || target === root || seen.includes(target)) continue;
      seen.push(target);
      queue.push(target);
    }
  }
  return seen;
}
const readRepoFile = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');
const repoFileExists = (file: string) => existsSync(resolve(process.cwd(), file));
const SOURCE_FILES: readonly string[] = [PAGE_FILE, ...dashboardModuleClosure(PAGE_FILE, readRepoFile, repoFileExists)];

/**
 * Why an R4 allowance would be wrong, or nothing: a field it allows that is stale (no read of that field by that owner
 * in that file when unallowed) or is not a required field of the component's binding; a component that is missing or
 * duplicated, binds nothing, or binds any exposure other than metering-summary.v1.
 */
function r4AllowanceProblems(pages: readonly LoadedPage[], unallowedFindings: readonly string[], allowed: readonly R4Allowance[]): string[] {
  const problems: string[] = [];
  for (const entry of allowed) {
    const id = `${entry.file} ${entry.owner}`;
    if (entry.fields.length === 0) problems.push(`${id}: allows no field`);
    const components = pages.filter(page => entry.pageName === undefined || page.name === entry.pageName).flatMap((page) => page.doc.components).filter((c) => c.component_id === entry.componentId);
    const required = new Set(components.flatMap((c) => (c.data_bindings ?? []).flatMap((b) => b.required_fields ?? [])));
    for (const field of entry.fields) {
      const read = unallowedFindings.some((finding) => finding.startsWith(`R4 ${entry.file}:`) && finding.includes(` ${entry.owner}: `)
        && (finding.endsWith(`: ${field}`) || finding.endsWith(`(${field})`)));
      if (!read) problems.push(`${id}: stale, no read of ${field} by this owner`);
      if (entry.state === 'bound' && components.length === 1 && !required.has(field)) {
        problems.push(`${id}: ${field} is not a required field of ${entry.componentId}'s binding`);
      }
    }
    if (components.length !== 1) { problems.push(`${id}: component ${entry.componentId} found ${components.length} times`); continue; }
    const topics = (components[0]!.data_bindings ?? []).map((b) => b.projection_topic);
    // Keep the old pure metering formatter covered by its direct tests, without claiming Overview mounts it.
    if (entry.state === 'compatibility') {
      if (entry.file !== PAGE_FILE || entry.owner !== 'MeteringTotalCard' || entry.componentId !== 'overview-savings'
        || JSON.stringify(entry.fields) !== JSON.stringify(['savings_pct_of_counterfactual'])
        || JSON.stringify(topics) !== JSON.stringify([SAVINGS_OVERVIEW])) problems.push(`${id}: invalid compatibility formatter`);
      continue;
    }
    if (entry.state === 'pending') {
      if (topics.length > 0) problems.push(`${id}: pending, but ${entry.componentId} now binds ${topics.join(', ')}; make it bound`);
      continue;
    }
    if (topics.length === 0) problems.push(`${id}: ${entry.componentId} binds nothing`);
    // The per-run exception: its one field must be required by the exception's own binding on decisions.v1; the
    // component's other binding (the delegation.savings.v1 cost lookup) asks no savings field, which R3 checks.
    if (entry.fields.every((field) => (components[0]!.data_bindings ?? []).some((b) => (b.required_fields ?? []).includes(field)
      && isPerRunSaving(entry.componentId, b.binding_id, b.projection_topic, field)))) continue;
    for (const topic of topics) if (topic !== ALLOWED_TOPIC) problems.push(`${id}: ${entry.componentId} binds ${topic}`);
  }
  return problems;
}
/** A data field name: lower snake case with at least one underscore (savings_usd), never prose or a constant. */
const FIELD_TOKEN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;
/** The same name in camelCase or PascalCase, two words at least (savingsUsd, SavingsPerRunUsd); never one word. */
const CAMEL_TOKEN = /^[A-Za-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+$/;

/**
 * The field name a code token spells, or null: lower snake as is, camelCase and PascalCase folded to lower snake
 * (savingsUsd and SavingsUsd are savings_usd). SCREAMING_SNAKE constants, single words and prose stay out.
 */
function fieldNameOf(token: string): string | null {
  if (FIELD_TOKEN.test(token)) return token;
  if (CAMEL_TOKEN.test(token)) return token.replace(/[A-Z]/g, (c, i: number) => `${i === 0 ? '' : '_'}${c.toLowerCase()}`);
  return null;
}

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

/** A function, class, interface or type's own name: it names code, it reads no field (SavingsPerRunCard). */
function isDeclarationName(node: ts.Node): boolean {
  const parent = node.parent;
  return parent !== undefined && (ts.isFunctionDeclaration(parent) || ts.isClassDeclaration(parent)
    || ts.isInterfaceDeclaration(parent) || ts.isTypeAliasDeclaration(parent)) && parent.name === node;
}

/**
 * The key of a property whose value is an ONEX topic string names that exposure (`delegationSavings:
 * 'onex.snapshot.projection.delegation.savings.v1'` in shared/types/topics.ts); it reads no figure. Reading the key
 * elsewhere (TOPICS.delegationSavings) is still a property access and is still reported.
 */
function namesAnExposure(node: ts.Node): boolean {
  const parent = node.parent;
  return parent !== undefined && ts.isPropertyAssignment(parent) && parent.name === node
    && ts.isStringLiteralLike(parent.initializer) && /^onex\.(snapshot|evt|cmd)\./.test(parent.initializer.text);
}

/** A JSX tag's name (<SavingsPerRunCard />) refers to a component, it reads no field. */
function isJsxTagName(node: ts.Node): boolean {
  const parent = node.parent;
  return parent !== undefined && (ts.isJsxOpeningElement(parent) || ts.isJsxSelfClosingElement(parent) || ts.isJsxClosingElement(parent))
    && parent.tagName === node;
}

/** R4 source scan: savings field names in code (identifiers and whole-name strings; comments and prose are not code). */
function ruleR4Source(files: ReadonlyArray<{ file: string; source: string }>, allowed: readonly R4Allowance[] = R4_ALLOWED): string[] {
  const findings: string[] = [];
  for (const { file, source } of files) {
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node: ts.Node) => {
      const token = ts.isIdentifier(node) || ts.isStringLiteralLike(node) ? node.text : null;
      const field = token === null || isDeclarationName(node) || namesAnExposure(node) || isJsxTagName(node) ? null : fieldNameOf(token);
      if (field !== null && isSavingsField(field)) {
        const owner = ownerOf(node);
        if (!allowed.some((entry) => entry.file === file && entry.owner === owner && entry.fields.includes(field))) {
          const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
          findings.push(`R4 ${file}:${line} ${owner}: ${token}${field === token ? '' : ` (${field})`}`);
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

describe('Widget field classifier configuration boundaries (OMN-19988)', () => {
  it('treats status_grid columns as layout rather than field keys', () => {
    const pages = plant([], [{ data_source: 'environment-control', config: { config_kind: 'status_grid', widget_type: 'status_grid', columns: 3 } }]);
    expect(widgetKeys(pages.at(-1)!)).toEqual([]);
  });

  it('refuses a table with numeric columns rather than treating it as a status grid', () => {
    const pages = plant([], [{ data_source: 'malformed-table-control', config: { config_kind: 'table', widget_type: 'table', columns: 3 } }]);
    expect(() => widgetKeys(pages.at(-1)!)).toThrow(/table columns must be an array/);
  });
});
const plantedOnly = (findings: string[]) => findings.filter((finding) => finding.includes(' planted/'));

// ---- Tests ------------------------------------------------------------------------------------------------------
describe('OMN-19980 AC2d: savings figures come from metering-summary.v1 only', () => {
  it('instrument: loads the six local pages and reads their bindings', () => {
    const pages = loadPages();
    expect(pageNames).toEqual(['api-keys', 'credentials', 'overview', 'runs', 'usage', 'workflow']);
    expect(instrumentProblems(pages)).toEqual([]);
    // The allowed topic is the loader's metering-summary topic, the one Overview's headline cards read.
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

  it('R4: page and loader code read no savings field by name', () => {
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

  it('R1 and R2 catch the old Step A Overview Savings binding: nothing is exempt after Step B', () => {
    const pages = plant([
      plantedComponent('planted-step-a', [
        binding('overview-savings-snapshot', SAVINGS_OVERVIEW, ['total_savings_usd', 'total_baseline_cost_usd']),
      ], ['missing-field', 'no-data'], 'metric_card'),
    ], [{ data_source: 'planted-step-a', config: metric('total_savings_usd') }]);
    expect(plantedOnly(ruleR1Binding(pages))).toEqual([
      `R1 planted/overview-savings-snapshot: total_savings_usd from ${SAVINGS_OVERVIEW}`,
      `R1 planted/overview-savings-snapshot: total_baseline_cost_usd from ${SAVINGS_OVERVIEW}`,
    ]);
    expect(plantedOnly(ruleR2Widget(pages))).toEqual([
      `R2 planted/planted-step-a: shows total_savings_usd from ${SAVINGS_OVERVIEW}`,
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

  // OMN-21015 AC3: the one per-run exception, and a planted control per rule that it stays exactly one field wide.
  it('PER_RUN_SAVING: the exact exception passes R1, R2 and R3', () => {
    const pages = plant([
      plantedComponent('recent-runs', [binding('runs-decisions', DECISIONS, ['correlation_id', 'modelled_savings_usd', 'savings_baseline_model', 'savings_measurement'])]),
    ], [{ data_source: 'recent-runs', config: table('correlation_id', 'modelled_savings_usd') }]);
    expect(plantedOnly([...ruleR1Binding(pages), ...ruleR2Widget(pages), ...ruleR3PerRun(pages)])).toEqual([]);
  });

  it('PER_RUN_SAVING control: any other savings field on the same binding is still refused by R1, R2 and R3', () => {
    const pages = plant([
      plantedComponent('recent-runs', [binding('runs-decisions', DECISIONS, ['correlation_id', 'savings_usd'])]),
    ], [{ data_source: 'recent-runs', config: table('correlation_id', 'savings_usd') }]);
    expect(plantedOnly(ruleR1Binding(pages))).toEqual([`R1 planted/runs-decisions: savings_usd from ${DECISIONS}`]);
    expect(plantedOnly(ruleR2Widget(pages))).toEqual([`R2 planted/recent-runs: shows savings_usd from ${DECISIONS}`]);
    expect(plantedOnly(ruleR3PerRun(pages))).toEqual(['R3 planted/recent-runs: per-run column savings_usd']);
  });

  it('PER_RUN_SAVING control: the same field in another component, or from another exposure, is still refused', () => {
    const elsewhere = plant([
      plantedComponent('planted-other-runs', [binding('runs-decisions', DECISIONS, ['correlation_id', 'modelled_savings_usd'])]),
    ], [{ data_source: 'planted-other-runs', config: table('correlation_id', 'modelled_savings_usd') }]);
    expect(plantedOnly(ruleR1Binding(elsewhere))).toEqual([`R1 planted/runs-decisions: modelled_savings_usd from ${DECISIONS}`]);
    expect(plantedOnly(ruleR3PerRun(elsewhere))).toEqual(['R3 planted/planted-other-runs: per-run column modelled_savings_usd']);
    const otherTopic = plant([
      plantedComponent('recent-runs', [binding('runs-decisions', DELEGATION_SAVINGS, ['sessions', 'modelled_savings_usd'])]),
    ], [{ data_source: 'recent-runs', config: table('modelled_savings_usd') }]);
    expect(plantedOnly(ruleR1Binding(otherTopic))).toEqual([`R1 planted/runs-decisions: modelled_savings_usd from ${DELEGATION_SAVINGS}`]);
    expect(plantedOnly(ruleR3PerRun(otherTopic))).toEqual([`R3 planted/runs-decisions: per-run modelled_savings_usd from ${DELEGATION_SAVINGS}`]);
  });

  it('PER_RUN_SAVING control: an R4 allowance for another savings field on that component is still refused', () => {
    const allowance = { file: 'src/pages/LocalDashboardPage.tsx', owner: 'plantedReader', fields: ['savings_usd'], componentId: 'recent-runs', state: 'bound' as const };
    const finding = 'R4 src/pages/LocalDashboardPage.tsx:1 plantedReader: savings_usd';
    expect(r4AllowanceProblems(loadPages(), [finding], [allowance])).toEqual(expect.arrayContaining([
      expect.stringContaining(`recent-runs binds ${DECISIONS}`),
    ]));
  });

  it('PER_RUN_SAVING: the figure is a savings field and its three labels are labels', () => {
    expect(isSavingsField('modelled_savings_usd')).toBe(true);
    for (const label of ['savings_baseline_model', 'savings_pricing_manifest_version', 'savings_measurement']) {
      expect(isSavingsField(label), label).toBe(false);
    }
  });

  it('R4 catches savings read in code, and ignores comments and prose', () => {
    const source = [
      '// session.savings_usd in a comment is not a read',
      'export function AvgSavingCard({ row }: { row: Record<string, unknown> }) { return row.savings_per_measured_run_usd; }',
      'function RecentRunsTable({ session }: { session: Record<string, number> }) { return session.savings_usd; }',
      "const baselineOf = (session: Record<string, number>) => session['counterfactual_baseline_usd'] - session.local_cost_usd;",
      "const PENDING = 'Not served yet: waits on savings_per_measured_run_usd in metering-summary.v1';",
    ].join('\n');
    expect(ruleR4Source([{ file: 'planted.tsx', source }])).toEqual([
      'R4 planted.tsx:2 AvgSavingCard: savings_per_measured_run_usd',
      'R4 planted.tsx:3 RecentRunsTable: savings_usd',
      'R4 planted.tsx:4 baselineOf: counterfactual_baseline_usd',
    ]);
  });

  // Codex's #361 review: R4 matched only lower_snake tokens, so a camelCase or PascalCase alias of a savings field, as
  // a property or as a string key, walked past it.
  it('R4 catches a camelCase or PascalCase alias of every savings field, as a property or a string key', () => {
    const camel = (field: string) => field.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
    const pascal = (field: string) => camel(field).replace(/^[a-z]/, (c) => c.toUpperCase());
    const aliases = [...SAVINGS_FIELDS].flatMap((field) => [camel(field), pascal(field)]);
    // Spellings no contract uses, named in the review: still savings-shaped, so still caught.
    aliases.push('savingsPerRunUsd', 'baselineCostUsd');
    const source = aliases.flatMap((alias) => [
      `function Dot${alias}(row: Record<string, unknown>) { return row.${alias}; }`,
      `function Key${alias}(row: Record<string, unknown>) { return row['${alias}']; }`,
    ]).join('\n');
    const findings = ruleR4Source([{ file: 'planted.tsx', source }]);
    for (const alias of aliases) {
      expect(findings.some((finding) => finding.includes(` Dot${alias}: ${alias}`)), `row.${alias}`).toBe(true);
      expect(findings.some((finding) => finding.includes(` Key${alias}: ${alias}`)), `row['${alias}']`).toBe(true);
    }
  });

  // OMN-20009: the Avg saving / call card is the one legitimate per-run savings reader. The control is that the
  // exemption is the card's name AND its one field, not a blanket pass.
  it('R4 allows SavingsPerRunCard to read savings_per_measured_run_usd only; any other reader or field still fails', () => {
    const source = [
      'export function SavingsPerRunCard({ row }: { row: Record<string, unknown> }) { return row.savings_per_measured_run_usd; }',
      'export function SavingsPerRunCardTwin({ row }: { row: Record<string, unknown> }) { return row.savings_per_measured_run_usd; }',
      'export function RecentRunsTable({ row }: { row: Record<string, unknown> }) { return row.savings_per_measured_run_usd; }',
      'export function SavingsPerRunCard2({ row }: { row: Record<string, unknown> }) { return row.savings_usd; }',
    ].join('\n');
    // The real allowance names the page file; this planted copy names the planted file, so only the owner and field are tested.
    const card: R4Allowance = {
      file: 'planted.tsx', owner: 'SavingsPerRunCard', fields: ['savings_per_measured_run_usd'],
      componentId: 'overview-avg-saving-per-call', state: 'pending',
    };
    expect(ruleR4Source([{ file: 'planted.tsx', source }], [card])).toEqual([
      'R4 planted.tsx:2 SavingsPerRunCardTwin: savings_per_measured_run_usd',
      'R4 planted.tsx:3 RecentRunsTable: savings_per_measured_run_usd',
      'R4 planted.tsx:4 SavingsPerRunCard2: savings_usd',
    ]);
    // A JSX reference to the card is a component use, not a read; a prop or key named like a savings field still is one.
    const jsx = 'const a = () => <SavingsPerRunCard rows={rows} />;\nconst b = () => <Card savingsUsd={1} />;';
    expect(ruleR4Source([{ file: 'planted.tsx', source: jsx }])).toEqual(['R4 planted.tsx:2 b: savingsUsd (savings_usd)']);
    // The same name with a second savings field inside the allowed owner: the field is not exempt.
    const wider = 'export function SavingsPerRunCard(row: Record<string, unknown>) { return [row.savings_per_measured_run_usd, row.savings_usd]; }';
    expect(ruleR4Source([{ file: 'planted.tsx', source: wider }], [card])).toEqual([
      'R4 planted.tsx:1 SavingsPerRunCard: savings_usd',
    ]);
  });

  it('R4 normalising does not turn cost, constants or prose into savings', () => {
    const source = [
      "function SpendCard(row: Record<string, unknown>) { return [row.totalCostUsd, row['localCostUsd'], row.costUsd, row.MeasuredCostUsd]; }",
      "const DELEGATION_SAVINGS_TOPIC = 'onex.snapshot.projection.delegation.savings.v1';",
      "const title = 'Savings';",
      "const line = 'Baseline cost is the savings input';",
      'export function SavingsBadge() { return null; }',
    ].join('\n');
    expect(ruleR4Source([{ file: 'planted.tsx', source }])).toEqual([]);
  });

  it('R4 reads the page, the loader and every dashboard module the page imports, and sees a savings name in each (positive control)', () => {
    const sources = readSources();
    expect(sources.map(({ file }) => file)).toEqual([...SOURCE_FILES]);
    // The modules come from the page's own imports; the two Usage renderers are among them, so a read there is scanned.
    expect(SOURCE_FILES).toEqual(expect.arrayContaining([
      'src/components/dashboard/usage/SavingsSeriesWidget.tsx', 'src/components/dashboard/usage/UsageByModelDayWidget.tsx',
    ]));
    // A read planted at the end of each real file proves the scan parses that file's real text and sees a savings name
    // in it; PlantedCard is allowed nowhere.
    const planted = sources.map(({ file, source }) => ({
      file, source: `${source}\nexport function PlantedCard(row: Record<string, unknown>) { return row.savings_usd; }\n`,
    }));
    const findings = ruleR4Source(planted);
    for (const file of SOURCE_FILES) {
      expect(findings.some((finding) => finding.startsWith(`R4 ${file}:`) && finding.endsWith('PlantedCard: savings_usd')), file).toBe(true);
    }
  });
});

describe('Savings source boundary with exact user-authorized Overview restoration', () => {
  it('the restored Overview exception is exact and all renderer allowances retain their source ownership', () => {
    expect(OVERVIEW_RESTORE_ALLOWLIST).toEqual([{ component_id: 'overview-savings', binding_id: 'overview-savings-legacy', projection_topic: SAVINGS_OVERVIEW, fields: ['total_savings_usd'] }]);
    expect(R4_ALLOWED.length).toBeGreaterThan(0);
    expect(r4AllowanceProblems(loadPages(), ruleR4Source(readSources(), []), R4_ALLOWED)).toEqual([]);
  });

  it('no allowance is pending: OMN-20009\'s Avg saving / call read is bound now that the lab serves its column', () => {
    // The planted case below is the control that proves a pending allowance whose card gains a binding is caught.
    expect(R4_ALLOWED.filter((entry) => entry.state === 'pending').map(({ owner, fields, componentId }) => [owner, fields, componentId]))
      .toEqual([]);
  });

  it('planted: a pending allowance whose component gains a binding is reported, and must become bound', () => {
    const pages = plant([plantedComponent('planted-pending', [binding('b', ALLOWED_TOPIC, ['savings_per_measured_run_usd'])])], []);
    const entry: R4Allowance = { file: 'planted.tsx', owner: 'Card', fields: ['savings_per_measured_run_usd'], componentId: 'planted-pending', state: 'pending' };
    const findings = ['R4 planted.tsx:3 Card: savings_per_measured_run_usd'];
    expect(r4AllowanceProblems(pages, findings, [entry]))
      .toEqual([`planted.tsx Card: pending, but planted-pending now binds ${ALLOWED_TOPIC}; make it bound`]);
    expect(r4AllowanceProblems(pages, findings, [{ ...entry, state: 'bound' }])).toEqual([]);
  });

  it('planted: a JSX tag name reads no field, and a savings read inside that component still does', () => {
    const source = 'export const Page = () => <SavingsPerRunCard rows={[]} />;\nexport function Other(row: Record<string, unknown>) { return row.savings_usd; }\n';
    expect(ruleR4Source([{ file: 'planted.tsx', source }], [])).toEqual(['R4 planted.tsx:2 Other: savings_usd']);
  });

  it('planted: an R4 allowance that is stale, allows an unbound field, or reads a component bound to another exposure, is reported', () => {
    const pages = plant([plantedComponent('planted-savings-reader', [binding('b', DELEGATION_SAVINGS, ['savings_usd'])])], []);
    const entry = (fields: string[], componentId = 'planted-savings-reader'): R4Allowance =>
      ({ file: 'planted.tsx', owner: 'readSavings', fields, componentId, state: 'bound' });
    const findings = ['R4 planted.tsx:3 readSavings: savings_usd'];
    expect(r4AllowanceProblems(pages, findings, [entry(['savings_usd'])]))
      .toEqual([`planted.tsx readSavings: planted-savings-reader binds ${DELEGATION_SAVINGS}`]);
    expect(r4AllowanceProblems(pages, [], [entry(['savings_usd'])]))
      .toContain('planted.tsx readSavings: stale, no read of savings_usd by this owner');
    expect(r4AllowanceProblems(pages, findings, [entry(['savings_usd', 'counterfactual_usd'])]))
      .toEqual(expect.arrayContaining([
        'planted.tsx readSavings: stale, no read of counterfactual_usd by this owner',
        "planted.tsx readSavings: counterfactual_usd is not a required field of planted-savings-reader's binding",
      ]));
    expect(r4AllowanceProblems(pages, findings, [entry([])])).toContain('planted.tsx readSavings: allows no field');
    expect(r4AllowanceProblems(pages, findings, [entry(['savings_usd'], 'no-such-component')]))
      .toContain('planted.tsx readSavings: component no-such-component found 0 times');
  });

  it('planted: an allowance covers only its own fields; another savings field in the same owner, nested or by string key, is caught', () => {
    const source = [
      'export function readSavings(row: Record<string, unknown>) {',
      '  const nested = () => row["counterfactual_baseline_usd"];',
      '  return [row.savings_usd, nested(), row["baseline_cost_usd"]];',
      '}',
    ].join('\n');
    const allowed: R4Allowance[] = [{ file: 'planted.tsx', owner: 'readSavings', fields: ['savings_usd'], componentId: 'x', state: 'bound' }];
    expect(ruleR4Source([{ file: 'planted.tsx', source }], allowed)).toEqual([
      'R4 planted.tsx:2 readSavings: counterfactual_baseline_usd',
      'R4 planted.tsx:3 readSavings: baseline_cost_usd',
    ]);
  });

  it('planted: discovery follows every in-repo import, outside the dashboard directory too, skips assets and packages, and keeps an unresolvable import', () => {
    const files: Record<string, string> = {
      'src/pages/P.tsx': "import { A } from '@/components/dashboard/a/A';\nimport './p.css';\nimport { useState } from 'react';",
      'src/components/dashboard/a/A.tsx': "import { pick } from '@/lib/pick';\nexport { B } from '../b/B';",
      'src/lib/pick.ts': "import { T } from '@shared/t';\nexport const pick = (row: Record<string, unknown>) => row['counterfactual_baseline_usd'];",
      'shared/t.ts': 'export const T = 1;',
      'src/components/dashboard/b/B.tsx': 'export const B = 1;',
    };
    const read = (file: string) => { if (!(file in files)) throw new Error(`not found: ${file}`); return files[file]!; };
    const exists = (file: string) => file in files;
    const reached = dashboardModuleClosure('src/pages/P.tsx', read, exists);
    expect(reached).toEqual(['src/components/dashboard/a/A.tsx', 'src/lib/pick.ts', 'src/components/dashboard/b/B.tsx', 'shared/t.ts']);
    // The helper outside the dashboard directory is scanned, so its savings read is reported.
    expect(ruleR4Source(reached.map((file) => ({ file, source: files[file]! })), []))
      .toEqual(['R4 src/lib/pick.ts:2 pick: counterfactual_baseline_usd']);
    // A code import that resolves to no file is kept, so reading it fails and the scan cannot skip it.
    files['src/components/dashboard/b/B.tsx'] = "import { m } from './missing';";
    expect(() => dashboardModuleClosure('src/pages/P.tsx', read, exists)).toThrow('not found: src/components/dashboard/b/missing');
  });

  it('planted: discovery follows dynamic import() and require() of a literal, and refuses one it cannot resolve', () => {
    const files: Record<string, string> = {
      'src/pages/P.tsx': "import { A } from '@/components/dashboard/a/A';",
      'src/components/dashboard/a/A.tsx': "export const load = () => import('./lazyHelper');\nconst legacy = require('@/lib/legacy');",
      'src/components/dashboard/a/lazyHelper.ts': "export const pick = (row: Record<string, unknown>) => row['counterfactual_baseline_usd'];",
      'src/lib/legacy.ts': 'export const L = 1;',
    };
    const read = (file: string) => { if (!(file in files)) throw new Error(`not found: ${file}`); return files[file]!; };
    const exists = (file: string) => file in files;
    const reached = dashboardModuleClosure('src/pages/P.tsx', read, exists);
    expect(reached).toEqual(['src/components/dashboard/a/A.tsx', 'src/components/dashboard/a/lazyHelper.ts', 'src/lib/legacy.ts']);
    expect(ruleR4Source(reached.map((file) => ({ file, source: files[file]! })), []))
      .toEqual(['R4 src/components/dashboard/a/lazyHelper.ts:1 pick: counterfactual_baseline_usd']);
    files['src/components/dashboard/a/A.tsx'] = "const name = './lazyHelper';\nexport const load = () => import(name);";
    expect(() => dashboardModuleClosure('src/pages/P.tsx', read, exists))
      .toThrow('src/components/dashboard/a/A.tsx:2: a dynamic import or require with a non-literal argument cannot be scanned');
  });

  it('planted: a property naming an exposure is not a savings read, and a savings field beside it still is', () => {
    const source = [
      "export const T = { costSavingsOverview: 'onex.snapshot.projection.cost.savings-overview.v1', savingsUsd: 1 };",
      'export const read = (row: Record<string, unknown>) => [row.savingsUsd, T.costSavingsOverview];',
    ].join('\n');
    expect(ruleR4Source([{ file: 'planted.ts', source }], [])).toEqual([
      'R4 planted.ts:1 T: savingsUsd (savings_usd)',
      'R4 planted.ts:2 read: savingsUsd (savings_usd)',
      'R4 planted.ts:2 read: costSavingsOverview (cost_savings_overview)',
    ]);
  });

  it('every bound savings figure on the six pages reads metering-summary.v1, but the one per-run exception, and there is at least one', () => {
    const pages = loadPages();
    // OMN-21015 AC3: the PER_RUN_SAVING field is the one savings figure allowed off metering-summary.v1; it is set
    // aside here by exact match and asserted below to be where the exception says, so nothing else can hide behind it.
    const bound = pages.flatMap((page) => bindingsOf(page)
      .filter(({ component, binding: b }) => (b.required_fields ?? []).some((f) => isSavingsField(f)
        && !isPerRunSaving(component.component_id, b.binding_id, b.projection_topic, f)
        && !allowlisted(b, f, component.component_id)))
      .map(({ binding: b }) => ({ id: `${page.name}/${b.binding_id}`, topic: b.projection_topic })));
    const shown = pages.flatMap((page) => widgetKeys(page).filter((entry) => isSavingsField(entry.key)).flatMap((entry) => {
      const first = page.doc.components.find((candidate) => candidate.component_id === entry.componentId)?.data_bindings?.[0];
      if (first !== undefined && (isPerRunSaving(entry.componentId, first.binding_id, first.projection_topic, entry.key) || allowlisted(first, entry.key, entry.componentId))) return [];
      return first === undefined ? [] : [{ id: `${page.name}/${entry.componentId}:${entry.key}`, topic: first.projection_topic }];
    }));
    // Positive controls name the exact bound Usage savings widget; finding a different savings field cannot pass.
    expect(bound.map((entry) => entry.id)).toContain('usage/usage-savings-series-metering');
    expect(shown.map((entry) => entry.id)).toContain('usage/usage-savings-series:savings_usd');
    expect(bindingsOf(pages.find(p => p.name === 'overview')!).filter(({component,binding:b}) => (b.required_fields ?? []).some(f => allowlisted(b,f,component.component_id)))).toHaveLength(1);
    for (const entry of [...bound, ...shown]) expect(entry.topic, entry.id).toBe(ALLOWED_TOPIC);
    const perRun = pages.flatMap((page) => bindingsOf(page).filter(({ binding: b }) => (b.required_fields ?? []).includes(PER_RUN_SAVING.field))
      .map(({ component, binding: b }) => `${page.name}/${component.component_id}/${b.binding_id}:${b.projection_topic}`));
    expect(perRun).toEqual([`runs/${PER_RUN_SAVING.componentId}/${PER_RUN_SAVING.bindingId}:${DECISIONS}`]);
  });

  it('Overview savings reads exactly the restored aggregate total, with no borrowed baseline caption', () => {
    const overview = loadPages().find(page => page.name === 'overview')!;
    expect(overview.doc.components.find(c => c.component_id === 'overview-savings')?.data_bindings).toEqual([{
      binding_id: 'overview-savings-legacy', projection_topic: SAVINGS_OVERVIEW,
      ordering_authority_field: 'captured_at', ordering_direction: 'descending',
      required_fields: ['window', 'captured_at', 'total_savings_usd'],
    }]);
    expect((overview.doc.dashboard.widgets.find(w => w.data_source === 'overview-savings')?.config as {metric_key:string}).metric_key).toBe('total_savings_usd');
  });
});

// Lakshman 2026-10-19: the four headlines return to one legacy all-time row.
// OMN-21166 AC37 (Lakshman 2026-10-20, "One number everywhere"): Agent calls counts every call, run_count.
const OVERVIEW_HEADLINES: Readonly<Record<string, string>> = {
  'overview-spend': 'total_cost_usd', 'overview-savings': 'total_savings_usd',
  'overview-measured': 'run_count', 'overview-tokens': 'tokens_total',
};
function ruleHeadline(pages: readonly LoadedPage[]): string[] {
  const overview = pages.find(page => page.name === 'overview');
  if (!overview) return ['H overview: page not loaded'];
  const findings: string[] = [];
  for (const [id, field] of Object.entries(OVERVIEW_HEADLINES)) {
    const component = overview.doc.components.find(c => c.component_id === id);
    const bindings = component?.data_bindings ?? [];
    if (bindings.length !== 1) findings.push(`H ${id}: requires exactly one source`);
    for (const b of bindings) if (b.projection_topic !== SAVINGS_OVERVIEW) findings.push(`H ${id}: wrong source`);
    const first = bindings[0];
    if (!first) continue;
    if (first.ordering_authority_field !== 'captured_at') findings.push(`H ${id}: wrong ordering`);
    for (const required of ['window', 'captured_at', field]) if (!(first.required_fields ?? []).includes(required)) findings.push(`H ${id}: missing ${required}`);
    const widget = overview.doc.dashboard.widgets.find(w => w.data_source === id);
    if ((widget?.config as {metric_key?:string})?.metric_key !== field) findings.push(`H ${id}: wrong metric`);
  }
  return findings;
}
function withOverview(id: string, patch: (component: ModelComponentContract) => ModelComponentContract, metricKey?: string): LoadedPage[] {
  return loadPages().map(page => {
    if (page.name !== 'overview') return page;
    const doc = structuredClone(page.doc);
    doc.components = doc.components.map(c => c.component_id === id ? patch(c) : c);
    if (metricKey !== undefined) (doc.dashboard.widgets.find(w => w.data_source === id)!.config as {metric_key:string}).metric_key = metricKey;
    return {...page, doc};
  });
}
describe('Restored Overview headline source: exact aggregate and field boundary', () => {
  it('all four headlines share the one source with matching fields and all-time selection metadata', () => {
    expect(ruleHeadline(loadPages())).toEqual([]);
  });
  it('only the four named headline components read the restored aggregate', () => {
    const overview = loadPages().find(p => p.name === 'overview')!;
    expect(bindingsOf(overview).filter(({binding:b}) => b.projection_topic === SAVINGS_OVERVIEW).map(({component}) => component.component_id)).toEqual(Object.keys(OVERVIEW_HEADLINES));
  });
  it('the exact four source bindings remain declared', () => {
    const overview = loadPages().find(p => p.name === 'overview')!;
    for (const [id,field] of Object.entries(OVERVIEW_HEADLINES)) expect(overview.doc.components.find(c => c.component_id === id)?.data_bindings).toEqual([{
      binding_id: id+'-legacy', projection_topic:SAVINGS_OVERVIEW, ordering_authority_field:'captured_at', ordering_direction:'descending', required_fields:['window','captured_at',field],
    }]);
  });
  it('rejects metering and per-run savings as substituted headline sources', () => {
    for (const topic of [ALLOWED_TOPIC, DELEGATION_SAVINGS]) {
      expect(ruleHeadline(withOverview('overview-spend',c => ({...c,data_bindings:[binding('bad',topic,['window','captured_at','total_cost_usd'])]})))).toEqual(['H overview-spend: wrong source']);
    }
  });
  it('rejects a caption borrowed from a second source', () => {
    expect(ruleHeadline(withOverview('overview-measured',c => ({...c,data_bindings:[...(c.data_bindings??[]),binding('extra',ALLOWED_TOPIC,['runs_total'])]})))).toEqual(['H overview-measured: requires exactly one source', 'H overview-measured: wrong source']);
  });
  it('rejects unbound tokens', () => {
    expect(ruleHeadline(withOverview('overview-tokens',c => ({...c,data_bindings:[]})))).toEqual(['H overview-tokens: requires exactly one source']);
  });
  it('rejects missing window metadata and a different metric key', () => {
    expect(ruleHeadline(withOverview('overview-spend',c => ({...c,data_bindings:[binding('bad',SAVINGS_OVERVIEW,['total_cost_usd'])]})))).toEqual(['H overview-spend: missing window', 'H overview-spend: missing captured_at']);
    expect(ruleHeadline(withOverview('overview-measured',c=>c,'runs_measured'))).toEqual(['H overview-measured: wrong metric']);
    // AC37: the measured-only count is no longer the Agent calls figure.
    expect(ruleHeadline(withOverview('overview-measured',c=>c,'measured_run_count'))).toEqual(['H overview-measured: wrong metric']);
  });
  it('H5: rejects a binding missing the exact displayed field', () => {
    expect(ruleHeadline(withOverview('overview-tokens', c => ({ ...c, data_bindings: [binding('bad', SAVINGS_OVERVIEW, ['window', 'captured_at', 'tokens_input'])] })))).toEqual(['H overview-tokens: missing tokens_total']);
  });
  it('H4: rejects the wrong all-row ordering authority', () => {
    expect(ruleHeadline(withOverview('overview-spend', c => ({ ...c, data_bindings: (c.data_bindings ?? []).map(b => ({ ...b, ordering_authority_field: 'as_of' })) })))).toEqual(['H overview-spend: wrong ordering']);
  });
  it('rejects a missing Overview page', () => {
    expect(ruleHeadline(loadPages().filter(p=>p.name!=='overview'))).toEqual(['H overview: page not loaded']);
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

  /**
   * AC2c in plain words (OMN-21166 AC39): an unbound savings card waits on the approved savings source, and its text
   * says what is missing ("Not available yet: <what>") without naming the exposure. The exposure stays in code.
   */
  function waitsOnApprovedSavings(id: string, text: string): boolean {
    const pending = PENDING_SOURCES[id];
    return pending?.exposure === ALLOWED_SAVINGS_SOURCE && text === `Not available yet: ${pending.waitsOn}`;
  }

  it('every unbound savings card says what it waits on, in plain words, and shows no figure', () => {
    const texts = unboundSavingsTexts(loadPages());
    // Every savings card is bound to metering-summary.v1: OMN-20009's Avg saving / call bound once the captured
    // catalogue served its per-run column (lab recapture 2026-10-07). The planted case below is the control that proves an unbound
    // one is found.
    expect(texts.map(({ id }) => id)).toEqual([]);
    for (const { id, text } of texts) {
      expect(waitsOnApprovedSavings(id, text), `${id}: ${text}`).toBe(true);
    }
    // Control: a card the pages leave unbound for its savings figure says what it waits on, in plain words.
    const named = render(createElement(PendingState, { componentId: 'overview-avg-saving-per-call' }));
    expect(waitsOnApprovedSavings('overview-avg-saving-per-call', named.container.textContent ?? '')).toBe(true);
    expect(named.container.textContent).toBe('Not available yet: savings per run');
    named.unmount();
  });

  it('planted: an unbound savings card with no named source is caught', () => {
    const pages = plant([plantedComponent('planted-unnamed-savings', [], ['upstream-blocked'], 'metric_card')],
      [{ data_source: 'planted-unnamed-savings', config: metric('savings_usd') }]);
    const planted = unboundSavingsTexts(pages).find((entry) => entry.id === 'planted-unnamed-savings');
    expect(planted?.text).toBe('Not available yet');
    expect(waitsOnApprovedSavings('planted-unnamed-savings', planted?.text ?? '')).toBe(false);
  });
});
