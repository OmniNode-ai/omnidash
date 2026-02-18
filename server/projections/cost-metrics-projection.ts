/**
 * CostMetricsProjection — DB-backed projection for the cost trend dashboard (OMN-2300)
 *
 * Encapsulates all SQL queries for the LLM cost and token usage dashboard behind
 * the ProjectionView interface. Routes call ensureFresh() and access sub-fields
 * instead of executing SQL directly.
 *
 * Snapshot payload shape matches the combined API output of:
 *   GET /api/costs/summary
 *   GET /api/costs/trend
 *   GET /api/costs/by-model
 *   GET /api/costs/by-repo
 *   GET /api/costs/by-pattern
 *   GET /api/costs/token-usage
 *
 * Source table: llm_cost_aggregates (defined in shared/intelligence-schema.ts)
 * Zero-cost rows are excluded from aggregates (total_cost_usd = 0 is filtered out).
 * Null is impossible because the column is defined as .notNull().default('0').
 */

import { sql, gte, lt, and, gt, isNotNull, desc } from 'drizzle-orm';
import { llmCostAggregates } from '@shared/intelligence-schema';
import type {
  CostSummary,
  CostTrendPoint,
  CostByModel,
  CostByRepo,
  CostByPattern,
  TokenUsagePoint,
  CostTimeWindow,
  UsageSource,
} from '@shared/cost-types';
import { DbBackedProjectionView } from './db-backed-projection-view';
import { tryGetIntelligenceDb } from '../storage';

// ============================================================================
// Payload type
// ============================================================================

export interface CostMetricsPayload {
  summary: CostSummary;
  trend: CostTrendPoint[];
  byModel: CostByModel[];
  byRepo: CostByRepo[];
  byPattern: CostByPattern[];
  tokenUsage: TokenUsagePoint[];
}

type Db = NonNullable<ReturnType<typeof tryGetIntelligenceDb>>;

// ============================================================================
// Window helpers
// ============================================================================

/** Return the cutoff Date for a given CostTimeWindow. */
function windowCutoff(window: CostTimeWindow): Date {
  const now = Date.now();
  if (window === '24h') return new Date(now - 24 * 60 * 60 * 1000);
  if (window === '30d') return new Date(now - 30 * 24 * 60 * 60 * 1000);
  // default: 7d
  return new Date(now - 7 * 24 * 60 * 60 * 1000);
}

/** Return 'hour' or 'day' truncation unit based on window. */
function truncUnit(window: CostTimeWindow): 'hour' | 'day' {
  return window === '24h' ? 'hour' : 'day';
}

// ============================================================================
// Projection
// ============================================================================

export class CostMetricsProjection extends DbBackedProjectionView<CostMetricsPayload> {
  readonly viewId = 'cost-metrics';

  protected emptyPayload(): CostMetricsPayload {
    return {
      summary: {
        total_cost_usd: 0,
        reported_cost_usd: 0,
        estimated_cost_usd: 0,
        reported_coverage_pct: 0,
        total_tokens: 0,
        prompt_tokens: 0,
        completion_tokens: 0,
        session_count: 0,
        model_count: 0,
        avg_cost_per_session: 0,
        cost_change_pct: 0,
        active_alerts: 0,
      },
      trend: [],
      byModel: [],
      byRepo: [],
      byPattern: [],
      tokenUsage: [],
    };
  }

  protected async querySnapshot(db: Db): Promise<CostMetricsPayload> {
    // Default window for the pre-warmed snapshot: 7d
    const window: CostTimeWindow = '7d';

    const [summary, trend, byModel, byRepo, byPattern, tokenUsage] = await Promise.all([
      this.querySummary(db, window),
      this.queryTrend(db, window),
      this.queryByModel(db),
      this.queryByRepo(db),
      this.queryByPattern(db),
      this.queryTokenUsage(db, window),
    ]);

    return { summary, trend, byModel, byRepo, byPattern, tokenUsage };
  }

