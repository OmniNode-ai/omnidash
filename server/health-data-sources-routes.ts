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
import { tryGetIntelligenceDb } from './storage';
import { validationRuns, patternLearningArtifacts } from '@shared/intelligence-schema';
import { sql } from 'drizzle-orm';
import { queryInsightsSummary } from './insight-queries';
import { getEventBusDataSource } from './event-bus-data-source';

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
 * Probe the validation data source by querying the database directly.
 * Live if at least one validation run exists (total_runs > 0).
 */
async function probeValidation(): Promise<DataSourceInfo> {
  try {
    const db = tryGetIntelligenceDb();
    if (!db) {
      return { status: 'mock', reason: 'no_db_connection' };
    }
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(validationRuns);
    const totalRuns = result[0]?.count ?? 0;
    if (totalRuns === 0) {
      return { status: 'mock', reason: 'empty_tables' };
    }
    return { status: 'live' };
  } catch {
    return { status: 'error', reason: 'probe_threw' };
  }
}

/**
 * Probe the insights data source by querying the database directly via the
 * shared query function. Live if at least one insight exists.
 */
async function probeInsights(): Promise<DataSourceInfo> {
  try {
    const summary = await queryInsightsSummary();
    // null means queryInsightsSummary found no DB connection (mirrors
    // tryGetIntelligenceDb returning null internally) — it does NOT mean the
    // DB is reachable but empty.
    if (summary === null) {
      return { status: 'mock', reason: 'no_db_connection' };
    }
    if (!Array.isArray(summary.insights) || summary.insights.length === 0) {
      return { status: 'mock', reason: 'empty_tables' };
    }
    return { status: 'live' };
  } catch {
    return { status: 'error', reason: 'probe_threw' };
  }
}

/**
 * Probe the pattern learning (patlearn) data source by querying the database
 * directly. Live if at least one pattern artifact exists.
 */
async function probePatterns(): Promise<DataSourceInfo> {
  try {
    const db = tryGetIntelligenceDb();
    if (!db) {
      return { status: 'mock', reason: 'no_db_connection' };
    }
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(patternLearningArtifacts);
    const totalPatterns = result[0]?.count ?? 0;
    if (totalPatterns === 0) {
      return { status: 'mock', reason: 'empty_tables' };
    }
    return { status: 'live' };
  } catch {
    return { status: 'error', reason: 'probe_threw' };
  }
}

/**
 * Probe the execution graph data source via the EventBusDataSource directly.
 * Live if at least one execution event has been stored.
 */
async function probeExecutionGraph(): Promise<DataSourceInfo> {
  try {
    const dataSource = getEventBusDataSource();
    if (!dataSource) {
      return { status: 'mock', reason: 'no_projection_registered' };
    }
    const rawEvents = await dataSource.queryEvents({
      event_types: [
        'agent-actions',
        'agent-routing-decisions',
        'agent-transformation-events',
        'AGENT_ACTION',
        'ROUTING_DECISION',
        'AGENT_TRANSFORMATION',
      ],
      limit: 1,
      order_by: 'timestamp',
      order_direction: 'desc',
    });
    if (!rawEvents || rawEvents.length === 0) {
      return { status: 'mock', reason: 'no_execution_data' };
    }
    return { status: 'live' };
  } catch {
    return { status: 'error', reason: 'probe_threw' };
  }
}

/**
 * Probe the enforcement data source.
 * The enforcement projection is not yet implemented (OMN-2275 follow-up),
 * so this always returns mock until the projection is wired up.
 */
function probeEnforcement(): DataSourceInfo {
  // The enforcement-routes.ts handler always returns total_evaluations: 0
  // because the upstream projection is not yet implemented (see enforcement-routes.ts
  // TODO comments referencing OMN-2275-followup). Return mock directly rather
  // than making an HTTP round-trip to confirm the zero.
  return { status: 'mock', reason: 'empty_tables' };
}

// ============================================================================
// Router
// ============================================================================

const router = Router();

// Module-level TTL cache (30 s). Intentionally shared across all requests in
// the same process — there is no per-request or data-change invalidation. If
// upstream data changes mid-TTL, the cached response will be stale until
// expiry. This is acceptable: data source status changes infrequently and the
// 30 s window keeps the panel responsive during demos without hammering the DB.
let healthCache: { result: DataSourcesHealthResponse; expiresAt: number } | null = null;

/**
 * Clear the health cache. Exported for use in tests to prevent cache leakage
 * between test cases that run in the same process.
 */
export function clearHealthCache(): void {
  healthCache = null;
}

/**
 * GET /api/health/data-sources
 *
 * Returns a snapshot of every dashboard data source reporting whether it is
 * currently using live data or falling back to mock/demo data.
 */
router.get('/data-sources', async (_req, res) => {
  try {
    // Serve cached result if still fresh.
    if (healthCache && Date.now() < healthCache.expiresAt) {
      res.json(healthCache.result);
      return;
    }

    // Run all probes in parallel. Projection-based probes are synchronous;
    // DB-based probes are async. All are called directly without HTTP self-calls.
    const [validation, insights, patterns, executionGraph, enforcement] = await Promise.all([
      probeValidation(),
      probeInsights(),
      probePatterns(),
      probeExecutionGraph(),
      probeEnforcement(),
    ]);

    // Probe the event bus once and reuse the result for correlationTrace, which
    // derives its live/mock status from the same event-bus projection.
    const eventBus = probeEventBus();

    const dataSources: Record<string, DataSourceInfo> = {
      eventBus,
      effectiveness: probeEffectiveness(),
      extraction: probeExtraction(),
      baselines: probeBaselines(),
      costTrends: probeCost(),
      intents: probeIntents(),
      nodeRegistry: probeNodeRegistry(),
      correlationTrace: { ...eventBus },
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

    healthCache = { result: body, expiresAt: Date.now() + 30_000 };

    res.json(body);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
