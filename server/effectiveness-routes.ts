/**
 * Injection Effectiveness API Routes
 *
 * REST endpoints for the effectiveness dashboard: summary, throttle status,
 * latency details, utilization analytics, and A/B comparison.
 *
 * Data lives in PostgreSQL tables created by OMN-1890.
 *
 * @see OMN-1891 - Build Effectiveness Dashboard
 */

import { Router } from 'express';
import { sql, desc, gte, and, eq } from 'drizzle-orm';
import { tryGetIntelligenceDb } from './storage';
import {
  injectionEffectiveness,
  latencyBreakdowns,
  patternHitRates,
} from '@shared/intelligence-schema';
import type {
  EffectivenessSummary,
  ThrottleStatus,
  LatencyDetails,
  UtilizationDetails,
  ABComparison,
  EffectivenessTrendPoint,
} from '@shared/effectiveness-types';

const router = Router();

// ============================================================================
// GET /api/effectiveness/summary
// Executive summary metrics (R1)
// ============================================================================

router.get('/summary', async (_req, res) => {
  try {
    const db = tryGetIntelligenceDb();
    if (!db) {
      return res.json(emptySummary());
    }

    const ie = injectionEffectiveness;

    // Total sessions and injection rate
    const totals = await db
      .select({
        total: sql<number>`count(*)::int`,
        injected: sql<number>`count(*) FILTER (WHERE ${ie.injectionOccurred} = true)::int`,
        treatment: sql<number>`count(*) FILTER (WHERE ${ie.cohort} = 'treatment')::int`,
        control: sql<number>`count(*) FILTER (WHERE ${ie.cohort} = 'control')::int`,
      })
      .from(ie);

    const t = totals[0] ?? { total: 0, injected: 0, treatment: 0, control: 0 };
    const injectionRate = t.total > 0 ? t.injected / t.total : 0;

    // Median utilization (treatment only)
    const utilResult = await db
      .select({
        median: sql<number>`percentile_cont(0.5) WITHIN GROUP (ORDER BY ${ie.utilizationScore}::numeric)`,
      })
      .from(ie)
      .where(and(eq(ie.cohort, 'treatment'), eq(ie.injectionOccurred, true)));
    const medianUtil = utilResult[0]?.median ?? 0;

    // Mean agent accuracy (treatment only)
    const accResult = await db
      .select({
        mean: sql<number>`avg(${ie.agentMatchScore}::numeric)`,
      })
      .from(ie)
      .where(and(eq(ie.cohort, 'treatment'), eq(ie.injectionOccurred, true)));
    const meanAccuracy = accResult[0]?.mean ?? 0;

    // Latency delta P95: treatment P95 (injected only) - control P95
    const latencyResult = await db
      .select({
        cohort: ie.cohort,
        p95: sql<number>`percentile_cont(0.95) WITHIN GROUP (ORDER BY ${ie.userVisibleLatencyMs})`,
      })
      .from(ie)
      .where(
        and(
          sql`${ie.userVisibleLatencyMs} IS NOT NULL`,
          sql`(${ie.cohort} = 'control' OR (${ie.cohort} = 'treatment' AND ${ie.injectionOccurred} = true))`
        )
      )
      .groupBy(ie.cohort);

    let treatmentP95 = 0;
    let controlP95 = 0;
    for (const row of latencyResult) {
      if (row.cohort === 'treatment') treatmentP95 = row.p95;
      if (row.cohort === 'control') controlP95 = row.p95;
    }
    const latencyDelta = treatmentP95 - controlP95;

    // Throttle status (windowed)
    const throttle = await computeThrottleStatus(db);

    const summary: EffectivenessSummary = {
      injection_rate: injectionRate,
      injection_rate_target: 0.8,
      median_utilization: Number(medianUtil),
      utilization_target: 0.6,
      mean_agent_accuracy: Number(meanAccuracy),
      accuracy_target: 0.8,
      latency_delta_p95_ms: latencyDelta,
      latency_delta_target_ms: 150,
      total_sessions: t.total,
      treatment_sessions: t.treatment,
      control_sessions: t.control,
      throttle_active: throttle.active,
      throttle_reason: throttle.reason,
    };

    res.json(summary);
  } catch (error) {
    console.error('[effectiveness] Error getting summary:', error);
    res.status(500).json({ error: 'Failed to get effectiveness summary' });
  }
});

