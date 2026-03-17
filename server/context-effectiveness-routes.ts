/**
 * Context Effectiveness API Routes (OMN-5286)
 *
 * REST endpoints for the /context-effectiveness dashboard.
 * Queries injection_effectiveness table for event_type='context_utilization'.
 *
 * Endpoints:
 *   GET /api/context-effectiveness/summary?window=24h
 *   GET /api/context-effectiveness/by-method?window=24h
 *   GET /api/context-effectiveness/trend?window=24h
 *   GET /api/context-effectiveness/outcomes?window=24h
 *   GET /api/context-effectiveness/low-utilization?window=24h
 */

import { Router } from 'express';
import { tryGetIntelligenceDb } from './storage';
import { injectionEffectiveness } from '@shared/intelligence-schema';
import { and, eq, gte, sql, desc, lt } from 'drizzle-orm';
import { ACCEPTED_WINDOWS } from './sql-safety';
import type {
  ContextEffectivenessSummary,
  UtilizationByMethod,
  EffectivenessTrendPoint,
  OutcomeBreakdown,
  LowUtilizationSession,
} from '@shared/context-effectiveness-types';

const router = Router();

// ============================================================================
// Helpers
// ============================================================================

function getWindow(query: Record<string, unknown>): string | null {
  if (query.window !== undefined && typeof query.window !== 'string') {
    return null;
  }
  const windowParam = typeof query.window === 'string' ? query.window : '24h';
  if (!ACCEPTED_WINDOWS.has(windowParam)) {
    return null;
  }
  return windowParam;
}

function windowToInterval(window: string): string {
  switch (window) {
    case '7d':
      return '7 days';
    case '30d':
      return '30 days';
    default:
      return '24 hours';
  }
}

function windowToTruncUnit(window: string): string {
  switch (window) {
    case '7d':
      return 'hour';
    case '30d':
      return 'day';
    default:
      return 'hour';
  }
}

function emptySummary(): ContextEffectivenessSummary {
  return {
    avg_utilization_score: 0,
    total_injected_sessions: 0,
    injection_occurred_count: 0,
    injection_rate: 0,
    avg_patterns_count: 0,
    cache_hit_rate: 0,
    top_utilization_method: null,
  };
}

// ============================================================================
// GET /api/context-effectiveness/summary
// ============================================================================

router.get('/summary', async (req, res) => {
  const window = getWindow(req.query as Record<string, unknown>);
  if (window === null) {
    return res.status(400).json({ error: 'Invalid window parameter. Must be one of: 24h, 7d, 30d' });
  }
  const db = tryGetIntelligenceDb();
  if (!db) {
    return res.json(emptySummary());
  }
  try {
    const interval = windowToInterval(window);
    const rows = await db
      .select({
        avg_utilization_score: sql<number>`COALESCE(AVG(NULLIF(CAST(${injectionEffectiveness.utilizationScore} AS NUMERIC), 0)), 0)`,
        total_injected_sessions: sql<number>`COUNT(*)`,
        injection_occurred_count: sql<number>`SUM(CASE WHEN ${injectionEffectiveness.injectionOccurred} THEN 1 ELSE 0 END)`,
        avg_patterns_count: sql<number>`COALESCE(AVG(${injectionEffectiveness.patternsCount}), 0)`,
        cache_hit_count: sql<number>`SUM(CASE WHEN ${injectionEffectiveness.cacheHit} THEN 1 ELSE 0 END)`,
      })
      .from(injectionEffectiveness)
      .where(
        and(
          eq(injectionEffectiveness.eventType, 'context_utilization'),
          gte(
            injectionEffectiveness.createdAt,
            sql`NOW() - INTERVAL ${sql.raw(`'${interval}'`)}` as unknown as Date
          )
        )
      );

    const row = rows[0];
    const total = Number(row?.total_injected_sessions ?? 0);
    const injected = Number(row?.injection_occurred_count ?? 0);
    const cacheHits = Number(row?.cache_hit_count ?? 0);

    // Get top utilization method
    const methodRows = await db
      .select({
        method: injectionEffectiveness.utilizationMethod,
        cnt: sql<number>`COUNT(*)`,
      })
      .from(injectionEffectiveness)
      .where(
        and(
          eq(injectionEffectiveness.eventType, 'context_utilization'),
          gte(
            injectionEffectiveness.createdAt,
            sql`NOW() - INTERVAL ${sql.raw(`'${interval}'`)}` as unknown as Date
          )
        )
      )
      .groupBy(injectionEffectiveness.utilizationMethod)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(1);

    const summary: ContextEffectivenessSummary = {
      avg_utilization_score: Number(row?.avg_utilization_score ?? 0),
      total_injected_sessions: total,
      injection_occurred_count: injected,
      injection_rate: total > 0 ? injected / total : 0,
      avg_patterns_count: Number(row?.avg_patterns_count ?? 0),
      cache_hit_rate: total > 0 ? cacheHits / total : 0,
      top_utilization_method: methodRows[0]?.method ?? null,
    };
    return res.json(summary);
  } catch (error) {
    console.error('[context-effectiveness] Error fetching summary:', error);
    return res.status(500).json({ error: 'Failed to fetch context effectiveness summary' });
  }
});

