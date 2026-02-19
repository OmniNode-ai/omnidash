/**
 * BaselinesProjection — DB-backed projection for the Baselines & ROI dashboard (OMN-2331)
 *
 * Encapsulates all SQL queries for the baselines/ROI dashboard behind the
 * ProjectionView interface. Routes call ensureFresh() / ensureFreshForDays()
 * and access sub-fields instead of importing storage or executing SQL directly.
 *
 * Snapshot payload shape matches the combined API output of:
 *   GET /api/baselines/summary
 *   GET /api/baselines/comparisons
 *   GET /api/baselines/trend?days=N
 *   GET /api/baselines/breakdown
 *
 * Source tables: baselines_snapshots, baselines_comparisons, baselines_trend,
 *   baselines_breakdown (defined in shared/intelligence-schema.ts, created by
 *   migrations/0004_baselines_roi.sql).
 *
 * "Latest snapshot" is determined by MAX(computed_at_utc) from baselines_snapshots.
 * All child tables are joined against that snapshot_id.
 */

import { eq, desc, asc } from 'drizzle-orm';
import {
  baselinesSnapshots,
  baselinesComparisons,
  baselinesTrend,
  baselinesBreakdown,
} from '@shared/intelligence-schema';
import type {
  BaselinesSummary,
  PatternComparison,
  ROITrendPoint,
  RecommendationBreakdown,
  DeltaMetric,
  PromotionAction,
  ConfidenceLevel,
} from '@shared/baselines-types';
import { DbBackedProjectionView, DEFAULT_CACHE_TTL_MS } from './db-backed-projection-view';
import { tryGetIntelligenceDb } from '../storage';

// ============================================================================
// Payload type
// ============================================================================

export interface BaselinesPayload {
  summary: BaselinesSummary;
  comparisons: PatternComparison[];
  /**
   * All trend rows for the latest snapshot (no date filter applied).
   * The per-days-filtered view is served by ensureFreshForDays().
   */
  trend: ROITrendPoint[];
  breakdown: RecommendationBreakdown[];
}

type Db = NonNullable<ReturnType<typeof tryGetIntelligenceDb>>;

// ============================================================================
// Helpers
// ============================================================================

function isValidPromotionAction(value: unknown): value is PromotionAction {
  return value === 'promote' || value === 'shadow' || value === 'suppress' || value === 'fork';
}

function isValidConfidenceLevel(value: unknown): value is ConfidenceLevel {
  return value === 'high' || value === 'medium' || value === 'low';
}

function parseDeltaMetric(raw: unknown): DeltaMetric {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      label: '',
      baseline: 0,
      candidate: 0,
      delta: 0,
      direction: 'lower_is_better',
      unit: '',
    };
  }
  const obj = raw as Record<string, unknown>;
  return {
    label: String(obj.label ?? ''),
    baseline: Number(obj.baseline ?? 0),
    candidate: Number(obj.candidate ?? 0),
    delta: Number(obj.delta ?? 0),
    direction: obj.direction === 'higher_is_better' ? 'higher_is_better' : 'lower_is_better',
    unit: String(obj.unit ?? ''),
  };
}

// ============================================================================
// Projection
// ============================================================================

export class BaselinesProjection extends DbBackedProjectionView<BaselinesPayload> {
  readonly viewId = 'baselines';

  protected emptyPayload(): BaselinesPayload {
    return {
      summary: {
        total_comparisons: 0,
        promote_count: 0,
        shadow_count: 0,
        suppress_count: 0,
        fork_count: 0,
        avg_cost_savings: 0,
        avg_outcome_improvement: 0,
        total_token_savings: 0,
        total_time_savings_ms: 0,
        trend_point_count: 0,
      },
      comparisons: [],
      trend: [],
      breakdown: [],
    };
  }

  protected async querySnapshot(db: Db): Promise<BaselinesPayload> {
    const snapshotId = await this._queryLatestSnapshotId(db);
    if (!snapshotId) {
      return this.emptyPayload();
    }

    const [comparisons, trend, breakdown] = await Promise.all([
      this._queryComparisons(db, snapshotId),
      this._queryTrend(db, snapshotId),
      this._queryBreakdown(db, snapshotId),
    ]);

    const summary = this._deriveSummary(comparisons, trend, breakdown);

    return { summary, comparisons, trend, breakdown };
  }

  // --------------------------------------------------------------------------
  // Public API used by route handlers (no db parameter — encapsulated)
  // --------------------------------------------------------------------------