  // --------------------------------------------------------------------------
  // Public query methods (routes may call these directly for window-specific data)
  //
  // NOTE: These methods accept a `Db` parameter directly and execute SQL
  // immediately — they do NOT include graceful-degradation logic (i.e., they
  // will throw if the DB is unavailable rather than falling back to a cached
  // snapshot). Callers that need graceful degradation should use
  // `ensureFreshForWindow()` instead, which handles the DB-unavailable case
  // by falling back to `ensureFresh()` transparently.
  // --------------------------------------------------------------------------

  async querySummary(db: Db, window: CostTimeWindow = '7d'): Promise<CostSummary> {
    const lca = llmCostAggregates;
    const cutoff = windowCutoff(window);
    // Prior period starts 2x the window width back
    const windowMs =
      window === '24h'
        ? 24 * 60 * 60 * 1000
        : window === '30d'
          ? 30 * 24 * 60 * 60 * 1000
          : 7 * 24 * 60 * 60 * 1000;
    const priorCutoff = new Date(cutoff.getTime() - windowMs);

    const [current, prior] = await Promise.all([
      db
        .select({
          total_cost: sql<string>`COALESCE(SUM(${lca.totalCostUsd}::numeric), 0)::text`,
          reported_cost: sql<string>`COALESCE(SUM(${lca.reportedCostUsd}::numeric), 0)::text`,
          estimated_cost: sql<string>`COALESCE(SUM(${lca.estimatedCostUsd}::numeric), 0)::text`,
          total_tokens: sql<number>`COALESCE(SUM(${lca.totalTokens}), 0)::bigint`,
          prompt_tokens: sql<number>`COALESCE(SUM(${lca.promptTokens}), 0)::bigint`,
          completion_tokens: sql<number>`COALESCE(SUM(${lca.completionTokens}), 0)::bigint`,
          session_count: sql<number>`COUNT(DISTINCT ${lca.sessionId}) FILTER (WHERE ${lca.sessionId} IS NOT NULL)::int`,
          model_count: sql<number>`COUNT(DISTINCT ${lca.modelName})::int`,
        })
        .from(lca)
        .where(and(gte(lca.bucketTime, cutoff), gt(lca.totalCostUsd, '0'))),
      db
        .select({
          total_cost: sql<string>`COALESCE(SUM(${lca.totalCostUsd}::numeric), 0)::text`,
        })
        .from(lca)
        .where(
          and(
            gte(lca.bucketTime, priorCutoff),
            lt(lca.bucketTime, cutoff),
            gt(lca.totalCostUsd, '0')
          )
        ),
    ]);

    const cur = current[0] ?? {
      total_cost: '0',
      reported_cost: '0',
      estimated_cost: '0',
      total_tokens: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      session_count: 0,
      model_count: 0,
    };

    const totalCost = parseFloat(cur.total_cost);
    const reportedCost = parseFloat(cur.reported_cost);
    const estimatedCost = parseFloat(cur.estimated_cost);
    const sessionCount = Number(cur.session_count);
    const priorCost = parseFloat(prior[0]?.total_cost ?? '0');

    const reportedCoverage = totalCost > 0 ? (reportedCost / totalCost) * 100 : 0;
    const avgCostPerSession = sessionCount > 0 ? totalCost / sessionCount : 0;
    // When current cost drops to zero from a positive prior cost, the change is a full -100%.
    // Without this special case the formula ((0 - priorCost) / priorCost) * 100 = -100 is
    // mathematically correct, but the guard `priorCost > 0` would short-circuit to 0 when
    // totalCost is also 0 — so we handle the zero-current case explicitly.
    const costChangePct =
      priorCost > 0 ? (totalCost === 0 ? -100 : ((totalCost - priorCost) / priorCost) * 100) : 0;

    return {
      total_cost_usd: totalCost,
      reported_cost_usd: reportedCost,
      estimated_cost_usd: estimatedCost,
      reported_coverage_pct: reportedCoverage,
      total_tokens: Number(cur.total_tokens),
      prompt_tokens: Number(cur.prompt_tokens),
      completion_tokens: Number(cur.completion_tokens),
      session_count: sessionCount,
      model_count: Number(cur.model_count),
      avg_cost_per_session: avgCostPerSession,
      cost_change_pct: costChangePct,
      active_alerts: 0, // Budget alerts table not yet implemented
    };
  }

