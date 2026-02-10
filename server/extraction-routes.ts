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
import { sql, gte } from 'drizzle-orm';
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

/** Maximum allowed window sizes to prevent expensive full-table scans. */
const MAX_WINDOW_DAYS = 365;
const MAX_WINDOW_HOURS = 8760; // 365 days in hours

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

  // Reject zero/negative values — they produce a cutoff of "now" returning zero rows
  if (value <= 0) {
    return new Date(now - 24 * 60 * 60 * 1000);
  }

  // Enforce maximum bounds to prevent expensive full-table scans
  if (unit === 'd' && value > MAX_WINDOW_DAYS) {
    return new Date(now - MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  }
  if (unit === 'h' && value > MAX_WINDOW_HOURS) {
    return new Date(now - MAX_WINDOW_HOURS * 60 * 60 * 1000);
  }

  const ms = unit === 'd' ? value * 24 * 60 * 60 * 1000 : value * 60 * 60 * 1000;
  return new Date(now - ms);
}

/**
 * Predefined SQL date_trunc precision fragments.
 * Avoids sql.raw() interpolation for bucket intervals.
 */
const TRUNC_DAY = sql`date_trunc('day'`;
const TRUNC_HOUR = sql`date_trunc('hour'`;

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

    // Single query using subselects to avoid 5 sequential round-trips.
    // Time-bounded to last 90 days to prevent full-table scans as tables grow.
    const cutoff90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const rows = await db.execute(sql`
      SELECT
        (SELECT count(*)::int FROM ${injectionEffectiveness}
         WHERE ${injectionEffectiveness.createdAt} >= ${cutoff90d}) AS total_injections,
        (SELECT count(DISTINCT ${patternHitRates.patternId})::int FROM ${patternHitRates}
         WHERE ${patternHitRates.createdAt} >= ${cutoff90d}) AS total_patterns_matched,
        (SELECT avg(${injectionEffectiveness.utilizationScore}) FROM ${injectionEffectiveness}
         WHERE ${injectionEffectiveness.createdAt} >= ${cutoff90d}) AS avg_utilization_score,
        (SELECT avg(${latencyBreakdowns.userVisibleLatencyMs}) FROM ${latencyBreakdowns}
         WHERE ${latencyBreakdowns.createdAt} >= ${cutoff90d}) AS avg_latency_ms,
        (SELECT count(*)::int FROM ${injectionEffectiveness}
         WHERE ${injectionEffectiveness.sessionOutcome} = 'success'
           AND ${injectionEffectiveness.createdAt} >= ${cutoff90d}) AS success_count,
        (SELECT max(${injectionEffectiveness.createdAt}) FROM ${injectionEffectiveness}) AS last_event_at
    `);

    const row = (rows.rows as Record<string, unknown>[])[0] ?? {};
    const totalInjections = (row.total_injections as number) ?? 0;
    const totalPatternsMatched = (row.total_patterns_matched as number) ?? 0;
    const rawAvgUtil = row.avg_utilization_score;
    const avgUtilizationScore = rawAvgUtil != null ? parseFloat(String(rawAvgUtil)) : null;
    const rawAvgLat = row.avg_latency_ms;
    const avgLatencyMs = rawAvgLat != null ? parseFloat(String(rawAvgLat)) : null;
    const successCount = (row.success_count as number) ?? 0;
    const successRate = totalInjections > 0 ? successCount / totalInjections : null;
    const lastEventAt = row.last_event_at != null ? String(row.last_event_at) : null;

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
 * Pipeline health grouped by cohort.
 */
router.get('/health/pipeline', async (_req, res) => {
  try {
    const db = tryGetIntelligenceDb();
    if (!db) {
      return res.json({ cohorts: [] } satisfies PipelineHealthResponse);
    }

    const rows = await db
      .select({
        cohort: injectionEffectiveness.cohort,
        total_events: sql<number>`count(*)::int`,
        success_count: sql<number>`count(*) FILTER (WHERE ${injectionEffectiveness.sessionOutcome} = 'success')::int`,
        failure_count: sql<number>`count(*) FILTER (WHERE ${injectionEffectiveness.sessionOutcome} IS NOT NULL AND ${injectionEffectiveness.sessionOutcome} != 'success')::int`,
        avg_latency_ms: sql<string | null>`avg(${injectionEffectiveness.userVisibleLatencyMs})`,
      })
      .from(injectionEffectiveness)
      .groupBy(injectionEffectiveness.cohort);

    const cohorts = rows.map((r) => ({
      cohort: r.cohort,
      total_events: r.total_events,
      success_count: r.success_count,
      failure_count: r.failure_count,
      success_rate: r.total_events > 0 ? r.success_count / r.total_events : 0,
      avg_latency_ms: r.avg_latency_ms ? parseFloat(r.avg_latency_ms) : null,
    }));

    res.json({ cohorts } satisfies PipelineHealthResponse);
  } catch (error) {
    console.error('[extraction] Error getting pipeline health:', error);
    res.status(500).json({ error: 'Failed to get pipeline health' });
  }
});

/**
 * GET /api/extraction/latency/heatmap?window=24h
 * Latency percentiles by time bucket.
 */