// ============================================================================
// GET /api/effectiveness/throttle
// Auto-throttle status (R2)
// ============================================================================

router.get('/throttle', async (_req, res) => {
  try {
    const db = tryGetIntelligenceDb();
    if (!db) {
      return res.json({ active: false, reason: null, injected_sessions_1h: 0 });
    }

    const status = await computeThrottleStatus(db);
    res.json(status);
  } catch (error) {
    console.error('[effectiveness] Error getting throttle status:', error);
    res.status(500).json({ error: 'Failed to get throttle status' });
  }
});

// ============================================================================
// GET /api/effectiveness/latency
// Latency breakdown details (R3)
// ============================================================================

router.get('/latency', async (_req, res) => {
  try {
    const db = tryGetIntelligenceDb();
    if (!db) {
      return res.json({
        breakdowns: [],
        trend: [],
        cache: { hit_rate: 0, total_hits: 0, total_misses: 0 },
      });
    }

    const lb = latencyBreakdowns;

    // Per-cohort percentiles
    const breakdowns = await db
      .select({
        cohort: lb.cohort,
        p50: sql<number>`percentile_cont(0.5) WITHIN GROUP (ORDER BY ${lb.userVisibleLatencyMs})`,
        p95: sql<number>`percentile_cont(0.95) WITHIN GROUP (ORDER BY ${lb.userVisibleLatencyMs})`,
        p99: sql<number>`percentile_cont(0.99) WITHIN GROUP (ORDER BY ${lb.userVisibleLatencyMs})`,
        routing_avg: sql<number>`avg(${lb.routingTimeMs})`,
        retrieval_avg: sql<number>`avg(${lb.retrievalTimeMs})`,
        injection_avg: sql<number>`avg(${lb.injectionTimeMs})`,
        sample_count: sql<number>`count(*)::int`,
      })
      .from(lb)
      .groupBy(lb.cohort);

    // Latency trend (daily, last 30 days)
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const trend = await db
      .select({
        date: sql<string>`date_trunc('day', ${lb.createdAt})::date::text`,
        cohort: lb.cohort,
        p50: sql<number>`percentile_cont(0.5) WITHIN GROUP (ORDER BY ${lb.userVisibleLatencyMs})`,
        p95: sql<number>`percentile_cont(0.95) WITHIN GROUP (ORDER BY ${lb.userVisibleLatencyMs})`,
      })
      .from(lb)
      .where(gte(lb.createdAt, cutoff))
      .groupBy(sql`date_trunc('day', ${lb.createdAt})::date::text`, lb.cohort)
      .orderBy(sql`date_trunc('day', ${lb.createdAt})::date::text`);

    // Pivot trend to one row per day
    const trendMap = new Map<
      string,
      { treatment_p50: number; treatment_p95: number; control_p50: number; control_p95: number }
    >();
    for (const row of trend) {
      let entry = trendMap.get(row.date);
      if (!entry) {
        entry = { treatment_p50: 0, treatment_p95: 0, control_p50: 0, control_p95: 0 };
        trendMap.set(row.date, entry);
      }
      if (row.cohort === 'treatment') {
        entry.treatment_p50 = Number(row.p50);
        entry.treatment_p95 = Number(row.p95);
      } else {
        entry.control_p50 = Number(row.p50);
        entry.control_p95 = Number(row.p95);
      }
    }

    const trendArray = Array.from(trendMap.entries()).map(([date, vals]) => ({
      date,
      ...vals,
      delta_p95: vals.treatment_p95 - vals.control_p95,
    }));

    // Cache hit rate
    const cacheResult = await db
      .select({
        hits: sql<number>`count(*) FILTER (WHERE ${lb.cacheHit} = true)::int`,
        misses: sql<number>`count(*) FILTER (WHERE ${lb.cacheHit} = false)::int`,
      })
      .from(lb);

    const hits = cacheResult[0]?.hits ?? 0;
    const misses = cacheResult[0]?.misses ?? 0;
    const cacheTotal = hits + misses;

    const result: LatencyDetails = {
      breakdowns: breakdowns.map((b) => ({
        cohort: b.cohort,
        p50_ms: Number(b.p50),
        p95_ms: Number(b.p95),
        p99_ms: Number(b.p99),
        routing_avg_ms: Number(b.routing_avg) || 0,
        retrieval_avg_ms: Number(b.retrieval_avg) || 0,
        injection_avg_ms: Number(b.injection_avg) || 0,
        sample_count: b.sample_count,
      })),
      trend: trendArray,
      cache: {
        hit_rate: cacheTotal > 0 ? hits / cacheTotal : 0,
        total_hits: hits,
        total_misses: misses,
      },
    };

    res.json(result);
  } catch (error) {
    console.error('[effectiveness] Error getting latency details:', error);
    res.status(500).json({ error: 'Failed to get latency details' });
  }
});