  async queryTrend(db: Db, window: CostTimeWindow = '7d'): Promise<CostTrendPoint[]> {
    const lca = llmCostAggregates;
    const cutoff = windowCutoff(window);
    const unit = truncUnit(window);

    // Explicit allowlist guard before sql.raw() interpolation.
    // truncUnit() already constrains the type to 'hour' | 'day', but this
    // runtime check ensures no future refactor can introduce an unsafe value.
    if (unit !== 'hour' && unit !== 'day') {
      throw new Error(
        `queryTrend: invalid truncation unit '${unit as string}' — must be 'hour' or 'day'`
      );
    }

    const rows = await db
      .select({
        bucket: sql<string>`date_trunc(${sql.raw(`'${unit}'`)}, ${lca.bucketTime})::text`,
        total_cost: sql<string>`COALESCE(SUM(${lca.totalCostUsd}::numeric), 0)::text`,
        reported_cost: sql<string>`COALESCE(SUM(${lca.reportedCostUsd}::numeric), 0)::text`,
        estimated_cost: sql<string>`COALESCE(SUM(${lca.estimatedCostUsd}::numeric), 0)::text`,
        session_count: sql<number>`COUNT(DISTINCT ${lca.sessionId}) FILTER (WHERE ${lca.sessionId} IS NOT NULL)::int`,
      })
      .from(lca)
      .where(and(gte(lca.bucketTime, cutoff), gt(lca.totalCostUsd, '0')))
      .groupBy(sql`date_trunc(${sql.raw(`'${unit}'`)}, ${lca.bucketTime})`)
      .orderBy(sql`date_trunc(${sql.raw(`'${unit}'`)}, ${lca.bucketTime})`);

    return rows.map((r) => ({
      timestamp: r.bucket,
      total_cost_usd: parseFloat(r.total_cost),
      reported_cost_usd: parseFloat(r.reported_cost),
      estimated_cost_usd: parseFloat(r.estimated_cost),
      session_count: Number(r.session_count),
    }));
  }

  async queryByModel(db: Db): Promise<CostByModel[]> {
    const lca = llmCostAggregates;
    // Intentionally hardcoded to 30d regardless of the active trend window.
    // Model breakdowns are designed to show a stable, long-horizon cost
    // distribution so users can compare model share over a meaningful period.
    // Tying the breakdown to the selected trend window (e.g. 24h) would produce
    // misleading percentages because short windows may not contain all models.
    // The trend/summary endpoints respect the window parameter; byModel/byRepo/
    // byPattern always show 30d for consistent context panels.
    const cutoff = windowCutoff('30d');

    const rows = await db
      .select({
        model_name: lca.modelName,
        total_cost: sql<string>`COALESCE(SUM(${lca.totalCostUsd}::numeric), 0)::text`,
        reported_cost: sql<string>`COALESCE(SUM(${lca.reportedCostUsd}::numeric), 0)::text`,
        estimated_cost: sql<string>`COALESCE(SUM(${lca.estimatedCostUsd}::numeric), 0)::text`,
        total_tokens: sql<number>`COALESCE(SUM(${lca.totalTokens}), 0)::bigint`,
        prompt_tokens: sql<number>`COALESCE(SUM(${lca.promptTokens}), 0)::bigint`,
        completion_tokens: sql<number>`COALESCE(SUM(${lca.completionTokens}), 0)::bigint`,
        request_count: sql<number>`COALESCE(SUM(${lca.requestCount}), 0)::int`,
        usage_source: sql<string>`mode() WITHIN GROUP (ORDER BY ${lca.usageSource})`,
      })
      .from(lca)
      .where(and(gte(lca.bucketTime, cutoff), gt(lca.totalCostUsd, '0')))
      .groupBy(lca.modelName)
      .orderBy(desc(sql`SUM(${lca.totalCostUsd}::numeric)`));

    return rows.map((r) => ({
      model_name: r.model_name,
      total_cost_usd: parseFloat(r.total_cost),
      reported_cost_usd: parseFloat(r.reported_cost),
      estimated_cost_usd: parseFloat(r.estimated_cost),
      total_tokens: Number(r.total_tokens),
      prompt_tokens: Number(r.prompt_tokens),
      completion_tokens: Number(r.completion_tokens),
      request_count: Number(r.request_count),
      usage_source: (r.usage_source as UsageSource) ?? 'API',
    }));
  }

