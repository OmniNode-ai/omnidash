/**
 * Extraction Pipeline API Routes (OMN-1804)
 *
 * REST endpoints for querying pattern extraction pipeline metrics.
 * All endpoints query PostgreSQL directly (single source of truth).
 * Empty-safe: returns zero/empty defaults when tables have no data.
 *
 * @see OMN-1804 - OBS-002: Pattern extraction metrics and dashboard
 */

import { Router } from 'express';
import { sql, desc, gte, eq } from 'drizzle-orm';
import { tryGetIntelligenceDb } from './storage';
import {
  injectionEffectiveness,
  latencyBreakdowns,
  patternHitRates,
} from '@shared/intelligence-schema';
import type {
  ExtractionSummary,
  PipelineHealthResponse,
  LatencyHeatmapResponse,
  LatencyBucket,
  PatternVolumeResponse,
  PatternVolumePoint,
  ErrorRatesSummaryResponse,
  ErrorRateEntry,
} from '@shared/extraction-types';

const router = Router();

// ============================================================================
// Helpers
// ============================================================================

/** Parse a time window string (e.g. '24h', '7d') into a Date cutoff. */
function parseWindow(window: string): Date {
  const now = Date.now();
  const match = window.match(/^(\d+)(h|d)$/);
  if (!match) {
    // Default to 24 hours
    return new Date(now - 24 * 60 * 60 * 1000);
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const ms = unit === 'd' ? value * 24 * 60 * 60 * 1000 : value * 60 * 60 * 1000;
  return new Date(now - ms);
}

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/extraction/summary
 * High-level stats for the metric cards row.
 */
router.get('/summary', async (_req, res) => {
  try {
    const db = tryGetIntelligenceDb();
    if (!db) {
      const empty: ExtractionSummary = {
        total_injections: 0,
        total_patterns_matched: 0,
        avg_utilization_score: null,
        avg_latency_ms: null,
        success_rate: null,
        last_event_at: null,
      };
      return res.json(empty);
    }

    // Total injections
    const injCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(injectionEffectiveness);
    const totalInjections = injCount[0]?.count ?? 0;

    // Total distinct patterns matched
    const patCount = await db
      .select({ count: sql<number>`count(DISTINCT ${patternHitRates.patternId})::int` })
      .from(patternHitRates);
    const totalPatternsMatched = patCount[0]?.count ?? 0;

    // Avg utilization score
    const avgUtil = await db
      .select({
        avg: sql<string | null>`avg(${injectionEffectiveness.utilizationScore})`,
      })
      .from(injectionEffectiveness);
    const avgUtilizationScore = avgUtil[0]?.avg ? parseFloat(avgUtil[0].avg) : null;

    // Avg latency
    const avgLat = await db
      .select({
        avg: sql<string | null>`avg(${latencyBreakdowns.userVisibleLatencyMs})`,
      })
      .from(latencyBreakdowns);
    const avgLatencyMs = avgLat[0]?.avg ? parseFloat(avgLat[0].avg) : null;

    // Success rate
    let successRate: number | null = null;
    if (totalInjections > 0) {
      const succCount = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(injectionEffectiveness)
        .where(eq(injectionEffectiveness.outcome, 'success'));
      successRate = (succCount[0]?.count ?? 0) / totalInjections;
    }

    // Last event timestamp
    const lastEvt = await db
      .select({ ts: sql<string | null>`max(${injectionEffectiveness.createdAt})` })
      .from(injectionEffectiveness);
    const lastEventAt = lastEvt[0]?.ts ?? null;

    const summary: ExtractionSummary = {
      total_injections: totalInjections,
      total_patterns_matched: totalPatternsMatched,
      avg_utilization_score: avgUtilizationScore,
      avg_latency_ms: avgLatencyMs,
      success_rate: successRate,
      last_event_at: lastEventAt,
    };

    res.json(summary);
  } catch (error) {
    console.error('[extraction] Error getting summary:', error);
    res.status(500).json({ error: 'Failed to get extraction summary' });
  }
});

/**
 * GET /api/extraction/health/pipeline
 * Pipeline health grouped by stage.
 */
router.get('/health/pipeline', async (_req, res) => {
  try {
    const db = tryGetIntelligenceDb();
    if (!db) {
      return res.json({ stages: [] } satisfies PipelineHealthResponse);
    }

    const rows = await db
      .select({
        stage: injectionEffectiveness.stage,
        total_events: sql<number>`count(*)::int`,
        success_count: sql<number>`count(*) FILTER (WHERE ${injectionEffectiveness.outcome} = 'success')::int`,
        failure_count: sql<number>`count(*) FILTER (WHERE ${injectionEffectiveness.outcome} != 'success')::int`,
        avg_latency_ms: sql<string | null>`avg(${injectionEffectiveness.userVisibleLatencyMs})`,
      })
      .from(injectionEffectiveness)
      .groupBy(injectionEffectiveness.stage);

    const stages = rows.map((r) => ({
      stage: r.stage ?? 'unknown',
      total_events: r.total_events,
      success_count: r.success_count,
      failure_count: r.failure_count,
      success_rate: r.total_events > 0 ? r.success_count / r.total_events : 0,
      avg_latency_ms: r.avg_latency_ms ? parseFloat(r.avg_latency_ms) : null,
    }));

    res.json({ stages } satisfies PipelineHealthResponse);
  } catch (error) {
    console.error('[extraction] Error getting pipeline health:', error);
    res.status(500).json({ error: 'Failed to get pipeline health' });
  }
});

/**
 * GET /api/extraction/latency/heatmap?window=24h
 * Latency percentiles by stage and time bucket.
 */
router.get('/latency/heatmap', async (req, res) => {
  try {
    const db = tryGetIntelligenceDb();
    const windowParam = (req.query.window as string) || '24h';
    const cutoff = parseWindow(windowParam);

    if (!db) {
      return res.json({ buckets: [], window: windowParam } satisfies LatencyHeatmapResponse);
    }

    // Determine bucket interval based on window size
    const bucketInterval = windowParam.endsWith('d') ? '1 day' : '1 hour';

    const rows = await db
      .select({
        bucket: sql<string>`date_trunc(${sql.raw(`'${bucketInterval === '1 day' ? 'day' : 'hour'}'`)}, ${latencyBreakdowns.createdAt})::text`,
        p50: sql<
          string | null
        >`percentile_cont(0.5) WITHIN GROUP (ORDER BY ${latencyBreakdowns.userVisibleLatencyMs})`,
        p95: sql<
          string | null
        >`percentile_cont(0.95) WITHIN GROUP (ORDER BY ${latencyBreakdowns.userVisibleLatencyMs})`,
        p99: sql<
          string | null
        >`percentile_cont(0.99) WITHIN GROUP (ORDER BY ${latencyBreakdowns.userVisibleLatencyMs})`,
        sample_count: sql<number>`count(*)::int`,
      })
      .from(latencyBreakdowns)
      .where(gte(latencyBreakdowns.createdAt, cutoff))
      .groupBy(
        sql`date_trunc(${sql.raw(`'${bucketInterval === '1 day' ? 'day' : 'hour'}'`)}, ${latencyBreakdowns.createdAt})`
      )
      .orderBy(
        sql`date_trunc(${sql.raw(`'${bucketInterval === '1 day' ? 'day' : 'hour'}'`)}, ${latencyBreakdowns.createdAt})`
      );

    const buckets: LatencyBucket[] = rows.map((r) => ({
      bucket: r.bucket ?? '',
      stage: 'overall',
      p50: r.p50 ? parseFloat(r.p50) : null,
      p95: r.p95 ? parseFloat(r.p95) : null,
      p99: r.p99 ? parseFloat(r.p99) : null,
      sample_count: r.sample_count,
    }));

    res.json({ buckets, window: windowParam } satisfies LatencyHeatmapResponse);
  } catch (error) {
    console.error('[extraction] Error getting latency heatmap:', error);
    res.status(500).json({ error: 'Failed to get latency heatmap' });
  }
});

/**
 * GET /api/extraction/patterns/volume?window=24h
 * Pattern matches and injections over time.
 */
router.get('/patterns/volume', async (req, res) => {
  try {
    const db = tryGetIntelligenceDb();
    const windowParam = (req.query.window as string) || '24h';
    const cutoff = parseWindow(windowParam);

    if (!db) {
      return res.json({ points: [], window: windowParam } satisfies PatternVolumeResponse);
    }

    const bucketInterval = windowParam.endsWith('d') ? 'day' : 'hour';

    // Pattern hits per bucket
    const patternRows = await db
      .select({
        bucket: sql<string>`date_trunc(${sql.raw(`'${bucketInterval}'`)}, ${patternHitRates.createdAt})::text`,
        patterns_matched: sql<number>`count(DISTINCT ${patternHitRates.patternId})::int`,
      })
      .from(patternHitRates)
      .where(gte(patternHitRates.createdAt, cutoff))
      .groupBy(sql`date_trunc(${sql.raw(`'${bucketInterval}'`)}, ${patternHitRates.createdAt})`)
      .orderBy(sql`date_trunc(${sql.raw(`'${bucketInterval}'`)}, ${patternHitRates.createdAt})`);

    // Injections per bucket
    const injectionRows = await db
      .select({
        bucket: sql<string>`date_trunc(${sql.raw(`'${bucketInterval}'`)}, ${injectionEffectiveness.createdAt})::text`,
        injections: sql<number>`count(*)::int`,
      })
      .from(injectionEffectiveness)
      .where(gte(injectionEffectiveness.createdAt, cutoff))
      .groupBy(
        sql`date_trunc(${sql.raw(`'${bucketInterval}'`)}, ${injectionEffectiveness.createdAt})`
      )
      .orderBy(
        sql`date_trunc(${sql.raw(`'${bucketInterval}'`)}, ${injectionEffectiveness.createdAt})`
      );

    // Merge by bucket
    const bucketMap = new Map<string, PatternVolumePoint>();
    for (const r of patternRows) {
      const key = r.bucket ?? '';
      bucketMap.set(key, { bucket: key, patterns_matched: r.patterns_matched, injections: 0 });
    }
    for (const r of injectionRows) {
      const key = r.bucket ?? '';
      const existing = bucketMap.get(key);
      if (existing) {
        existing.injections = r.injections;
      } else {
        bucketMap.set(key, { bucket: key, patterns_matched: 0, injections: r.injections });
      }
    }

    const points = Array.from(bucketMap.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));

    res.json({ points, window: windowParam } satisfies PatternVolumeResponse);
  } catch (error) {
    console.error('[extraction] Error getting pattern volume:', error);
    res.status(500).json({ error: 'Failed to get pattern volume' });
  }
});

