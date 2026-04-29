/**
 * Static MVP manifest generator — NOT the real omnimarket contract scanner.
 *
 * This is a provisional placeholder that generates component-registry.json
 * with hard-coded MVP component manifests. The real implementation will
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
import { validateComponentManifest } from '../shared/types/component-manifest.js';
import { TOPICS, type TopicSymbol } from '../shared/types/topics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface PackageJsonWithDashboard {
  name: string;
  version: string;
  dashboardComponents?: string; // relative path to a JSON file listing manifests
}

function projectionSource(topic: TopicSymbol, required = true): ComponentManifest['dataSources'][number] {
  return { type: 'projection', topic, required, purpose: 'initial_fetch' };
}

function liveSource(topic: TopicSymbol, required = false): ComponentManifest['dataSources'][number] {
  return { type: 'websocket', topic, required, purpose: 'live_updates' };
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
    description: 'LLM cost trends over time rendered as a stacked area or bar chart; dispatched to ITrendChartAdapter (impl: threejs)',
    category: 'cost',
    version: '3.0.0',
    // Routes through the adapter resolver: ITrendChartAdapter → TrendChartThreeJs.
    // implementationKey 'threejs' is declared here; bespoke CostTrend router is removed.
    implementationKey: 'ITrendChartAdapter/threejs',
    configSchema: {
      type: 'object',
      properties: {
        style: {
          type: 'string',
          enum: ['area', 'bar'],
          default: 'area',
          title: 'Style',
          description: 'Stacked area bands or stacked bar columns.',
        },
        granularity: { type: 'string', enum: ['hour', 'day'], default: 'hour' },
      },
      additionalProperties: false,
    },
    // Row shape emitted by onex.snapshot.projection.llm_cost.v1.
    // ordering authority: bucket_time, monotonic ascending.
    projectionSchema: {
      type: 'object',
      required: ['bucket_time', 'model_name', 'total_cost_usd'],
      properties: {
        bucket_time: {
          type: 'string',
          format: 'date-time',
          description: 'ISO-8601 time bucket start. Ordering authority: monotonic ascending.',
        },
        model_name: { type: 'string', description: 'LLM model identifier, used as the series group key.' },
        total_cost_usd: { type: 'number', description: 'Total cost in USD for this model in this bucket.' },
      },
      'x-orderingAuthority': {
        authority: 'bucket_time',
        fieldName: 'bucket_time',
        direction: 'asc',
        clockSemantics: 'UTC',
      },
    },
    // Rendered output contract for Playwright assertions (OMN-7093).
    displayContract: {
      description: 'Stacked area chart over time. x-axis = bucket_time ascending at configured granularity. y-axis = cumulative total_cost_usd. Each series = one model_name.',
      type: 'object',
      properties: {
        chartType: { type: 'string', enum: ['area', 'bar'] },
        xAxis: { type: 'string', const: 'bucket_time' },
        yAxis: { type: 'string', const: 'total_cost_usd' },
        series: { type: 'string', const: 'model_name' },
        ordering: { type: 'string', const: 'bucket_time asc' },
      },
    },
    dataSources: [projectionSource(TOPICS.llmCost)],
    events: { emits: [], consumes: [{ name: 'time_range_changed' }] },
    defaultSize: { w: 8, h: 5 },
    minSize: { w: 4, h: 3 },
    maxSize: { w: 12, h: 10 },
    emptyState: { message: 'No cost data available', hint: 'Cost data appears after LLM calls are tracked' },
    capabilities: { supports_compare: false, supports_export: true, supports_fullscreen: true, supports_time_range: true },
  },
  'cost-by-model': {
    name: 'cost-by-model',
    displayName: 'Cost by Model',
    description: 'LLM cost share per model over the selected time range; dimension config switches between 2D bars and tilted 3D pie',
    category: 'cost',
    version: '2.0.0',
    implementationKey: 'cost-by-model/CostByModel',
    configSchema: {
      type: 'object',
      properties: {
        dimension: {
          type: 'string',
          enum: ['2d', '3d'],
          default: '2d',
          title: 'Dimension',
          description: 'Render as 2D bars or a tilted 3D pie chart.',
        },
      },
      additionalProperties: false,
    },
    dataSources: [projectionSource(TOPICS.llmCost)],
    events: { emits: [], consumes: [{ name: 'time_range_changed' }] },
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 3, h: 3 },
    maxSize: { w: 12, h: 8 },
    emptyState: { message: 'No cost data available', hint: 'Cost data appears after LLM calls are tracked' },
    capabilities: { supports_compare: false, supports_export: true, supports_fullscreen: true, supports_time_range: true },
  },
  /**
   * Cost by repo — horizontal bar chart, one bar per repository.
   *
   * UPSTREAM BLOCKED: The `repo_name` column does NOT exist in `llm_cost_aggregates`
   * (omnibase_infra migration 031:142 has only generic `aggregation_key`). Until upstream
   * resolves — either a new migration adding `repo_name` OR standardizing on
   * `aggregation_key` encoding `repo:<name>` — this widget renders the `upstream-blocked`
   * empty state. The manifest and projectionSchema ship now so the contract is in place;
   * the rendering path is unblocked when upstream fills the gap.
   *
   * @see OMN-10302 — https://linear.app/omninode/issue/OMN-10302
   * @see omnibase_infra migration 031:142 for the `aggregation_key`-only schema
   */
  'cost-by-repo': {
    name: 'cost-by-repo',
    displayName: 'Cost by Repo',
    description:
      'LLM cost per repository as a horizontal bar chart; bars sorted by cost descending. Upstream-blocked until repo_name column is added (omnibase_infra migration 031:142).',
    category: 'cost',
    version: '1.0.0',
    // Routes through the adapter resolver: IBarChartAdapter → BarChartThreeJs.
    implementationKey: 'IBarChartAdapter/threejs',
    configSchema: {
      type: 'object',
      properties: {
        fieldMappings: {
          type: 'object',
          properties: {
            x: { type: 'string', const: 'repo_name' },
            y: { type: 'string', const: 'total_cost_usd' },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    // Row shape expected from onex.snapshot.projection.cost.by_repo.v1.
    // UPSTREAM BLOCKED: repo_name column absent (omnibase_infra migration 031:142).
    // Assumption: upstream adds `repo_name STRING` OR decodes from `aggregation_key`
    // using `repo:<name>` encoding. Either resolution unblocks this widget.
    // ordering authority: total_cost_usd, descending (highest-cost repo first).
    projectionSchema: {
      type: 'object',
      required: ['repo_name', 'total_cost_usd', 'window'],
      properties: {
        repo_name: {
          type: 'string',
          description:
            'Repository name. UPSTREAM BLOCKED: column absent from llm_cost_aggregates (migration 031:142). ' +
            'Populated once upstream adds repo_name OR decodes from aggregation_key encoding repo:<name>.',
        },
        total_cost_usd: {
          type: 'number',
          description: 'Total LLM cost in USD for this repository over the projection window.',
        },
        window: {
          type: 'string',
          description: 'Aggregation window identifier (e.g. "7d", "30d").',
        },
      },
      'x-orderingAuthority': {
        authority: 'aggregation_key',
        fieldName: 'total_cost_usd',
        direction: 'desc',
      },
    },
    // Rendered output contract for Playwright assertions (OMN-7093).
    displayContract: {
      description:
        'Horizontal bar per repo, x-axis = repo_name, y-axis = total_cost_usd in USD, bars sorted by cost descending. ' +
        'Upstream-blocked empty state rendered until repo_name column exists in the projection.',
      type: 'object',
      properties: {
        chartType: { type: 'string', const: 'bar' },
        orientation: { type: 'string', const: 'horizontal' },
        xAxis: { type: 'string', const: 'repo_name' },
        yAxis: { type: 'string', const: 'total_cost_usd' },
        ordering: { type: 'string', const: 'total_cost_usd desc' },
      },
    },
    dataSources: [projectionSource(TOPICS.costByRepo)],
    events: { emits: [], consumes: [{ name: 'time_range_changed' }] },
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 3, h: 3 },
    maxSize: { w: 12, h: 8 },
    emptyState: {
      message: 'No cost-by-repo data available',
      hint: 'Cost by repository appears after repo_name is populated upstream',
      reasons: {
        'no-data': {
          message: 'No cost records yet — cost-by-repo data appears after LLM calls are tracked.',
        },
        'upstream-blocked': {
          message:
            'repo_name column is absent from llm_cost_aggregates (omnibase_infra migration 031:142). ' +
            'Widget renders once upstream adds repo_name or standardises on aggregation_key encoding.',
          cta: 'See OMN-10302',
        },
      },
    },
    capabilities: {
      supports_compare: false,
      supports_export: true,
      supports_fullscreen: true,
      supports_time_range: true,
    },
  },
  'delegation-metrics': {
    name: 'delegation-metrics',
    displayName: 'Delegation Metrics',
    description: 'Task delegation events, cost savings, and quality gate pass rates; dimension config switches between flat 2D donut and tilted 3D doughnut',
    category: 'quality',
    version: '2.0.0',
    implementationKey: 'delegation/DelegationMetrics',
    configSchema: {
      type: 'object',
      properties: {
        dimension: {
          type: 'string',
          enum: ['2d', '3d'],
          default: '2d',
          title: 'Dimension',
          description: 'Render as a flat 2D SVG donut or a tilted 3D doughnut scene.',
        },
        showSavings: { type: 'boolean', default: true },
        showQualityGates: { type: 'boolean', default: true },
        qualityGateThreshold: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          default: 0.8,
          title: 'Quality gate threshold',
          description:
            'Pass-rate at or above which the Quality Gate Pass Rate stat reads green. Below this, it reads warn-amber.',
        },
      },
      additionalProperties: false,
    },
    dataSources: [
      projectionSource(TOPICS.delegationSummary),
      liveSource(TOPICS.delegationSummary),
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
      projectionSource(TOPICS.delegationDecisions),
      liveSource(TOPICS.delegationDecisions),
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
      projectionSource(TOPICS.baselinesRoi),
      liveSource(TOPICS.baselinesRoi),
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
    description: 'Pattern quality score distribution with pass-rate headline and tier-coloured bars; dimension config switches between flat 2D histogram and tilted 3D bars',
    category: 'quality',
    version: '2.0.0',
    implementationKey: 'quality/QualityScore',
    configSchema: {
      type: 'object',
      properties: {
        dimension: {
          type: 'string',
          enum: ['2d', '3d'],
          default: '3d',
          title: 'Dimension',
          description: 'Render as a flat 2D histogram or a tilted 3D bar chart.',
        },
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
    dataSources: [projectionSource(TOPICS.baselinesQuality)],
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
    dataSources: [projectionSource(TOPICS.overnightReadiness)],
    events: { emits: [{ name: 'dimension_selected' }], consumes: [] },
    defaultSize: { w: 12, h: 4 },
    minSize: { w: 6, h: 3 },
    maxSize: { w: 12, h: 6 },
    emptyState: { message: 'No readiness data', hint: 'Run the platform readiness gate to see results' },
    capabilities: { supports_compare: false, supports_export: true, supports_fullscreen: false, supports_time_range: false },
  },
  'cost-summary': {
    name: 'cost-summary',
    displayName: 'Cost Summary',
    description: 'KPI tile cluster showing aggregate LLM spend: total cost, total savings, and total tokens over the current window; dispatched to IKPITileClusterAdapter (impl: threejs)',
    category: 'cost',
    version: '1.0.0',
    // Routes through the adapter resolver: IKPITileClusterAdapter → KPITileClusterThreeJs.
    implementationKey: 'IKPITileClusterAdapter/threejs',
    configSchema: {
      type: 'object',
      properties: {
        tiles: {
          type: 'array',
          description: 'Per-tile metric configurations: field, label, format, and optional per-tile emptyState.',
          items: {
            type: 'object',
            required: ['field', 'label'],
            properties: {
              field: { type: 'string', description: 'Projection row field name.' },
              label: { type: 'string', description: 'Human-readable tile label.' },
              format: { type: 'string', description: 'Optional d3-compatible format string.' },
            },
          },
          default: [
            { field: 'total_cost_usd', label: 'Total Cost', format: '$,.2f' },
            { field: 'total_savings_usd', label: 'Total Savings', format: '$,.2f' },
            { field: 'total_tokens', label: 'Total Tokens', format: ',d' },
          ],
        },
      },
      additionalProperties: false,
    },
    // Row shape emitted by onex.snapshot.projection.cost.summary.v1.
    // Upstream-blocked: omnimarket emitter + omnibase_infra projection table not yet wired.
    // ordering authority: captured_at, monotonic descending (latest window first).
    projectionSchema: {
      type: 'object',
      required: ['window', 'total_cost_usd', 'total_savings_usd', 'total_tokens', 'captured_at'],
      properties: {
        window: {
          type: 'string',
          enum: ['24h', '7d', '30d'],
          description: 'Aggregation window for this cost summary row.',
        },
        total_cost_usd: {
          type: 'number',
          description: 'Total LLM spend in USD for the window.',
        },
        total_savings_usd: {
          type: 'number',
          description: 'Total cost savings in USD for the window (e.g. from routing to cheaper models).',
        },
        total_tokens: {
          type: 'number',
          description: 'Total tokens consumed across all models for the window.',
        },
        captured_at: {
          type: 'string',
          format: 'date-time',
          description: 'ISO-8601 timestamp when this projection row was materialized. Ordering authority: monotonic descending.',
        },
      },
      'x-orderingAuthority': {
        authority: 'monotonic_field',
        fieldName: 'captured_at',
        direction: 'desc',
        clockSemantics: 'UTC',
      },
    },
    // Rendered output contract for Playwright assertions (OMN-7093).
    displayContract: {
      description: 'KPI tile cluster with 3 tiles: total cost (currency USD), total savings (currency USD), total tokens (count). Honest-null per tile when projection field missing.',
      type: 'object',
      properties: {
        tileCount: { type: 'number', const: 3 },
        tiles: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              format: { type: 'string', enum: ['currency:USD', 'count'] },
            },
          },
        },
      },
    },
    dataSources: [projectionSource(TOPICS.costSummary)],
    events: { emits: [], consumes: [{ name: 'time_range_changed' }] },
    defaultSize: { w: 12, h: 3 },
    minSize: { w: 6, h: 2 },
    maxSize: { w: 12, h: 4 },
    // ComponentManifest.emptyState is the widget palette display message.
    // Detailed per-reason empty states are in the adapter (CostSummaryAdapter.tsx).
    emptyState: { message: 'No cost summary data', hint: 'Cost summary appears after LLM calls are tracked. Projection is upstream-blocked until omnimarket emitter lands.' },
    capabilities: { supports_compare: false, supports_export: true, supports_fullscreen: false, supports_time_range: false },
  },
  'token-usage': {
    name: 'token-usage',
    displayName: 'Token Usage',
    description: 'Total token consumption over time as a stacked area trend; dispatched to ITrendChartAdapter (impl: threejs). Upstream blocked: omnimarket emitter + omnibase_infra snapshot path missing.',
    category: 'cost',
    version: '1.0.0',
    implementationKey: 'ITrendChartAdapter/threejs',
    configSchema: {
      type: 'object',
      properties: {
        fieldMappings: {
          type: 'object',
          properties: {
            x: { type: 'string', const: 'bucket_time' },
            y: { type: 'string', const: 'total_tokens' },
            granularity: { type: 'string', enum: ['hour', 'day', 'week'], default: 'hour' },
          },
          required: ['x', 'y', 'granularity'],
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    // Row shape emitted by onex.snapshot.projection.cost.token_usage.v1.
    // ordering authority: bucket_time, monotonic ascending, UTC clock semantics.
    projectionSchema: {
      type: 'object',
      required: ['bucket_time', 'total_tokens'],
      properties: {
        bucket_time: {
          type: 'string',
          format: 'date-time',
          description: 'ISO-8601 time bucket start (UTC). Ordering authority: monotonic ascending.',
        },
        total_tokens: {
          type: 'number',
          description: 'Total tokens consumed in this bucket across all models.',
        },
        model_name: {
          type: 'string',
          description: 'Optional LLM model identifier for multi-series breakdown.',
        },
      },
      'x-orderingAuthority': {
        authority: 'bucket_time',
        fieldName: 'bucket_time',
        direction: 'asc',
        clockSemantics: 'UTC',
      },
    },
    // Rendered output contract for Playwright assertions (OMN-7093).
    displayContract: {
      description: 'Stacked area chart over time. x-axis = bucket_time ascending at configured granularity (default: hour), UTC. y-axis = total_tokens. Optional series = model_name. Honest-null when no buckets.',
      type: 'object',
      properties: {
        chartType: { type: 'string', const: 'area' },
        xAxis: { type: 'string', const: 'bucket_time' },
        yAxis: { type: 'string', const: 'total_tokens' },
        series: { type: 'string', const: 'model_name' },
        ordering: { type: 'string', const: 'bucket_time asc UTC' },
      },
    },
    dataSources: [projectionSource(TOPICS.costTokenUsage)],
    events: { emits: [], consumes: [{ name: 'time_range_changed' }] },
    defaultSize: { w: 8, h: 5 },
    minSize: { w: 4, h: 3 },
    maxSize: { w: 12, h: 10 },
    emptyState: {
      message: 'No token usage data available',
      hint: 'Token usage data appears after LLM calls are tracked.',
      reasons: {
        'no-data': { message: 'No token usage buckets emitted for the selected time range.' },
        'upstream-blocked': { message: 'Token usage emitter not yet wired: total_tokens BIGINT exists in llm_cost_aggregates (migration 031:147) but the omnimarket emitter and snapshot path are not running.', cta: 'See OMN-10303' },
      },
    },
    capabilities: { supports_compare: false, supports_export: true, supports_fullscreen: true, supports_time_range: true },
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
      projectionSource(TOPICS.registration),
      liveSource(TOPICS.registration, true),
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

// T16 (OMN-157): generator-time check that every manifest is structurally
// complete. Dashboard-v2 dataSources must target projection/event-bus topics;
// arbitrary REST endpoints are not a valid data path.
const validationFailures: string[] = [];
for (const [name, m] of Object.entries(mergedComponents)) {
  const result = validateComponentManifest(m);
  if (!result.valid) {
    validationFailures.push(`  ${name}: ${result.errors.join('; ')}`);
  }
}
if (validationFailures.length > 0) {
  console.error('[registry] manifest validation failed:');
  for (const line of validationFailures) console.error(line);
  process.exit(1);
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
