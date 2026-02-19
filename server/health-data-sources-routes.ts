/**
 * Data Source Health Routes (OMN-2307)
 *
 * Exposes GET /api/health/data-sources to report the live/mock status of every
 * dashboard data source. The endpoint probes each backing API (or projection)
 * to determine whether real data is available, then returns a structured
 * summary suitable for a pre-demo readiness check.
 *
 * Response shape:
 * {
 *   dataSources: {
 *     [key: string]: {
 *       status: "live" | "mock" | "error";
 *       reason?: string;   // present when status != "live"
 *       lastEvent?: string; // ISO timestamp, present when status == "live"
 *     }
 *   },
 *   summary: { live: number; mock: number; error: number },
 *   checkedAt: string; // ISO timestamp
 * }
 */

import { Router } from 'express';
import { projectionService } from './projection-bootstrap';
import type {
  ExtractionMetricsProjection,
  ExtractionMetricsPayload,
} from './projections/extraction-metrics-projection';
import type {
  EffectivenessMetricsProjection,
  EffectivenessMetricsPayload,
} from './projections/effectiveness-metrics-projection';
import type {
  CostMetricsProjection,
  CostMetricsPayload,
} from './projections/cost-metrics-projection';
import type { BaselinesProjection, BaselinesPayload } from './projections/baselines-projection';
import type { IntentProjectionPayload, NodeRegistryPayload } from '@shared/projection-types';
import type { EventBusPayload } from '@shared/event-bus-payload';

// ============================================================================
// Types
// ============================================================================

export type DataSourceStatus = 'live' | 'mock' | 'error';

export interface DataSourceInfo {
  status: DataSourceStatus;
  /** Present when status is 'mock' or 'error', describes why mock data is shown. */
  reason?: string;
  /** Present when status is 'live', ISO 8601 timestamp of the most recent real event. */
  lastEvent?: string;
}

export interface DataSourcesHealthResponse {
  dataSources: Record<string, DataSourceInfo>;
  summary: { live: number; mock: number; error: number };
  checkedAt: string;
}

// ============================================================================
// Individual probe functions
// ============================================================================

/**
 * Probe the event-bus projection.
 * Live if the projection has received at least one event.
 */
function probeEventBus(): DataSourceInfo {
  try {
    const view = projectionService.getView<EventBusPayload>('event-bus');
    if (!view) {
      return { status: 'mock', reason: 'no_projection_registered' };
    }
    const snapshot = view.getSnapshot();
    if (!snapshot) {
      return { status: 'mock', reason: 'empty_projection' };
    }
    const payload = snapshot.payload;
    if (!payload || payload.totalEventsIngested === 0) {
      return { status: 'mock', reason: 'no_events_ingested' };
    }
    // Use snapshotTimeMs (the time the snapshot was taken) as a proxy for lastEvent
    const lastEvent =
      snapshot.snapshotTimeMs != null ? new Date(snapshot.snapshotTimeMs).toISOString() : undefined;
    return { status: 'live', lastEvent };
  } catch {
    return { status: 'error', reason: 'probe_threw' };
  }
}

/**
 * Probe the effectiveness projection.
 * Live if the summary shows at least one session.
 */
function probeEffectiveness(): DataSourceInfo {
  try {
    const view = projectionService.getView<EffectivenessMetricsPayload>('effectiveness-metrics') as
      | EffectivenessMetricsProjection
      | undefined;
    if (!view) {
      return { status: 'mock', reason: 'no_projection_registered' };
    }
    const snapshot = view.getSnapshot();
    if (!snapshot) {
      return { status: 'mock', reason: 'empty_projection' };
    }
    const summary = snapshot.payload?.summary;
    if (!summary || summary.total_sessions === 0) {
      return { status: 'mock', reason: 'empty_tables' };
    }
    return { status: 'live' };
  } catch {
    return { status: 'error', reason: 'probe_threw' };
  }
}

/**
 * Probe the extraction-metrics projection.
 * Live if summary.last_event_at is not null (at least one row ever written).
 */