  /**
   * Return the cached payload, applying a date filter to the trend array.
   *
   * The base TTL-cached payload stores ALL trend rows for the latest snapshot.
   * This method re-uses that cache and applies a client-side filter on `date`
   * so the route does not need to re-query the DB per `days` value.
   *
   * TTL: delegates to ensureFresh(), so the same 5-second TTL applies.
   */
  async ensureFreshForDays(days: number): Promise<BaselinesPayload> {
    const payload = await this.ensureFresh();

    // Edge case: days <= 0 returns the full unfiltered dataset (no date cutoff applied).
    // In practice the API route clamps the caller-supplied value to the range [1, 90],
    // so this branch should not be reachable through normal HTTP traffic.
    if (days <= 0) return payload;

    // Timezone limitation: the cutoff is derived from Date.now() (server wall-clock)
    // then converted to UTC via toISOString(). Trend dates are stored as YYYY-MM-DD
    // strings in UTC (written by the upstream producer). If the server's local timezone
    // is behind UTC (e.g. UTC-8), Date.now() at 23:00 local is already the next UTC
    // date, so the cutoff may be one day ahead of what the operator expects. This is
    // a cosmetic off-by-one; no data is lost, but the filtered window may appear one
    // day shorter than requested in western-hemisphere deployments.
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10); // YYYY-MM-DD

