/**
 * ExtractionMetricsProjection — DB-backed projection for extraction pipeline (OMN-2325)
 *
 * Encapsulates all SQL queries from extraction-routes.ts behind the
 * ProjectionView interface. Routes call getSnapshot() instead of
 * executing SQL directly.
 *
 * Snapshot payload shape matches the combined API output of:
 *   GET /api/extraction/summary
 *   GET /api/extraction/health/pipeline
 *   GET /api/extraction/latency/heatmap
 *   GET /api/extraction/patterns/volume
 *   GET /api/extraction/errors/summary
 */

import { sql, gte } from 'drizzle-orm';
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
import { DbBackedProjectionView } from './db-backed-projection-view';
import { tryGetIntelligenceDb } from '../storage';

// ============================================================================
// Payload type
// ============================================================================

export interface ExtractionMetricsPayload {
  summary: ExtractionSummary;
  pipelineHealth: PipelineHealthResponse;
  latencyHeatmap: LatencyHeatmapResponse;
  patternVolume: PatternVolumeResponse;
  errorsSummary: ErrorRatesSummaryResponse;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_WINDOW_DAYS = 90;
const MAX_WINDOW_HOURS = 2160;
// Evaluated at import time. This is intentional: drizzle-orm's sql`` tagged
// template builds an inert SQL fragment object with no side effects at
// construction time — the actual query only executes when passed to db.select().
const TRUNC_DAY = sql`date_trunc('day'`;
const TRUNC_HOUR = sql`date_trunc('hour'`;

// ============================================================================
// Helpers (migrated from extraction-routes.ts)
// ============================================================================

function parseWindow(window: string): Date {
  const now = Date.now();
  const match = window.match(/^(\d+)(h|d)$/);
  if (!match) return new Date(now - 24 * 60 * 60 * 1000);
  const value = parseInt(match[1], 10);
  const unit = match[2];
  if (value <= 0) return new Date(now - 24 * 60 * 60 * 1000);
  if (unit === 'd' && value > MAX_WINDOW_DAYS)
    return new Date(now - MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  if (unit === 'h' && value > MAX_WINDOW_HOURS)
    return new Date(now - MAX_WINDOW_HOURS * 60 * 60 * 1000);
  const ms = unit === 'd' ? value * 24 * 60 * 60 * 1000 : value * 60 * 60 * 1000;
  return new Date(now - ms);
}

// ============================================================================
// Projection
// ============================================================================

type Db = NonNullable<ReturnType<typeof tryGetIntelligenceDb>>;

export class ExtractionMetricsProjection extends DbBackedProjectionView<ExtractionMetricsPayload> {
  readonly viewId = 'extraction-metrics';

  protected emptyPayload(): ExtractionMetricsPayload {
    return {
      summary: {
        total_injections: 0,
        total_patterns_matched: 0,
        avg_utilization_score: null,
        avg_latency_ms: null,
        success_rate: null,
        last_event_at: null,
      },
      pipelineHealth: { cohorts: [] },
      latencyHeatmap: { buckets: [], window: '24h' },
      patternVolume: { points: [], window: '24h' },
      errorsSummary: { entries: [], total_errors: 0, overall_error_rate: null },
    };
  }

  protected async querySnapshot(db: Db): Promise<ExtractionMetricsPayload> {
    const [summary, pipelineHealth, latencyHeatmap, patternVolume, errorsSummary] =
      await Promise.all([
        this.querySummary(db),
        this.queryPipelineHealth(db),
        this.queryLatencyHeatmap(db, '24h'),
        this.queryPatternVolume(db, '24h'),
        this.queryErrorsSummary(db),
      ]);

    return { summary, pipelineHealth, latencyHeatmap, patternVolume, errorsSummary };
  }

  // --------------------------------------------------------------------------
  // Public convenience methods (handle DB lookup internally)
  //
  // Routes call these for custom parameters (e.g. non-default time windows)
  // that don't match the cached snapshot. The DB accessor is imported from
  // storage internally, so route files never need getIntelligenceDb.
  // --------------------------------------------------------------------------

  /**
   * Query latency heatmap with a custom time window.
   * Returns empty if DB is unavailable.
   */
  async getLatencyHeatmap(windowParam: string): Promise<LatencyHeatmapResponse> {
    const db = tryGetIntelligenceDb();
    if (!db) return { buckets: [], window: windowParam };
    return this.queryLatencyHeatmap(db, windowParam);
  }

  /**
   * Query pattern volume with a custom time window.
   * Returns empty if DB is unavailable.
   */
  async getPatternVolume(windowParam: string): Promise<PatternVolumeResponse> {
    const db = tryGetIntelligenceDb();
    if (!db) return { points: [], window: windowParam };
    return this.queryPatternVolume(db, windowParam);
  }

  // --------------------------------------------------------------------------
  // Internal query methods
  // --------------------------------------------------------------------------

  async querySummary(db: Db): Promise<ExtractionSummary> {
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
        (SELECT count(*)::int FROM ${injectionEffectiveness}
         WHERE ${injectionEffectiveness.sessionOutcome} IS NOT NULL
           AND ${injectionEffectiveness.createdAt} >= ${cutoff90d}) AS total_with_outcome,
        (SELECT max(${injectionEffectiveness.createdAt}) FROM ${injectionEffectiveness}
         WHERE ${injectionEffectiveness.createdAt} >= ${cutoff90d}) AS last_event_at
    `);

    const row = (rows.rows as Record<string, unknown>[])[0] ?? {};
    const totalInjections = (row.total_injections as number) ?? 0;
    const totalPatternsMatched = (row.total_patterns_matched as number) ?? 0;
    const rawAvgUtil = row.avg_utilization_score;
    const avgUtilizationScore = rawAvgUtil != null ? parseFloat(String(rawAvgUtil)) : null;
    const rawAvgLat = row.avg_latency_ms;
    const avgLatencyMs = rawAvgLat != null ? parseFloat(String(rawAvgLat)) : null;
    const successCount = (row.success_count as number) ?? 0;
    const totalWithOutcome = (row.total_with_outcome as number) ?? 0;
    const successRate = totalWithOutcome > 0 ? successCount / totalWithOutcome : null;
    const lastEventAt = row.last_event_at != null ? String(row.last_event_at) : null;

    return {
      total_injections: totalInjections,
      total_patterns_matched: totalPatternsMatched,
      avg_utilization_score: avgUtilizationScore,
      avg_latency_ms: avgLatencyMs,
      success_rate: successRate,
      last_event_at: lastEventAt,
    };
  }

  async queryPipelineHealth(db: Db): Promise<PipelineHealthResponse> {
    const cutoff90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const rows = await db
      .select({
        cohort: injectionEffectiveness.cohort,
        total_events: sql<number>`count(*) FILTER (WHERE ${injectionEffectiveness.sessionOutcome} IS NOT NULL)::int`,
        success_count: sql<number>`count(*) FILTER (WHERE ${injectionEffectiveness.sessionOutcome} = 'success')::int`,
        failure_count: sql<number>`count(*) FILTER (WHERE ${injectionEffectiveness.sessionOutcome} IS NOT NULL AND ${injectionEffectiveness.sessionOutcome} != 'success')::int`,
      })
      .from(injectionEffectiveness)
      .where(gte(injectionEffectiveness.createdAt, cutoff90d))
      .groupBy(injectionEffectiveness.cohort);

    const latencyRows = await db
      .select({
        cohort: latencyBreakdowns.cohort,
        avg_latency_ms: sql<string | null>`avg(${latencyBreakdowns.userVisibleLatencyMs})`,
      })
      .from(latencyBreakdowns)
      .where(gte(latencyBreakdowns.createdAt, cutoff90d))
      .groupBy(latencyBreakdowns.cohort);

    const latencyByCohort = new Map(latencyRows.map((r) => [r.cohort, r.avg_latency_ms]));

    const cohorts = rows.map((r) => {
      const rawLat = latencyByCohort.get(r.cohort);
      return {
        cohort: r.cohort,
        total_events: r.total_events,
        success_count: r.success_count,
        failure_count: r.failure_count,
        success_rate: r.total_events > 0 ? r.success_count / r.total_events : 0,
        avg_latency_ms: rawLat ? parseFloat(rawLat) : null,
      };
    });

    return { cohorts };
  }

  async queryLatencyHeatmap(db: Db, windowParam: string): Promise<LatencyHeatmapResponse> {
    const cutoff = parseWindow(windowParam);
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

    return { buckets, window: windowParam };
  }

  async queryPatternVolume(db: Db, windowParam: string): Promise<PatternVolumeResponse> {
    const cutoff = parseWindow(windowParam);
    const trunc = windowParam.endsWith('d') ? TRUNC_DAY : TRUNC_HOUR;
    const patternBucket = sql`${trunc}, ${patternHitRates.createdAt})`;
    const injectionBucket = sql`${trunc}, ${injectionEffectiveness.createdAt})`;

    const patternRows = await db
      .select({
        bucket: sql<string>`${patternBucket}::text`,
        patterns_matched: sql<number>`count(DISTINCT ${patternHitRates.patternId})::int`,
      })
      .from(patternHitRates)
      .where(gte(patternHitRates.createdAt, cutoff))
      .groupBy(patternBucket)
      .orderBy(patternBucket);

    const injectionRows = await db
      .select({
        bucket: sql<string>`${injectionBucket}::text`,
        injections: sql<number>`count(*)::int`,
      })
      .from(injectionEffectiveness)
      .where(gte(injectionEffectiveness.createdAt, cutoff))
      .groupBy(injectionBucket)
      .orderBy(injectionBucket);

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
    return { points, window: windowParam };
  }

  async queryErrorsSummary(db: Db): Promise<ErrorRatesSummaryResponse> {
    const cutoff90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const rows = await db
      .select({
        cohort: injectionEffectiveness.cohort,
        total_events: sql<number>`count(*) FILTER (WHERE ${injectionEffectiveness.sessionOutcome} IS NOT NULL)::int`,
        failure_count: sql<number>`count(*) FILTER (WHERE ${injectionEffectiveness.sessionOutcome} IS NOT NULL AND ${injectionEffectiveness.sessionOutcome} != 'success')::int`,
      })
      .from(injectionEffectiveness)
      .where(gte(injectionEffectiveness.createdAt, cutoff90d))
      .groupBy(injectionEffectiveness.cohort);

    let totalErrors = 0;
    let totalEvents = 0;

    const MAX_COHORTS_IN_CLAUSE = 50;
    const allCohortNames = rows.map((r) => r.cohort);
    const cohortsTruncated = allCohortNames.length > MAX_COHORTS_IN_CLAUSE;
    const cohortNames = cohortsTruncated
      ? allCohortNames.slice(0, MAX_COHORTS_IN_CLAUSE)
      : allCohortNames;

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
          WHERE ${injectionEffectiveness.createdAt} >= ${cutoff90d}
            AND ${injectionEffectiveness.sessionOutcome} IS NOT NULL
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

    return {
      entries,
      total_errors: totalErrors,
      overall_error_rate: totalEvents > 0 ? totalErrors / totalEvents : null,
      ...(cohortsTruncated ? { truncated: true } : {}),
    };
  }
}