function probeExtraction(): DataSourceInfo {
  try {
    const view = projectionService.getView<ExtractionMetricsPayload>('extraction-metrics') as
      | ExtractionMetricsProjection
      | undefined;
    if (!view) {
      return { status: 'mock', reason: 'no_projection_registered' };
    }
    const snapshot = view.getSnapshot();
    if (!snapshot) {
      return { status: 'mock', reason: 'empty_projection' };
    }
    const summary = snapshot.payload?.summary;
    if (!summary || summary.last_event_at == null) {
      return { status: 'mock', reason: 'empty_tables' };
    }
    return { status: 'live', lastEvent: summary.last_event_at };
  } catch {
    return { status: 'error', reason: 'probe_threw' };
  }
}

/**
 * Probe the baselines projection.
 * Live if at least one comparison row exists (total_comparisons > 0).
 */
function probeBaselines(): DataSourceInfo {
  try {
    const view = projectionService.getView<BaselinesPayload>('baselines') as
      | BaselinesProjection
      | undefined;
    if (!view) {
      return { status: 'mock', reason: 'no_projection_registered' };
    }
    const snapshot = view.getSnapshot();
    if (!snapshot) {
      return { status: 'mock', reason: 'empty_projection' };
    }
    const baselines = snapshot.payload;
    if (!baselines || baselines.summary.total_comparisons === 0) {
      return { status: 'mock', reason: 'empty_tables' };
    }
    return { status: 'live' };
  } catch {
    return { status: 'error', reason: 'probe_threw' };
  }
}

/**
 * Probe the cost-metrics projection.
 * Live if session_count > 0 or total_tokens > 0.
 */
function probeCost(): DataSourceInfo {
  try {
    const view = projectionService.getView<CostMetricsPayload>('cost-metrics') as
      | CostMetricsProjection
      | undefined;
    if (!view) {
      return { status: 'mock', reason: 'no_projection_registered' };
    }
    const snapshot = view.getSnapshot();
    if (!snapshot) {
      return { status: 'mock', reason: 'empty_projection' };
    }
    const summary = snapshot.payload?.summary;
    if (!summary || (summary.session_count === 0 && summary.total_tokens === 0)) {
      return { status: 'mock', reason: 'empty_tables' };
    }
    return { status: 'live' };
  } catch {
    return { status: 'error', reason: 'probe_threw' };
  }
}

/**
 * Probe the intent projection.
 * Live if the projection has at least one classified intent.
 */
function probeIntents(): DataSourceInfo {
  try {
    const view = projectionService.getView<IntentProjectionPayload>('intent');
    if (!view) {
      return { status: 'mock', reason: 'no_projection_registered' };
    }
    const snapshot = view.getSnapshot();
    if (!snapshot) {
      return { status: 'mock', reason: 'empty_projection' };
    }
    const payload = snapshot.payload;
    if (!payload || payload.totalIntents === 0) {
      return { status: 'mock', reason: 'no_intents_classified' };
    }
    const lastEvent =
      payload.lastEventTimeMs != null ? new Date(payload.lastEventTimeMs).toISOString() : undefined;
    return { status: 'live', lastEvent };
  } catch {
    return { status: 'error', reason: 'probe_threw' };
  }
}

/**
 * Probe the node registry projection.
 * Live if at least one node is registered.
 */
function probeNodeRegistry(): DataSourceInfo {
  try {
    const view = projectionService.getView<NodeRegistryPayload>('node-registry');
    if (!view) {
      return { status: 'mock', reason: 'no_projection_registered' };
    }
    const snapshot = view.getSnapshot();
    if (!snapshot) {
      return { status: 'mock', reason: 'empty_projection' };
    }
    const payload = snapshot.payload;
    if (!payload || payload.stats.totalNodes === 0) {
      return { status: 'mock', reason: 'no_nodes_registered' };
    }
    return { status: 'live' };
  } catch {
    return { status: 'error', reason: 'probe_threw' };
  }
}

/**
 * Probe the validation API endpoint (HTTP GET /api/validation/summary).
 * We probe the local endpoint to stay consistent with the client source pattern.
 */
async function probeValidation(baseUrl: string): Promise<DataSourceInfo> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${baseUrl}/api/validation/summary`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) {
      return { status: 'error', reason: `http_${response.status}` };
    }
    const data = await response.json();
    if (!data || data.total_runs === 0) {
      return { status: 'mock', reason: 'empty_tables' };
    }
    return { status: 'live' };
  } catch {
    return { status: 'error', reason: 'api_unavailable' };
  }
}

/**
 * Probe the insights API endpoint (HTTP GET /api/insights/summary).
 */
async function probeInsights(baseUrl: string): Promise<DataSourceInfo> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${baseUrl}/api/insights/summary`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) {
      return { status: 'error', reason: `http_${response.status}` };
    }
    const data = await response.json();
    if (!data || !Array.isArray(data.insights) || data.insights.length === 0) {
      return { status: 'mock', reason: 'empty_tables' };
    }
    return { status: 'live' };
  } catch {
    return { status: 'error', reason: 'api_unavailable' };
  }
}