  async queryByRepo(db: Db): Promise<CostByRepo[]> {
    const lca = llmCostAggregates;
    // Intentionally hardcoded to 30d — same rationale as queryByModel above.
    // Repo breakdowns are context panels that need a stable long-horizon view,
    // independent of the trend window selected by the user.
    const cutoff = windowCutoff('30d');

    const rows = await db
      .select({
        repo_name: lca.repoName,
        total_cost: sql<string>`COALESCE(SUM(${lca.totalCostUsd}::numeric), 0)::text`,
        reported_cost: sql<string>`COALESCE(SUM(${lca.reportedCostUsd}::numeric), 0)::text`,
        estimated_cost: sql<string>`COALESCE(SUM(${lca.estimatedCostUsd}::numeric), 0)::text`,
        total_tokens: sql<number>`COALESCE(SUM(${lca.totalTokens}), 0)::bigint`,
        session_count: sql<number>`COUNT(DISTINCT ${lca.sessionId}) FILTER (WHERE ${lca.sessionId} IS NOT NULL)::int`,
        usage_source: sql<string>`mode() WITHIN GROUP (ORDER BY ${lca.usageSource})`,
      })
      .from(lca)
      .where(and(gte(lca.bucketTime, cutoff), isNotNull(lca.repoName), gt(lca.totalCostUsd, '0')))
      .groupBy(lca.repoName)
      .orderBy(desc(sql`SUM(${lca.totalCostUsd}::numeric)`));

    return rows
      .filter((r) => r.repo_name != null)
      .map((r) => ({
        repo_name: r.repo_name!,
        total_cost_usd: parseFloat(r.total_cost),
        reported_cost_usd: parseFloat(r.reported_cost),
        estimated_cost_usd: parseFloat(r.estimated_cost),
        total_tokens: Number(r.total_tokens),
        session_count: Number(r.session_count),
        usage_source: (r.usage_source as UsageSource) ?? 'API',
      }));
  }

  async queryByPattern(db: Db): Promise<CostByPattern[]> {
    const lca = llmCostAggregates;
    // Intentionally hardcoded to 30d — same rationale as queryByModel above.
    // Pattern breakdowns are context panels that need a stable long-horizon view,
    // independent of the trend window selected by the user.
    const cutoff = windowCutoff('30d');

    const rows = await db
      .select({
        pattern_id: lca.patternId,
        pattern_name: lca.patternName,
        total_cost: sql<string>`COALESCE(SUM(${lca.totalCostUsd}::numeric), 0)::text`,
        reported_cost: sql<string>`COALESCE(SUM(${lca.reportedCostUsd}::numeric), 0)::text`,
        estimated_cost: sql<string>`COALESCE(SUM(${lca.estimatedCostUsd}::numeric), 0)::text`,
        prompt_tokens: sql<number>`COALESCE(SUM(${lca.promptTokens}), 0)::bigint`,
        completion_tokens: sql<number>`COALESCE(SUM(${lca.completionTokens}), 0)::bigint`,
        injection_count: sql<number>`COALESCE(SUM(${lca.requestCount}), 0)::int`,
        usage_source: sql<string>`mode() WITHIN GROUP (ORDER BY ${lca.usageSource})`,
      })
      .from(lca)
      .where(and(gte(lca.bucketTime, cutoff), isNotNull(lca.patternId), gt(lca.totalCostUsd, '0')))
      .groupBy(lca.patternId, lca.patternName)
      .orderBy(desc(sql`SUM(${lca.totalCostUsd}::numeric)`));

    return rows
      .filter((r) => r.pattern_id != null)
      .map((r) => {
        const totalCost = parseFloat(r.total_cost);
        const injectionCount = Number(r.injection_count);
        return {
          pattern_id: r.pattern_id!,
          pattern_name: r.pattern_name ?? r.pattern_id!,
          total_cost_usd: totalCost,
          reported_cost_usd: parseFloat(r.reported_cost),
          estimated_cost_usd: parseFloat(r.estimated_cost),
          prompt_tokens: Number(r.prompt_tokens),
          completion_tokens: Number(r.completion_tokens),
          injection_count: injectionCount,
          avg_cost_per_injection: injectionCount > 0 ? totalCost / injectionCount : 0,
          usage_source: (r.usage_source as UsageSource) ?? 'API',
        };
      });
  }