// ============================================================================
// GET /api/context-effectiveness/by-method
// ============================================================================

router.get('/by-method', async (req, res) => {
  const window = getWindow(req.query as Record<string, unknown>);
  if (window === null) {
    return res.status(400).json({ error: 'Invalid window parameter. Must be one of: 24h, 7d, 30d' });
  }
  const db = tryGetIntelligenceDb();
  if (!db) {
    return res.json([]);
  }
  try {
    const interval = windowToInterval(window);
    const rows = await db
      .select({
        method: injectionEffectiveness.detectionMethod,
        avg_score: sql<number>`COALESCE(AVG(NULLIF(CAST(${injectionEffectiveness.utilizationScore} AS NUMERIC), 0)), 0)`,
        session_count: sql<number>`COUNT(*)`,
        injection_occurred_count: sql<number>`SUM(CASE WHEN ${injectionEffectiveness.injectionOccurred} THEN 1 ELSE 0 END)`,
      })
      .from(injectionEffectiveness)
      .where(
        and(
          eq(injectionEffectiveness.eventType, 'context_utilization'),
          gte(
            injectionEffectiveness.createdAt,
            sql`NOW() - INTERVAL ${sql.raw(`'${interval}'`)}` as unknown as Date
          )
        )
      )
      .groupBy(injectionEffectiveness.detectionMethod)
      .orderBy(desc(sql`COUNT(*)`));

    const result: UtilizationByMethod[] = rows.map((r) => ({
      method: r.method ?? 'unknown',
      avg_score: Number(r.avg_score),
      session_count: Number(r.session_count),
      injection_rate:
        Number(r.session_count) > 0
          ? Number(r.injection_occurred_count) / Number(r.session_count)
          : 0,
    }));
    return res.json(result);
  } catch (error) {
    console.error('[context-effectiveness] Error fetching by-method:', error);
    return res.status(500).json({ error: 'Failed to fetch utilization by method' });
  }
});

// ============================================================================
// GET /api/context-effectiveness/trend
// ============================================================================

router.get('/trend', async (req, res) => {
  const window = getWindow(req.query as Record<string, unknown>);
  if (window === null) {
    return res.status(400).json({ error: 'Invalid window parameter. Must be one of: 24h, 7d, 30d' });
  }
  const db = tryGetIntelligenceDb();
  if (!db) {
    return res.json([]);
  }
  try {
    const interval = windowToInterval(window);
    const truncUnit = windowToTruncUnit(window);
    const rows = await db
      .select({
        date: sql<string>`DATE_TRUNC('${sql.raw(truncUnit)}', ${injectionEffectiveness.createdAt})`,
        avg_utilization_score: sql<number>`COALESCE(AVG(NULLIF(CAST(${injectionEffectiveness.utilizationScore} AS NUMERIC), 0)), 0)`,
        session_count: sql<number>`COUNT(*)`,
        injection_occurred_count: sql<number>`SUM(CASE WHEN ${injectionEffectiveness.injectionOccurred} THEN 1 ELSE 0 END)`,
      })
      .from(injectionEffectiveness)
      .where(
        and(
          eq(injectionEffectiveness.eventType, 'context_utilization'),
          gte(
            injectionEffectiveness.createdAt,
            sql`NOW() - INTERVAL ${sql.raw(`'${interval}'`)}` as unknown as Date
          )
        )
      )
      .groupBy(sql`DATE_TRUNC('${sql.raw(truncUnit)}', ${injectionEffectiveness.createdAt})`)
      .orderBy(sql`DATE_TRUNC('${sql.raw(truncUnit)}', ${injectionEffectiveness.createdAt})`);

    const result: EffectivenessTrendPoint[] = rows.map((r) => ({
      date: String(r.date),
      avg_utilization_score: Number(r.avg_utilization_score),
      session_count: Number(r.session_count),
      injection_rate:
        Number(r.session_count) > 0
          ? Number(r.injection_occurred_count) / Number(r.session_count)
          : 0,
    }));
    return res.json(result);
  } catch (error) {
    console.error('[context-effectiveness] Error fetching trend:', error);
    return res.status(500).json({ error: 'Failed to fetch effectiveness trend' });
  }
});