router.get('/latency/heatmap', async (req, res) => {
  try {
    const db = tryGetIntelligenceDb();
    const windowParam = (req.query.window as string) || '24h';
    const cutoff = parseWindow(windowParam);

    if (!db) {
      return res.json({ buckets: [], window: windowParam } satisfies LatencyHeatmapResponse);
    }

    // Determine date_trunc precision based on window size (safe SQL fragments, no sql.raw)
    const trunc = windowParam.endsWith('d') ? TRUNC_DAY : TRUNC_HOUR;
    const bucketExpr = sql`${trunc}, ${latencyBreakdowns.createdAt})`;

    const rows = await db
      .select({
        bucket: sql<string>`${bucketExpr}::text`,
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
      .groupBy(bucketExpr)
      .orderBy(bucketExpr);

    const buckets: LatencyBucket[] = rows.map((r) => ({
      bucket: r.bucket ?? '',
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

    // Determine date_trunc precision (safe SQL fragments, no sql.raw)
    const trunc = windowParam.endsWith('d') ? TRUNC_DAY : TRUNC_HOUR;
    const patternBucket = sql`${trunc}, ${patternHitRates.createdAt})`;
    const injectionBucket = sql`${trunc}, ${injectionEffectiveness.createdAt})`;

    // Pattern hits per bucket
    const patternRows = await db
      .select({
        bucket: sql<string>`${patternBucket}::text`,
        patterns_matched: sql<number>`count(DISTINCT ${patternHitRates.patternId})::int`,
      })
      .from(patternHitRates)
      .where(gte(patternHitRates.createdAt, cutoff))
      .groupBy(patternBucket)
      .orderBy(patternBucket);

    // Injections per bucket
    const injectionRows = await db
      .select({
        bucket: sql<string>`${injectionBucket}::text`,
        injections: sql<number>`count(*)::int`,
      })
      .from(injectionEffectiveness)
      .where(gte(injectionEffectiveness.createdAt, cutoff))
      .groupBy(injectionBucket)
      .orderBy(injectionBucket);

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
 * Error rates by cohort with recent error samples.
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

    // Aggregate by cohort
    const rows = await db
      .select({
        cohort: injectionEffectiveness.cohort,
        total_events: sql<number>`count(*)::int`,
        failure_count: sql<number>`count(*) FILTER (WHERE ${injectionEffectiveness.sessionOutcome} IS NOT NULL AND ${injectionEffectiveness.sessionOutcome} != 'success')::int`,
      })
      .from(injectionEffectiveness)
      .groupBy(injectionEffectiveness.cohort);

    let totalErrors = 0;
    let totalEvents = 0;

    // Fetch recent errors for ALL cohorts in a single query using a window
    // function to rank errors per cohort, then filter to top 5 per cohort.
    // This replaces the previous N+1 pattern (one query per cohort).
    // Cap cohort count to prevent unbounded IN-clause expansion.
    const MAX_COHORTS_IN_CLAUSE = 100;
    const allCohortNames = rows.map((r) => r.cohort);
    const cohortsTruncated = allCohortNames.length > MAX_COHORTS_IN_CLAUSE;
    const cohortNames = cohortsTruncated
      ? allCohortNames.slice(0, MAX_COHORTS_IN_CLAUSE)
      : allCohortNames;
    if (cohortsTruncated) {
      console.warn(
        `[extraction] Cohort count (${allCohortNames.length}) exceeds cap (${MAX_COHORTS_IN_CLAUSE}), using first ${MAX_COHORTS_IN_CLAUSE}`
      );
    }
    const recentErrorsByCohort = new Map<
      string,
      Array<{ session_id: string; created_at: string; session_outcome: string | null }>
    >();

    if (cohortNames.length > 0) {
      const rankedErrors = await db.execute(sql`
        SELECT session_id, created_at, session_outcome, cohort
        FROM (
          SELECT
            ${injectionEffectiveness.sessionId} AS session_id,
            ${injectionEffectiveness.createdAt} AS created_at,
            ${injectionEffectiveness.sessionOutcome} AS session_outcome,
            ${injectionEffectiveness.cohort} AS cohort,
            ROW_NUMBER() OVER (
              PARTITION BY ${injectionEffectiveness.cohort}
              ORDER BY ${injectionEffectiveness.createdAt} DESC
            ) AS rn
          FROM ${injectionEffectiveness}
          WHERE ${injectionEffectiveness.sessionOutcome} IS NOT NULL
            AND ${injectionEffectiveness.sessionOutcome} != 'success'
            AND ${injectionEffectiveness.cohort} IN (${sql.join(
              cohortNames.map((c) => sql`${c}`),
              sql`, `
            )})
        ) ranked
        WHERE rn <= 5
        ORDER BY cohort, created_at DESC
      `);

      for (const row of rankedErrors.rows as Array<{
        session_id: string;
        created_at: string | Date | null;
        session_outcome: string | null;
        cohort: string;
      }>) {
        const cohort = row.cohort;
        if (!recentErrorsByCohort.has(cohort)) {
          recentErrorsByCohort.set(cohort, []);
        }
        const ts =
          row.created_at instanceof Date ? row.created_at.toISOString() : (row.created_at ?? '');
        recentErrorsByCohort.get(cohort)!.push({
          session_id: row.session_id,
          created_at: typeof ts === 'string' ? ts : '',
          session_outcome: row.session_outcome,
        });
      }
    }

    const entries: ErrorRateEntry[] = [];

    for (const r of rows) {
      totalErrors += r.failure_count;
      totalEvents += r.total_events;

      entries.push({
        cohort: r.cohort,
        total_events: r.total_events,
        failure_count: r.failure_count,
        error_rate: r.total_events > 0 ? r.failure_count / r.total_events : 0,
        recent_errors: recentErrorsByCohort.get(r.cohort) ?? [],
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
