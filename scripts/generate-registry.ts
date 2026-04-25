/**
 * Static MVP manifest generator — NOT the real omnimarket contract scanner.
 *
 * This is a provisional placeholder that generates component-registry.json
 * with 7 hard-coded MVP component manifests. The real implementation will
 * scan omnimarket contract metadata.yaml files at build time.
 *
 * Also scans node_modules/@omninode/* for packages declaring dashboardComponents
 * in their package.json and merges discovered manifests. Local manifests win on
 * name collision (with a warning).
 *
 * Usage: npx tsx scripts/generate-registry.ts
 */
import { writeFileSync, existsSync, readFileSync, readdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { ComponentManifest } from '../shared/types/component-manifest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface PackageJsonWithDashboard {
  name: string;
  version: string;
  dashboardComponents?: string; // relative path to a JSON file listing manifests
}

/**
 * Scan node_modules/@omninode/* for packages declaring dashboardComponents.
 * Returns discovered ComponentManifest[] with _sourcePackage set for traceability.
 */
export function scanInstalledPackages(nodeModulesDir: string): ComponentManifest[] {
  const scopeDir = join(nodeModulesDir, '@omninode');
  if (!existsSync(scopeDir)) return [];
  const found: ComponentManifest[] = [];
  for (const pkg of readdirSync(scopeDir)) {
    const pkgJsonPath = join(scopeDir, pkg, 'package.json');
    if (!existsSync(pkgJsonPath)) continue;
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as PackageJsonWithDashboard;
    if (!pkgJson.dashboardComponents) continue;
    const manifestPath = resolve(dirname(pkgJsonPath), pkgJson.dashboardComponents);
    if (!existsSync(manifestPath)) {
      console.warn(
        `[registry] ${pkg} declares dashboardComponents but file missing: ${manifestPath}`,
      );
      continue;
    }
    const manifests = JSON.parse(readFileSync(manifestPath, 'utf8')) as ComponentManifest[];
    for (const m of manifests) {
      // Mark origin so collisions are traceable
      (m as ComponentManifest & { _sourcePackage: string })._sourcePackage = pkgJson.name;
      found.push(m);
    }
  }
  return found;
}