/**
 * GET /api/extraction/errors/summary
 * Error rates by stage with recent error samples.
 */
router.get('/errors/summary', async (_req, res) => {
  try {
    const db = tryGetIntelligenceDb();
    if (!db) {
      const empty: ErrorRatesSummaryResponse = {
        entries: [],
        total_errors: 0,
        overall_error_rate: null,
      };
      return res.json(empty);
    }

    // Aggregate by stage
    const rows = await db
      .select({
        stage: injectionEffectiveness.stage,
        total_events: sql<number>`count(*)::int`,
        failure_count: sql<number>`count(*) FILTER (WHERE ${injectionEffectiveness.outcome} != 'success')::int`,
      })
      .from(injectionEffectiveness)
      .groupBy(injectionEffectiveness.stage);

    let totalErrors = 0;
    let totalEvents = 0;

    const entries: ErrorRateEntry[] = [];

    for (const r of rows) {
      totalErrors += r.failure_count;
      totalEvents += r.total_events;

      // Get recent error samples for this stage (max 5)
      const stageName = r.stage ?? 'unknown';
      const recentErrors = await db
        .select({
          sessionId: injectionEffectiveness.sessionId,
          createdAt: injectionEffectiveness.createdAt,
          metadata: injectionEffectiveness.metadata,
        })
        .from(injectionEffectiveness)
        .where(
          sql`${injectionEffectiveness.outcome} != 'success' AND coalesce(${injectionEffectiveness.stage}, 'unknown') = ${stageName}`
        )
        .orderBy(desc(injectionEffectiveness.createdAt))
        .limit(5);

      entries.push({
        stage: stageName,
        total_events: r.total_events,
        failure_count: r.failure_count,
        error_rate: r.total_events > 0 ? r.failure_count / r.total_events : 0,
        recent_errors: recentErrors.map((e) => ({
          session_id: e.sessionId,
          created_at: e.createdAt?.toISOString() ?? '',
          metadata: (e.metadata ?? {}) as Record<string, unknown>,
        })),
      });
    }

    const result: ErrorRatesSummaryResponse = {
      entries,
      total_errors: totalErrors,
      overall_error_rate: totalEvents > 0 ? totalErrors / totalEvents : null,
    };

    res.json(result);
  } catch (error) {
    console.error('[extraction] Error getting error rates:', error);
    res.status(500).json({ error: 'Failed to get error rates' });
  }
});

export default router;