// ============================================================================
// GET /api/effectiveness/utilization
// Utilization analytics (R4)
// ============================================================================

router.get('/utilization', async (_req, res) => {
  try {
    const db = tryGetIntelligenceDb();
    if (!db) {
      return res.json({
        histogram: [],
        by_method: [],
        pattern_rates: [],
        low_utilization_sessions: [],
      });
    }

    const ie = injectionEffectiveness;

    // Histogram (10 buckets from 0.0 to 1.0)
    const histogram = await db
      .select({
        bucket: sql<number>`floor(${ie.utilizationScore}::numeric * 10)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(ie)
      .where(and(eq(ie.injectionOccurred, true), sql`${ie.utilizationScore} IS NOT NULL`))
      .groupBy(sql`floor(${ie.utilizationScore}::numeric * 10)::int`)
      .orderBy(sql`floor(${ie.utilizationScore}::numeric * 10)::int`);

    const histogramBuckets = histogram.map((h) => ({
      range_start: Math.min(h.bucket, 9) / 10,
      range_end: (Math.min(h.bucket, 9) + 1) / 10,
      count: h.count,
    }));

    // By detection method
    const byMethod = await db
      .select({
        method: ie.utilizationMethod,
        median: sql<number>`percentile_cont(0.5) WITHIN GROUP (ORDER BY ${ie.utilizationScore}::numeric)`,
        count: sql<number>`count(*)::int`,
      })
      .from(ie)
      .where(and(eq(ie.injectionOccurred, true), sql`${ie.utilizationMethod} IS NOT NULL`))
      .groupBy(ie.utilizationMethod);

    // Pattern-level utilization (top 20)
    const phr = patternHitRates;
    const patternRates = await db
      .select({
        pattern_id: phr.patternId,
        avg_util: sql<number>`avg(${phr.utilizationScore}::numeric)`,
        count: sql<number>`count(*)::int`,
      })
      .from(phr)
      .where(sql`${phr.utilizationScore} IS NOT NULL`)
      .groupBy(phr.patternId)
      .orderBy(desc(sql`avg(${phr.utilizationScore}::numeric)`))
      .limit(20);

    // Low utilization sessions (< 0.2)
    const lowUtil = await db
      .select({
        sessionId: ie.sessionId,
        utilizationScore: ie.utilizationScore,
        agentName: ie.agentName,
        detectionMethod: ie.detectionMethod,
        createdAt: ie.createdAt,
      })
      .from(ie)
      .where(
        and(
          eq(ie.injectionOccurred, true),
          sql`${ie.utilizationScore}::numeric < 0.2`,
          sql`${ie.utilizationScore} IS NOT NULL`
        )
      )
      .orderBy(desc(ie.createdAt))
      .limit(50);

    const result: UtilizationDetails = {
      histogram: histogramBuckets,
      by_method: byMethod.map((m) => ({
        method: m.method ?? 'unknown',
        median_score: Number(m.median),
        session_count: m.count,
      })),
      pattern_rates: patternRates.map((p) => ({
        pattern_id: p.pattern_id,
        avg_utilization: Number(p.avg_util),
        session_count: p.count,
      })),
      low_utilization_sessions: lowUtil.map((s) => ({
        session_id: s.sessionId,
        utilization_score: Number(s.utilizationScore),
        agent_name: s.agentName,
        detection_method: s.detectionMethod,
        created_at: s.createdAt?.toISOString() ?? '',
      })),
    };

    res.json(result);
  } catch (error) {
    console.error('[effectiveness] Error getting utilization details:', error);
    res.status(500).json({ error: 'Failed to get utilization details' });
  }
});

// ============================================================================
// GET /api/effectiveness/ab
// A/B Comparison (R5)
// ============================================================================

router.get('/ab', async (_req, res) => {
  try {
    const db = tryGetIntelligenceDb();
    if (!db) {
      return res.json({ cohorts: [], total_sessions: 0 });
    }

    const ie = injectionEffectiveness;

    const cohorts = await db
      .select({
        cohort: ie.cohort,
        count: sql<number>`count(*)::int`,
        median_utilization: sql<number>`percentile_cont(0.5) WITHIN GROUP (ORDER BY ${ie.utilizationScore}::numeric)`,
        avg_accuracy: sql<number>`avg(${ie.agentMatchScore}::numeric)`,
        success_rate: sql<number>`count(*) FILTER (WHERE ${ie.sessionOutcome} = 'success')::numeric / NULLIF(count(*) FILTER (WHERE ${ie.sessionOutcome} IS NOT NULL), 0)`,
        avg_latency: sql<number>`avg(${ie.userVisibleLatencyMs})`,
      })
      .from(ie)
      .where(sql`${ie.sessionOutcome} IS NOT NULL`)
      .groupBy(ie.cohort);

    const totalSessions = cohorts.reduce((sum, c) => sum + c.count, 0);

    const result: ABComparison = {
      cohorts: cohorts.map((c) => ({
        cohort: c.cohort,
        session_count: c.count,
        median_utilization_pct: Number(c.median_utilization ?? 0) * 100,
        avg_accuracy_pct: Number(c.avg_accuracy ?? 0) * 100,
        success_rate_pct: Number(c.success_rate ?? 0) * 100,
        avg_latency_ms: Number(c.avg_latency ?? 0),
      })),
      total_sessions: totalSessions,
    };

    res.json(result);
  } catch (error) {
    console.error('[effectiveness] Error getting A/B comparison:', error);
    res.status(500).json({ error: 'Failed to get A/B comparison' });
  }
});

// ============================================================================
// GET /api/effectiveness/trend
// Multi-metric trend for summary chart
// ============================================================================

router.get('/trend', async (_req, res) => {
  try {
    const db = tryGetIntelligenceDb();
    if (!db) {
      return res.json([]);
    }

    const ie = injectionEffectiveness;
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    // Check how many days of data we have to pick granularity
    const rangeResult = await db
      .select({
        days: sql<number>`EXTRACT(EPOCH FROM (max(${ie.createdAt}) - min(${ie.createdAt}))) / 86400`,
      })
      .from(ie)
      .where(gte(ie.createdAt, cutoff));

    const daySpan = Number(rangeResult[0]?.days ?? 0);
    const truncUnit = daySpan < 3 ? 'hour' : 'day';

    const rows = await db
      .select({
        bucket: sql<string>`date_trunc(${sql.raw(`'${truncUnit}'`)}, ${ie.createdAt})::date::text`,
        injection_rate: sql<number>`AVG(CASE WHEN ${ie.injectionOccurred} THEN 1.0 ELSE 0.0 END)`,
        avg_utilization: sql<number>`AVG(CASE WHEN ${ie.utilizationScore} IS NOT NULL THEN ${ie.utilizationScore}::numeric ELSE 0 END)`,
        avg_accuracy: sql<number>`AVG(CASE WHEN ${ie.agentMatchScore} IS NOT NULL THEN ${ie.agentMatchScore}::numeric ELSE 0 END)`,
        avg_latency_delta_ms: sql<number>`AVG(CASE WHEN ${ie.userVisibleLatencyMs} IS NOT NULL THEN ${ie.userVisibleLatencyMs} ELSE 0 END)`,
      })
      .from(ie)
      .where(gte(ie.createdAt, cutoff))
      .groupBy(sql`date_trunc(${sql.raw(`'${truncUnit}'`)}, ${ie.createdAt})::date::text`)
      .orderBy(sql`date_trunc(${sql.raw(`'${truncUnit}'`)}, ${ie.createdAt})::date::text`);

    const trend: EffectivenessTrendPoint[] = rows.map((r) => ({
      date: r.bucket,
      injection_rate: Number(r.injection_rate),
      avg_utilization: Number(r.avg_utilization),
      avg_accuracy: Number(r.avg_accuracy),
      avg_latency_delta_ms: Number(r.avg_latency_delta_ms),
    }));

    res.json(trend);
  } catch (error) {
    console.error('[effectiveness] Error getting trend:', error);
    res.json([]);
  }
});

// ============================================================================
// Helpers
// ============================================================================

function emptySummary(): EffectivenessSummary {
  return {
    injection_rate: 0,
    injection_rate_target: 0.8,
    median_utilization: 0,
    utilization_target: 0.6,
    mean_agent_accuracy: 0,
    accuracy_target: 0.8,
    latency_delta_p95_ms: 0,
    latency_delta_target_ms: 150,
    total_sessions: 0,
    treatment_sessions: 0,
    control_sessions: 0,
    throttle_active: false,
    throttle_reason: null,
  };
}

/**
 * Compute auto-throttle status using windowed aggregates (R2).
 *
 * Rules:
 * - P95 latency delta > 200ms for >= 50 injected sessions in 1 hour -> THROTTLE
 * - Median utilization < 0.4 for >= 50 injected sessions in 1 hour -> THROTTLE
 */
async function computeThrottleStatus(
  db: NonNullable<ReturnType<typeof tryGetIntelligenceDb>>
): Promise<ThrottleStatus> {
  const ie = injectionEffectiveness;
  const windowStart = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago

  // Get injected sessions in the last hour
  const windowData = await db
    .select({
      count: sql<number>`count(*)::int`,
      latency_p95: sql<number>`percentile_cont(0.95) WITHIN GROUP (ORDER BY ${ie.userVisibleLatencyMs})`,
      median_util: sql<number>`percentile_cont(0.5) WITHIN GROUP (ORDER BY ${ie.utilizationScore}::numeric)`,
    })
    .from(ie)
    .where(and(eq(ie.injectionOccurred, true), gte(ie.createdAt, windowStart)));

  const w = windowData[0] ?? { count: 0, latency_p95: null, median_util: null };

  // Also get control P95 for delta computation
  const controlP95Result = await db
    .select({
      p95: sql<number>`percentile_cont(0.95) WITHIN GROUP (ORDER BY ${ie.userVisibleLatencyMs})`,
    })
    .from(ie)
    .where(
      and(
        eq(ie.cohort, 'control'),
        gte(ie.createdAt, windowStart),
        sql`${ie.userVisibleLatencyMs} IS NOT NULL`
      )
    );

  const controlP95 = Number(controlP95Result[0]?.p95 ?? 0);
  const latencyDelta = Number(w.latency_p95 ?? 0) - controlP95;
  const medianUtil = Number(w.median_util ?? 0);

  // Minimum sample threshold
  if (w.count < 50) {
    return {
      active: false,
      reason: null,
      latency_delta_p95_1h: latencyDelta,
      median_utilization_1h: medianUtil,
      injected_sessions_1h: w.count,
      window_start: windowStart.toISOString(),
    };
  }

  // Check throttle conditions
  if (latencyDelta > 200) {
    return {
      active: true,
      reason: `P95 latency delta ${Math.round(latencyDelta)}ms exceeds 200ms threshold (${w.count} sessions in 1h)`,
      latency_delta_p95_1h: latencyDelta,
      median_utilization_1h: medianUtil,
      injected_sessions_1h: w.count,
      window_start: windowStart.toISOString(),
    };
  }

  if (medianUtil < 0.4) {
    return {
      active: true,
      reason: `Median utilization ${(medianUtil * 100).toFixed(1)}% below 40% threshold (${w.count} sessions in 1h)`,
      latency_delta_p95_1h: latencyDelta,
      median_utilization_1h: medianUtil,
      injected_sessions_1h: w.count,
      window_start: windowStart.toISOString(),
    };
  }

  return {
    active: false,
    reason: null,
    latency_delta_p95_1h: latencyDelta,
    median_utilization_1h: medianUtil,
    injected_sessions_1h: w.count,
    window_start: windowStart.toISOString(),
  };
}

export default router;