const MVP_COMPONENTS: Record<string, ComponentManifest> = {
  'cost-trend-panel': {
    name: 'cost-trend-panel',
    displayName: 'Cost Trend',
    description: 'LLM cost trends, budget alerts, and token usage over time',
    category: 'cost',
    version: '1.0.0',
    implementationKey: 'cost-trend/CostTrendPanel',
    configSchema: {
      type: 'object',
      properties: {
        granularity: { type: 'string', enum: ['hour', 'day'], default: 'hour' },
        chartType: {
          type: 'string',
          enum: ['area', 'bar'],
          default: 'area',
          title: 'Chart type',
          description: 'How each model\'s cost contribution is drawn over time. Area stacks smooth filled bands; bar stacks discrete columns per time bucket.',
        },
      },
      additionalProperties: false,
    },
    dataSources: [
      { type: 'api', endpoint: '/api/intelligence/cost/trends', required: true, purpose: 'initial_fetch' },
    ],
    events: { emits: [], consumes: [{ name: 'time_range_changed' }] },
    defaultSize: { w: 8, h: 5 },
    minSize: { w: 4, h: 3 },
    maxSize: { w: 12, h: 8 },
    emptyState: { message: 'No cost data available', hint: 'Cost data appears after LLM calls are tracked' },
    capabilities: { supports_compare: false, supports_export: true, supports_fullscreen: true, supports_time_range: true },
  },
  'cost-trend-3d': {
    name: 'cost-trend-3d',
    displayName: 'Cost Trend (3D)',
    description: 'Experimental 3D cost visualization — orbit, zoom, and play with the data',
    category: 'cost',
    version: '0.1.0',
    implementationKey: 'cost-trend-3d/CostTrend3D',
    // No configSchema — widget has no per-instance options to configure.
    dataSources: [
      { type: 'api', endpoint: '/api/intelligence/cost/trends', required: true, purpose: 'initial_fetch' },
    ],
    events: { emits: [], consumes: [{ name: 'time_range_changed' }] },
    defaultSize: { w: 8, h: 6 },
    minSize: { w: 4, h: 4 },
    maxSize: { w: 12, h: 10 },
    emptyState: { message: 'No cost data available', hint: '3D cost visualization renders after LLM calls are tracked' },
    capabilities: { supports_compare: false, supports_export: false, supports_fullscreen: true, supports_time_range: true },
  },
  'cost-by-model': {
    name: 'cost-by-model',
    displayName: 'Cost by Model',
    description: 'Three.js pie chart of LLM cost share per model over the selected time range',
    category: 'cost',
    version: '1.0.0',
    implementationKey: 'cost-by-model/CostByModelPie',
    // No configSchema — widget has no per-instance options to configure.
    dataSources: [
      { type: 'api', endpoint: '/api/intelligence/cost/trends', required: true, purpose: 'initial_fetch' },
    ],
    events: { emits: [], consumes: [{ name: 'time_range_changed' }] },
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 4, h: 3 },
    maxSize: { w: 12, h: 8 },
    emptyState: { message: 'No cost data available', hint: 'Cost data appears after LLM calls are tracked' },
    capabilities: { supports_compare: false, supports_export: false, supports_fullscreen: true, supports_time_range: true },
  },
  'delegation-metrics': {
    name: 'delegation-metrics',
    displayName: 'Delegation Metrics',
    description: 'Task delegation events, cost savings, and quality gate pass rates',
    category: 'quality',
    version: '1.0.0',
    implementationKey: 'delegation/DelegationMetrics',
    configSchema: {
      type: 'object',
      properties: {
        showSavings: { type: 'boolean', default: true },
        showQualityGates: { type: 'boolean', default: true },
      },
      additionalProperties: false,
    },
    dataSources: [
      { type: 'api', endpoint: '/api/delegation/summary', required: true, purpose: 'initial_fetch' },
      { type: 'websocket', topic: 'delegation', required: false, purpose: 'live_updates' },
    ],
    events: { emits: [{ name: 'task_type_selected', schema: { type: 'object', properties: { taskType: { type: 'string' } } } }], consumes: [{ name: 'time_range_changed' }] },
    defaultSize: { w: 6, h: 5 },
    minSize: { w: 4, h: 3 },
    maxSize: { w: 12, h: 8 },
    emptyState: { message: 'No delegation events', hint: 'Delegation events appear when tasks are delegated to agents' },
    capabilities: { supports_compare: false, supports_export: true, supports_fullscreen: true, supports_time_range: false },
  },
  'routing-decision-table': {
    name: 'routing-decision-table',
    displayName: 'Routing Decisions',
    description: 'LLM routing decision log with agreement rates and confidence scores',
    category: 'activity',
    version: '1.0.0',
    implementationKey: 'routing/RoutingDecisionTable',
    configSchema: {
      type: 'object',
      properties: {
        pageSize: {
          type: 'number',
          enum: [10, 25, 50, 100],
          default: 25,
          title: 'Rows per page',
          description: 'How many decisions to render per page before pagination controls.',
        },
      },
      additionalProperties: false,
    },
    dataSources: [
      { type: 'api', endpoint: '/api/llm-routing/decisions', required: true, purpose: 'initial_fetch' },
      { type: 'websocket', topic: 'llm-routing', required: false, purpose: 'live_updates' },
    ],
    events: { emits: [{ name: 'decision_selected' }], consumes: [{ name: 'time_range_changed' }] },
    defaultSize: { w: 12, h: 6 },
    minSize: { w: 6, h: 4 },
    maxSize: { w: 12, h: 12 },
    emptyState: { message: 'No routing decisions', hint: 'Routing decisions appear when LLM routing is active' },
    capabilities: { supports_compare: false, supports_export: true, supports_fullscreen: true, supports_time_range: true },
  },
  'baselines-roi-card': {
    name: 'baselines-roi-card',
    displayName: 'Baselines ROI',
    description: 'Token/time delta, retry counts, and promotion recommendations',
    category: 'health',
    version: '1.0.0',
    implementationKey: 'baselines/BaselinesROICard',
    // No configSchema — widget has no per-instance options to configure.
    dataSources: [
      { type: 'api', endpoint: '/api/baselines/summary', required: true, purpose: 'initial_fetch' },
      { type: 'websocket', topic: 'baselines', required: false, purpose: 'live_updates' },
    ],
    events: { emits: [], consumes: [{ name: 'time_range_changed' }] },
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 3, h: 3 },
    maxSize: { w: 12, h: 6 },
    emptyState: { message: 'No baselines data', hint: 'Baselines data appears after A/B pattern evaluation' },
    capabilities: { supports_compare: false, supports_export: true, supports_fullscreen: false, supports_time_range: false },
  },
  'quality-score-panel': {
    name: 'quality-score-panel',
    displayName: 'Quality Scores',
    description: 'Pattern quality score distribution with pass-rate headline and tier-coloured bars',
    category: 'quality',
    version: '1.1.0',
    implementationKey: 'quality/QualityScorePanel',
    configSchema: {
      type: 'object',
      properties: {
        passThreshold: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          default: 0.8,
          title: 'Pass threshold',
          description: 'Score at or above which a measurement is counted as passing. Drives both the headline pass-rate number and the translucent wall behind the bars.',
        },
      },
      additionalProperties: false,
    },
    dataSources: [
      { type: 'api', endpoint: '/api/intelligence/quality/summary', required: true, purpose: 'initial_fetch' },
    ],
    events: { emits: [], consumes: [] },
    // minSize bumped from 3 → 4 because the new split layout (130px
    // stats pane + 3D chart) needs room for the chart to stay legible.
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 4, h: 3 },
    maxSize: { w: 12, h: 6 },
    emptyState: { message: 'No quality scores', hint: 'Quality scores appear after patterns are evaluated' },
    capabilities: { supports_compare: false, supports_export: true, supports_fullscreen: false, supports_time_range: false },
  },
  'readiness-gate': {
    name: 'readiness-gate',
    displayName: 'Readiness Gate',
    description: '7-dimension tri-state platform readiness aggregation',
    category: 'health',
    version: '1.0.0',
    implementationKey: 'readiness/ReadinessGate',
    // No configSchema — widget has no per-instance options to configure.
    dataSources: [
      { type: 'api', endpoint: '/api/readiness/summary', required: true, purpose: 'initial_fetch' },
    ],
    events: { emits: [{ name: 'dimension_selected' }], consumes: [] },
    defaultSize: { w: 12, h: 4 },
    minSize: { w: 6, h: 3 },
    maxSize: { w: 12, h: 6 },
    emptyState: { message: 'No readiness data', hint: 'Run the platform readiness gate to see results' },
    capabilities: { supports_compare: false, supports_export: true, supports_fullscreen: false, supports_time_range: false },
  },
  'event-stream': {
    name: 'event-stream',
    displayName: 'Event Stream',
    description: 'Live Kafka event feed with filtering and search',
    category: 'activity',
    version: '1.0.0',
    implementationKey: 'events/EventStream',
    configSchema: {
      type: 'object',
      properties: {
        maxEvents: { type: 'number', default: 200 },
        autoScroll: { type: 'boolean', default: true },
      },
      additionalProperties: false,
    },
    dataSources: [
      { type: 'websocket', topic: 'event-bus', required: true, purpose: 'live_updates' },
      { type: 'api', endpoint: '/api/events/recent', required: true, purpose: 'initial_fetch' },
    ],
    events: { emits: [{ name: 'event_selected' }], consumes: [] },
    defaultSize: { w: 12, h: 6 },
    minSize: { w: 6, h: 4 },
    maxSize: { w: 12, h: 12 },
    emptyState: { message: 'No events streaming', hint: 'Events appear when the Kafka bus is connected' },
    // EventStream is a live tail, not a windowed query — the range
    // selector doesn't map onto its behavior, so it opts out.
    capabilities: { supports_compare: false, supports_export: false, supports_fullscreen: true, supports_time_range: false },
  },
};