    // INTENTIONAL DESIGN: summary.trend_point_count in the returned payload
    // reflects the LIFETIME count (i.e. all trend points in the latest snapshot),
    // NOT the filtered view window (trend.length after applying the days cutoff).
    //
    // This is by design: the summary averages (avg_cost_savings,
    // avg_outcome_improvement) are computed by _deriveSummary() over the full
    // lifetime trend before any date filter is applied.  trend_point_count
    // documents the statistical basis for those averages — how many trend
    // points were used to compute them — so it must match the lifetime count,
    // not the view window.
    //
    // Callers that need the number of points visible in the filtered trend
    // array should use `payload.trend.length` directly after this call.
    //
    // See also: BaselinesSummary.trend_point_count JSDoc in shared/baselines-types.ts.
    return {
      ...payload,
      // NOTE: This comparison relies on lexicographic string ordering.
      // It is only correct when both `t.date` and `cutoff` are in strict
      // YYYY-MM-DD format (zero-padded month and day). Any other format
      // (e.g. M/D/YYYY, ISO with time component) will produce wrong results.
      trend: payload.trend.filter((t) => t.date >= cutoff),
    };
  }

  // --------------------------------------------------------------------------
  // Private query methods (only called by querySnapshot with a Db parameter)
  // --------------------------------------------------------------------------

  private async _queryLatestSnapshotId(db: Db): Promise<string | null> {
    const rows = await db
      .select({ snapshotId: baselinesSnapshots.snapshotId })
      .from(baselinesSnapshots)
      .orderBy(desc(baselinesSnapshots.computedAtUtc))
      .limit(1);

    return rows[0]?.snapshotId ?? null;
  }

  private async _queryComparisons(db: Db, snapshotId: string): Promise<PatternComparison[]> {
    const rows = await db
      .select()
      .from(baselinesComparisons)
      .where(eq(baselinesComparisons.snapshotId, snapshotId))
      .orderBy(asc(baselinesComparisons.patternName));

    return rows.map((r) => {
      const recommendation = isValidPromotionAction(r.recommendation) ? r.recommendation : 'shadow';
      const confidence = isValidConfidenceLevel(r.confidence) ? r.confidence : 'low';

      return {
        pattern_id: r.patternId,
        pattern_name: r.patternName,
        sample_size: r.sampleSize,
        window_start: r.windowStart,
        window_end: r.windowEnd,
        token_delta: parseDeltaMetric(r.tokenDelta),
        time_delta: parseDeltaMetric(r.timeDelta),
        retry_delta: parseDeltaMetric(r.retryDelta),
        test_pass_rate_delta: parseDeltaMetric(r.testPassRateDelta),
        review_iteration_delta: parseDeltaMetric(r.reviewIterationDelta),
        recommendation,
        confidence,
        rationale: r.rationale,
      };
    });
  }

  private async _queryTrend(db: Db, snapshotId: string): Promise<ROITrendPoint[]> {
    const rows = await db
      .select()
      .from(baselinesTrend)
      .where(eq(baselinesTrend.snapshotId, snapshotId))
      .orderBy(asc(baselinesTrend.date));

    return rows.map((r) => {
      const rawCostSavings = parseFloat(r.avgCostSavings);
      const rawOutcomeImprovement = parseFloat(r.avgOutcomeImprovement);
      return {
        date: r.date,
        avg_cost_savings: isFinite(rawCostSavings) ? rawCostSavings : 0,
        avg_outcome_improvement: isFinite(rawOutcomeImprovement) ? rawOutcomeImprovement : 0,
        comparisons_evaluated: r.comparisonsEvaluated,
      };
    });
  }

  private async _queryBreakdown(db: Db, snapshotId: string): Promise<RecommendationBreakdown[]> {
    const rows = await db
      .select()
      .from(baselinesBreakdown)
      .where(eq(baselinesBreakdown.snapshotId, snapshotId))
      .orderBy(asc(baselinesBreakdown.action));

    return rows.map((r) => {
      const rawConfidence = parseFloat(r.avgConfidence);
      let action: PromotionAction;
      if (isValidPromotionAction(r.action)) {
        action = r.action;
      } else {
        console.warn(
          `[baselines-projection] Unknown recommendation '${r.action}' for snapshot ${snapshotId}, defaulting to 'shadow'`
        );
        action = 'shadow';
      }
      return {
        action,
        count: r.count,
        avg_confidence: isFinite(rawConfidence) ? rawConfidence : 0,
      };
    });
  }

  // --------------------------------------------------------------------------
  // Summary derivation (avoids an extra DB round-trip)
  // --------------------------------------------------------------------------

  /**
   * Derive BaselinesSummary from the child-table rows that were already fetched.
   * No additional DB round-trip is needed: all data required for the summary is
   * present in comparisons, trend, and breakdown.
   */
  private _deriveSummary(
    comparisons: PatternComparison[],
    trend: ROITrendPoint[],
    breakdown: RecommendationBreakdown[]
  ): BaselinesSummary {
    const promoteCounts: Record<PromotionAction, number> = {
      promote: 0,
      shadow: 0,
      suppress: 0,
      fork: 0,
    };
    for (const b of breakdown) {
      promoteCounts[b.action] = b.count;
    }

    // Aggregate token and time savings across all comparison rows.
    // Savings = baseline - candidate for 'lower_is_better' metrics.
    let totalTokenSavings = 0;
    let totalTimeSavingsMs = 0;
    for (const c of comparisons) {
      if (c.token_delta.direction === 'lower_is_better') {
        totalTokenSavings += c.token_delta.baseline - c.token_delta.candidate;
      }
      if (c.time_delta.direction === 'lower_is_better') {
        totalTimeSavingsMs += c.time_delta.baseline - c.time_delta.candidate;
      }
    }

    // Compute the global lifetime average cost savings and outcome improvement.
    //
    // Semantic: arithmetic mean of `avg_cost_savings` (and `avg_outcome_improvement`)
    // across every trend point in the latest snapshot.
    //
    // Important caveats:
    //   - NOT weighted by `comparisons_evaluated`: a day with 1 comparison contributes
    //     equally to the mean as a day with 1 000 comparisons.
    //   - Uses the FULL cached trend window — the same `trend` array that was fetched
    //     for the latest snapshot without any day-filter applied.  ensureFreshForDays()
    //     applies a post-hoc date filter to the trend array for per-request windowing,
    //     but _deriveSummary() is called before that filter and therefore always reflects
    //     the global lifetime average, not a windowed metric.
    //   - This is a "mean of trend-point means": each `avg_cost_savings` value in
    //     `baselinesTrend` is itself a per-day average stored by the upstream writer;
    //     we are averaging those per-day averages here.
    const avgCostSavings =
      trend.length > 0 ? trend.reduce((sum, t) => sum + t.avg_cost_savings, 0) / trend.length : 0;
    const avgOutcomeImprovement =
      trend.length > 0
        ? trend.reduce((sum, t) => sum + t.avg_outcome_improvement, 0) / trend.length
        : 0;

    // NOTE: total_comparisons counts rows in the comparisons table (may be capped at
    // MAX_BATCH_ROWS on ingest), while promote_count/shadow_count/etc. come from the
    // breakdown table (pre-aggregated by the producer). If the batch cap fired, these
    // two sources will disagree. This is expected and documented behaviour.
    return {
      total_comparisons: comparisons.length,
      promote_count: promoteCounts.promote,
      shadow_count: promoteCounts.shadow,
      suppress_count: promoteCounts.suppress,
      fork_count: promoteCounts.fork,
      avg_cost_savings: avgCostSavings,
      avg_outcome_improvement: avgOutcomeImprovement,
      total_token_savings: totalTokenSavings,
      total_time_savings_ms: totalTimeSavingsMs,
      trend_point_count: trend.length,
    };
  }
}

// Re-export DEFAULT_CACHE_TTL_MS so tests can use the same constant
export { DEFAULT_CACHE_TTL_MS };