/**
 * Probe the pattern learning (patlearn) API endpoint.
 */
async function probePatterns(baseUrl: string): Promise<DataSourceInfo> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(
      `${baseUrl}/api/intelligence/patterns/patlearn/summary?window=24h`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!response.ok) {
      return { status: 'error', reason: `http_${response.status}` };
    }
    const data = await response.json();
    if (!data || (data.total_patterns == null ? true : data.total_patterns === 0)) {
      return { status: 'mock', reason: 'empty_tables' };
    }
    return { status: 'live' };
  } catch {
    return { status: 'error', reason: 'api_unavailable' };
  }
}

/**
 * Probe the execution graph API endpoint (OMN-2302).
 */
async function probeExecutionGraph(baseUrl: string): Promise<DataSourceInfo> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${baseUrl}/api/executions/graph`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) {
      return { status: 'error', reason: `http_${response.status}` };
    }
    const data = await response.json();
    if (!data || (Array.isArray(data.nodes) && data.nodes.length === 0)) {
      return { status: 'mock', reason: 'no_execution_data' };
    }
    return { status: 'live' };
  } catch {
    return { status: 'error', reason: 'api_unavailable' };
  }
}

/**
 * Probe the enforcement routes (OMN-2275).
 */
async function probeEnforcement(baseUrl: string): Promise<DataSourceInfo> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${baseUrl}/api/enforcement/summary?window=7d`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) {
      return { status: 'error', reason: `http_${response.status}` };
    }
    const data = await response.json();
    if (!data || data.total_evaluations === 0) {
      return { status: 'mock', reason: 'empty_tables' };
    }
    return { status: 'live' };
  } catch {
    return { status: 'error', reason: 'api_unavailable' };
  }
}

/**
 * Probe the correlation trace source.
 * The client-side CorrelationTrace page uses a USE_MOCK_DATA constant.
 * We probe the /api/projections/event-bus/snapshot endpoint that backs it.
 */
function probeCorrelationTrace(): DataSourceInfo {
  // CorrelationTrace reads from the event-bus projection.
  // If the event-bus is live, trace data is also live.
  return probeEventBus();
}

// ============================================================================
// Router
// ============================================================================

const router = Router();

/**
 * GET /api/health/data-sources
 *
 * Returns a snapshot of every dashboard data source reporting whether it is
 * currently using live data or falling back to mock/demo data.
 */
router.get('/data-sources', async (req, res) => {
  // Derive the base URL for self-probing HTTP endpoints from the incoming request.
  // Uses localhost to avoid DNS lookup overhead; the port is read from the env.
  const port = process.env.PORT ?? '3000';
  const baseUrl = `http://localhost:${port}`;

  // Run projection-based probes synchronously and HTTP-based probes in parallel.
  const [validation, insights, patterns, executionGraph, enforcement] = await Promise.all([
    probeValidation(baseUrl),
    probeInsights(baseUrl),
    probePatterns(baseUrl),
    probeExecutionGraph(baseUrl),
    probeEnforcement(baseUrl),
  ]);

  const dataSources: Record<string, DataSourceInfo> = {
    eventBus: probeEventBus(),
    effectiveness: probeEffectiveness(),
    extraction: probeExtraction(),
    baselines: probeBaselines(),
    costTrends: probeCost(),
    intents: probeIntents(),
    nodeRegistry: probeNodeRegistry(),
    correlationTrace: probeCorrelationTrace(),
    validation,
    insights,
    patterns,
    executionGraph,
    enforcement,
  };

  const counts = Object.values(dataSources).reduce(
    (acc, info) => {
      acc[info.status] = (acc[info.status] ?? 0) + 1;
      return acc;
    },
    { live: 0, mock: 0, error: 0 } as { live: number; mock: number; error: number }
  );

  const body: DataSourcesHealthResponse = {
    dataSources,
    summary: counts,
    checkedAt: new Date().toISOString(),
  };

  res.json(body);
});

export default router;