// ============================================================================
// GET /api/context-effectiveness/outcomes
// ============================================================================

router.get('/outcomes', async (req, res) => {
  const window = getWindow(req.query as Record<string, unknown>);
  if (window === null) {
    return res.status(400).json({ error: 'Invalid window parameter. Must be one of: 24h, 7d, 30d' });
  }
  const db = tryGetIntelligenceDb();
  if (!db) {
    return res.json([]);
  }
  try {
    const interval = windowToInterval(window);
    const rows = await db
      .select({
        outcome: injectionEffectiveness.sessionOutcome,
        count: sql<number>`COUNT(*)`,
        avg_utilization_score: sql<number>`COALESCE(AVG(NULLIF(CAST(${injectionEffectiveness.utilizationScore} AS NUMERIC), 0)), 0)`,
      })
      .from(injectionEffectiveness)
      .where(
        and(
          eq(injectionEffectiveness.eventType, 'context_utilization'),
          gte(
            injectionEffectiveness.createdAt,
            sql`NOW() - INTERVAL ${sql.raw(`'${interval}'`)}` as unknown as Date
          )
        )
      )
      .groupBy(injectionEffectiveness.sessionOutcome)
      .orderBy(desc(sql`COUNT(*)`));

    const result: OutcomeBreakdown[] = rows.map((r) => ({
      outcome: r.outcome ?? 'unknown',
      count: Number(r.count),
      avg_utilization_score: Number(r.avg_utilization_score),
    }));
    return res.json(result);
  } catch (error) {
    console.error('[context-effectiveness] Error fetching outcomes:', error);
    return res.status(500).json({ error: 'Failed to fetch outcome breakdown' });
  }
});

// ============================================================================
// GET /api/context-effectiveness/low-utilization
// Sessions with utilization_score < 0.3
// ============================================================================

router.get('/low-utilization', async (req, res) => {
  const window = getWindow(req.query as Record<string, unknown>);
  if (window === null) {
    return res.status(400).json({ error: 'Invalid window parameter. Must be one of: 24h, 7d, 30d' });
  }
  const db = tryGetIntelligenceDb();
  if (!db) {
    return res.json([]);
  }
  try {
    const interval = windowToInterval(window);
    const rows = await db
      .select({
        sessionId: injectionEffectiveness.sessionId,
        correlationId: injectionEffectiveness.correlationId,
        agentName: injectionEffectiveness.agentName,
        detectionMethod: injectionEffectiveness.detectionMethod,
        utilizationScore: injectionEffectiveness.utilizationScore,
        patternsCount: injectionEffectiveness.patternsCount,
        sessionOutcome: injectionEffectiveness.sessionOutcome,
        createdAt: injectionEffectiveness.createdAt,
      })
      .from(injectionEffectiveness)
      .where(
        and(
          eq(injectionEffectiveness.eventType, 'context_utilization'),
          gte(
            injectionEffectiveness.createdAt,
            sql`NOW() - INTERVAL ${sql.raw(`'${interval}'`)}` as unknown as Date
          ),
          lt(
            sql`NULLIF(CAST(${injectionEffectiveness.utilizationScore} AS NUMERIC), 0)`,
            sql`0.3`
          )
        )
      )
      .orderBy(desc(injectionEffectiveness.createdAt))
      .limit(50);

    const result: LowUtilizationSession[] = rows.map((r) => ({
      session_id: String(r.sessionId ?? ''),
      correlation_id: String(r.correlationId ?? ''),
      agent_name: r.agentName ?? null,
      detection_method: r.detectionMethod ?? null,
      utilization_score: Number(r.utilizationScore ?? 0),
      patterns_count: r.patternsCount ?? null,
      session_outcome: r.sessionOutcome ?? null,
      occurred_at: r.createdAt?.toISOString() ?? new Date().toISOString(),
    }));
    return res.json(result);
  } catch (error) {
    console.error('[context-effectiveness] Error fetching low-utilization sessions:', error);
    return res.status(500).json({ error: 'Failed to fetch low-utilization sessions' });
  }
});

export default router;