// Scan node_modules/@omninode/* for packages declaring dashboardComponents
const nodeModulesDir = resolve(__dirname, '../node_modules');
const scannedComponents = scanInstalledPackages(nodeModulesDir);

// Merge: local wins on name collision
const mergedComponents: Record<string, ComponentManifest> = { ...MVP_COMPONENTS };
for (const scanned of scannedComponents) {
  if (mergedComponents[scanned.name]) {
    console.warn(
      `[registry] name collision on "${scanned.name}" — keeping local, ignoring scanned from ${(scanned as ComponentManifest & { _sourcePackage?: string })._sourcePackage ?? 'unknown package'}`,
    );
  } else {
    mergedComponents[scanned.name] = scanned;
  }
}

const manifest = {
  manifestVersion: '1.0',
  generatedAt: new Date().toISOString(),
  components: mergedComponents,
};

// Lives under src/ so Vite can resolve it as a module import without
// the "Assets in public directory cannot be imported from JavaScript"
// warning. Nothing fetches this file over HTTP — it's only consumed
// via JS imports — so it doesn't need to be a static asset.
const outPath = resolve(__dirname, '../src/registry/component-registry.json');
writeFileSync(outPath, JSON.stringify(manifest, null, 2));
console.log(
  `Generated component-registry.json with ${Object.keys(mergedComponents).length} components (${Object.keys(MVP_COMPONENTS).length} local + ${scannedComponents.length} scanned)`,
);