  async queryTokenUsage(db: Db, window: CostTimeWindow = '7d'): Promise<TokenUsagePoint[]> {
    const lca = llmCostAggregates;
    const cutoff = windowCutoff(window);
    const unit = truncUnit(window);

    // Explicit allowlist guard before sql.raw() interpolation (same pattern as queryTrend).
    if (unit !== 'hour' && unit !== 'day') {
      throw new Error(
        `queryTokenUsage: invalid truncation unit '${unit as string}' — must be 'hour' or 'day'`
      );
    }

    const rows = await db
      .select({
        bucket: sql<string>`date_trunc(${sql.raw(`'${unit}'`)}, ${lca.bucketTime})::text`,
        prompt_tokens: sql<number>`COALESCE(SUM(${lca.promptTokens}), 0)::bigint`,
        completion_tokens: sql<number>`COALESCE(SUM(${lca.completionTokens}), 0)::bigint`,
        total_tokens: sql<number>`COALESCE(SUM(${lca.totalTokens}), 0)::bigint`,
        // Dominant usage source for the bucket
        usage_source: sql<string>`mode() WITHIN GROUP (ORDER BY ${lca.usageSource})`,
      })
      .from(lca)
      .where(and(gte(lca.bucketTime, cutoff), gt(lca.totalCostUsd, '0')))
      .groupBy(sql`date_trunc(${sql.raw(`'${unit}'`)}, ${lca.bucketTime})`)
      .orderBy(sql`date_trunc(${sql.raw(`'${unit}'`)}, ${lca.bucketTime})`);

    return rows.map((r) => ({
      timestamp: r.bucket,
      prompt_tokens: Number(r.prompt_tokens),
      completion_tokens: Number(r.completion_tokens),
      total_tokens: Number(r.total_tokens),
      usage_source: (r.usage_source as UsageSource) ?? 'API',
    }));
  }

  // --------------------------------------------------------------------------
  // Window-aware fetch (for route handlers with ?window= parameter)
  // --------------------------------------------------------------------------

  /**
   * Return payload for a specific time window, bypassing the 5s TTL cache.
   * Route handlers call this when window != '7d' (the default snapshot window).
   * Encapsulates the DB access so routes don't need to import tryGetIntelligenceDb.
   *
   * Falls back to cached/empty payload if the DB is unavailable.
   *
   * Degraded-state behavior: when `tryGetIntelligenceDb()` returns null (DB
   * not configured or connection failed), this method silently falls back to
   * `ensureFresh()`, which returns the most recent TTL-cached snapshot for the
   * default 7d window (or an empty payload if no snapshot has been warmed yet).
   * The caller receives a successful response with potentially stale or
   * window-mismatched data rather than an error. This is intentional — the
   * dashboard should degrade gracefully rather than surface DB errors to users.
   * Callers that need to distinguish "DB unavailable" from "no data" should
   * check `tryGetIntelligenceDb()` directly before calling this method.
   */
  async ensureFreshForWindow(window: CostTimeWindow): Promise<CostMetricsPayload> {
    const db = tryGetIntelligenceDb();
    if (!db) {
      // DB unavailable — return cached snapshot or empty (see degraded-state
      // behavior note in the JSDoc above).
      return this.ensureFresh();
    }
    const [summary, trend, byModel, byRepo, byPattern, tokenUsage] = await Promise.all([
      this.querySummary(db, window),
      this.queryTrend(db, window),
      this.queryByModel(db),
      this.queryByRepo(db),
      this.queryByPattern(db),
      this.queryTokenUsage(db, window),
    ]);
    return { summary, trend, byModel, byRepo, byPattern, tokenUsage };
  }
}
