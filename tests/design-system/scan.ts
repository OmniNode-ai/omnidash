/**
 * OMN-22168: the scanners behind the design-system guard tests. Each one is a pure function over (path, text), so a
 * test can plant a violation in memory and prove the scanner catches it before trusting a clean scan of src.
 * First draft through onex delegate run ea4ec796; checked and extended by claude-d397ab45.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const ROOT = join(__dirname, '..', '..');
export const SRC = join(ROOT, 'src');

/** The one file allowed to hold a raw colour (AC1). */
export const TOKENS_FILE = 'src/design-system/tokens.css';
/** The one file allowed to import lucide-react (AC2). */
export const ICONS_FILE = 'src/design-system/icons.ts';

/** Test and story files hold fixtures, not drawn styles; generated types are not hand-written. No production file is exempt. */
export function isExempt(path: string): boolean {
  return /\.(test|spec|stories)\.[cm]?[jt]sx?$/.test(path)
    || path.startsWith('src/tests/')
    || path.startsWith('src/shared/types/generated/');
}

export function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) { if (name !== 'node_modules') walk(full); continue; }
      if (/\.(css|ts|tsx)$/.test(name)) out.push(relative(ROOT, full).split(sep).join('/'));
    }
  };
  walk(SRC);
  return out.sort();
}

export function read(path: string): string { return readFileSync(join(ROOT, path), 'utf8'); }

/** Comments are prose, not styles: a colour named in a comment draws nothing. */
export function stripComments(path: string, text: string): string {
  const noBlock = text.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
  if (path.endsWith('.css')) return noBlock;
  // Line comments, but not the // inside a string or a URL.
  return noBlock.split('\n').map(line => line.replace(/(^|[^:'"`\\])\/\/.*$/, '$1')).join('\n');
}

const COLOUR = /(?<![\w&#-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![\w-])|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(\s*[\d.]/g;

export interface Hit { path: string; line: number; text: string }

/** A three.js / numeric colour (0xrrggbb) in TypeScript. */
const NUMERIC = /\b0x[0-9a-fA-F]{6}\b/g;
/** Named CSS colours, as a CSS value (`color: white`) or a quoted string in TypeScript (`'white'`). */
const NAMES = 'white|black|red|green|blue|yellow|orange|purple|pink|gray|grey|silver|navy|teal|maroon|olive|lime|aqua|fuchsia|cyan|magenta|gold|indigo|violet';
const NAMED_CSS = new RegExp(`(?<=[:,\\s(])(?:${NAMES})(?=\\s*[;,)!}]|\\s+\\d|\\s*$)`, 'gi');
/** In TypeScript, a quoted colour name only as the value of a colour property (a tone name like data-tone="blue" is not a colour). */
const NAMED_TS = new RegExp(`\\b(?:color|background(?:Color)?|fill|stroke|stopColor|border(?:Color|Top|Right|Bottom|Left)?|outline(?:Color)?)\\s*[:=]\\s*\\{?\\s*(['"\`])(?:${NAMES})\\1`, 'gi');

export function colourLiterals(path: string, text: string): Hit[] {
  if (path === TOKENS_FILE || isExempt(path)) return [];
  const hits: Hit[] = [];
  const ts = /\.tsx?$/.test(path);
  stripComments(path, text).split('\n').forEach((line, i) => {
    for (const m of line.matchAll(COLOUR)) hits.push({ path, line: i + 1, text: m[0] });
    if (ts) for (const m of line.matchAll(NUMERIC)) hits.push({ path, line: i + 1, text: m[0] });
    // A CSS value: only inside a declaration (after a colon), never a selector or a class name.
    if (!ts) { const decl = line.includes(':') ? line.slice(line.indexOf(':')) : ''; for (const m of decl.matchAll(NAMED_CSS)) hits.push({ path, line: i + 1, text: m[0] }); }
    if (ts) for (const m of line.matchAll(NAMED_TS)) hits.push({ path, line: i + 1, text: m[0] });
  });
  return hits;
}

const LUCIDE = /(?:from\s+|import\(\s*|require\(\s*)['"]lucide-react(?:\/[^'"]*)?['"]/g;

export function lucideImports(path: string, text: string): Hit[] {
  if (path === ICONS_FILE) return [];
  const hits: Hit[] = [];
  stripComments(path, text).split('\n').forEach((line, i) => {
    for (const m of line.matchAll(LUCIDE)) hits.push({ path, line: i + 1, text: m[0] });
  });
  return hits;
}

/**
 * AC5: outside src/design-system, every custom property a file reads is a --ds-* token, or one the same file sets for
 * itself (a component-local value such as a bar's --rb-size), so the token source can switch with no page change.
 */
/**
 * Component-local knobs: properties a component sets on its own element from TypeScript (a bar's --rb-size, a row's
 * --tier-color), so its stylesheet can read them. They carry per-element values, never theme values: a knob may not
 * take a --ds-* name, and a theme value written into one is still a raw colour that AC1 refuses.
 */
let knobs: Set<string> | undefined;
export function componentKnobs(): Set<string> {
  if (knobs) return knobs;
  knobs = new Set();
  for (const path of sourceFiles()) {
    // The kit's own components set knobs too (RankedBars sets --rb-size, --rb-count, --rb-color), so they are read here:
    // excluding src/design-system/ hid every knob of a chart the moment it moved into the kit. --ds-* names never count.
    if (!/\.tsx?$/.test(path) || isExempt(path)) continue;
    const code = stripComments(path, read(path));
    for (const m of code.matchAll(/['"](--[a-zA-Z0-9-_]+)['"]\s*[:\]]/g)) if (!m[1]!.startsWith('--ds-')) knobs.add(m[1]!);
    for (const m of code.matchAll(/setProperty\(\s*['"](--[a-zA-Z0-9-_]+)['"]/g)) if (!m[1]!.startsWith('--ds-')) knobs.add(m[1]!);
  }
  return knobs;
}

export function foreignProperties(path: string, text: string, allowed: Set<string> = new Set()): Hit[] {
  if (path.startsWith('src/design-system/') || isExempt(path)) return [];
  const code = stripComments(path, text);
  const own = new Set<string>(allowed);
  for (const m of code.matchAll(/(--[a-zA-Z0-9-_]+)\s*:/g)) own.add(m[1]!);
  for (const m of code.matchAll(/['"](--[a-zA-Z0-9-_]+)['"]\s*[:\]]/g)) own.add(m[1]!);
  for (const m of code.matchAll(/setProperty\(\s*['"](--[a-zA-Z0-9-_]+)['"]/g)) own.add(m[1]!);
  const hits: Hit[] = [];
  code.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/var\(\s*(--[a-zA-Z0-9-_]+)/g)) {
      const name = m[1]!;
      // A name built at run time (var(--ds-field-${concept})) ends in '-'; the --ds- check covers it.
      if (!name.startsWith('--ds-') && !own.has(name) && !name.endsWith('-')) hits.push({ path, line: i + 1, text: name });
    }
  });
  return hits;
}

export function scanAll(scan: (path: string, text: string) => Hit[]): Hit[] {
  return sourceFiles().flatMap(path => scan(path, read(path)));
}

export function summarise(hits: Hit[], limit = 25): string {
  const files = new Set(hits.map(h => h.path));
  return `${hits.length} in ${files.size} files:\n` + hits.slice(0, limit).map(h => `  ${h.path}:${h.line} ${h.text}`).join('\n');
}

/** AC3: the one chart kit. Every chart a page draws comes from here. */
export const CHART_KIT = 'src/design-system/charts/';

/**
 * AC4: the pages the component kit serves: the six local pages (their page component and page-local modules), the
 * Usage widgets they mount, and Delegation Evidence. The widget dashboard is not one of them (see WIDGET_DASHBOARD_CHARTS).
 */
export function isKitPage(path: string): boolean {
  return path === 'src/pages/LocalDashboardPage.tsx' || path === 'src/pages/DelegationEvidencePage.tsx'
    || path.startsWith('src/pages/local/') || path.startsWith('src/components/dashboard/usage/');
}
/** The classes only a kit component writes; a page writing one itself holds a page-local copy. Grows as AC4 moves each. */
const KIT_COMPONENT_CLASS = /(['"`\s])(local-dashboard-empty)(?=['"`\s])/g;

/** AC4: a page-local copy of a kit component (its class written outside src/design-system). */
export function pageLocalCopies(path: string, text: string): Hit[] {
  if (!/\.tsx?$/.test(path) || path.startsWith('src/design-system/') || isExempt(path) || !isKitPage(path)) return [];
  const hits: Hit[] = [];
  stripComments(path, text).split('\n').forEach((line, i) => {
    for (const m of line.matchAll(KIT_COMPONENT_CLASS)) hits.push({ path, line: i + 1, text: m[2]! });
  });
  return hits;
}
/**
 * The widget dashboard (/dashboard) is a builder of composable widgets, not one of the six product pages AC3 and AC4 name
 * (Overview, Runs, Workflow, Usage, Settings, Delegation Evidence). Its widgets keep their own ECharts and three.js
 * scenes; their colours already come from the tokens (AC1) through charts/scene-skin.ts. Named file by file, so a new
 * widget chart or a page chart cannot hide here.
 */
export const WIDGET_DASHBOARD_CHARTS: ReadonlySet<string> = new Set([
  'src/components/dashboard/ab-compare/AbCompareWidget.tsx',
  'src/components/dashboard/cost-by-model/CostByModelPie.tsx',
  'src/components/dashboard/cost-summary/CostSummaryAdapter.tsx',
  'src/components/dashboard/cost-trend/CostTrend3DArea.tsx',
  'src/components/dashboard/cost-trend/CostTrend3DBars.tsx',
  'src/components/dashboard/cost-trend/StackedChart.tsx',
  'src/components/dashboard/delegation/DoughnutChart.tsx',
  'src/components/dashboard/projection-container/visualizations/CostScatter.tsx',
  'src/components/dashboard/quality/QualityScoreHistogram.tsx',
  'src/components/dashboard/quality/QualityScoreTilted3D.tsx',
  'src/components/dashboard/receipt-gate/ReceiptGateWidget.tsx',
  'src/components/dashboard/routing-decision/RoutingDecisionWidget.tsx',
  'src/components/dashboard/session-timeline/SessionTimelineWidget.tsx',
]);

// `import 'x'` is the side-effect form, which carries no `from` (the planted-beside-the-allowlist control).
const CHART_LIBRARY = /(?:from\s+|import\s+|import\(\s*|require\(\s*)['"](?:echarts|echarts-for-react|recharts|chart\.js|three)(?:\/[^'"]*)?['"]/g;
/** Marks only a chart draws: an SVG plot, a meter, and the kit's bar, slice, dot, cell and track classes. */
const CHART_MARK = /<svg\b|role=\{?["']meter["']|\b(?:gdb-bar|rb-bar|ins-seg|ins-fill|ins-track|ins-heat-cell|ins-dot|local-donut-slice|local-meter-fill|local-tier-bar-track|usage-analysis-spark|workflow-comparison-track|ins-money-paid|ins-money-saved|ins-money-baseline|local-routing-meter|local-selected-quality-meter)\b/g;

/** AC3: a chart drawn, or a chart library imported, outside the kit. */
export function chartDrawing(path: string, text: string): Hit[] {
  if (!/\.tsx?$/.test(path) || path.startsWith(CHART_KIT) || isExempt(path) || WIDGET_DASHBOARD_CHARTS.has(path)) return [];
  const hits: Hit[] = [];
  stripComments(path, text).split('\n').forEach((line, i) => {
    for (const m of line.matchAll(CHART_LIBRARY)) hits.push({ path, line: i + 1, text: m[0] });
    for (const m of line.matchAll(CHART_MARK)) hits.push({ path, line: i + 1, text: m[0] });
  });
  return hits;
}
