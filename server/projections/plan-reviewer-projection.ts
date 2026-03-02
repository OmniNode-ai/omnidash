/**
 * PlanReviewerProjection — DB-backed projection for plan review runs (OMN-3324)
 *
 * Encapsulates queries against the plan_review_runs table behind the
 * ProjectionView interface. Routes call ensureFresh() instead of executing
 * SQL directly, per the OMN-2325 architectural rule.
 *
 * Snapshot payload shape:
 *   {
 *     runs: PlanReviewRunRow[];          // latest 50 runs ordered by emitted_at DESC
 *     strategies: StrategyAggregate[];   // per-strategy aggregates
 *     accuracy: AccuracySnapshot;        // latest model_weights snapshot
 *   }
 */

import { desc, asc, sql, isNotNull } from 'drizzle-orm';
import { planReviewRuns } from '@shared/intelligence-schema';
import type { PlanReviewRunRow } from '@shared/intelligence-schema';
import { DbBackedProjectionView } from './db-backed-projection-view';
import { tryGetIntelligenceDb } from '../storage';

// ============================================================================
// Payload types
// ============================================================================

export interface StrategyAggregate {
  strategy: string;
  run_count: number;
  avg_confidence: number | null;
  avg_findings_count: number;
  avg_blocks_count: number;
  block_rate: number | null;
  avg_duration_ms: number | null;
}

export interface AccuracySnapshot {
  label: 'latest_snapshot';
  run_id: string | null;
  strategy: string | null;
  emitted_at: Date | null;
  model_weights: Record<string, number> | null;
}

export interface PlanReviewerProjectionPayload {
  runs: PlanReviewRunRow[];
  strategies: StrategyAggregate[];
  accuracy: AccuracySnapshot;
}

// ============================================================================
// Projection
// ============================================================================

type Db = NonNullable<ReturnType<typeof tryGetIntelligenceDb>>;

export class PlanReviewerProjection extends DbBackedProjectionView<PlanReviewerProjectionPayload> {
  readonly viewId = 'plan-reviewer';

  protected emptyPayload(): PlanReviewerProjectionPayload {
    return {
      runs: [],
      strategies: [],
      accuracy: {
        label: 'latest_snapshot',
        run_id: null,
        strategy: null,
        emitted_at: null,
        model_weights: null,
      },
    };
  }

  protected async querySnapshot(db: Db, limit = 50): Promise<PlanReviewerProjectionPayload> {
    const safeLimit = Math.min(limit, 100);

    // Fetch recent runs
    const runs = await db
      .select()
      .from(planReviewRuns)
      .orderBy(desc(planReviewRuns.emittedAt))
      .limit(safeLimit);

    // Fetch per-strategy aggregates
    const strategyRows = await db
      .select({
        strategy: planReviewRuns.strategy,
        run_count: sql<number>`COUNT(*)::int`,
        avg_confidence: sql<number | null>`AVG(${planReviewRuns.avgConfidence})`,
        avg_findings_count: sql<number>`AVG(${planReviewRuns.findingsCount})::float`,
        avg_blocks_count: sql<number>`AVG(${planReviewRuns.blocksCount})::float`,
        block_rate: sql<number | null>`
          CASE WHEN SUM(${planReviewRuns.findingsCount}) = 0 THEN NULL
          ELSE SUM(${planReviewRuns.blocksCount})::float /
               NULLIF(SUM(${planReviewRuns.findingsCount}), 0)
          END
        `,
        avg_duration_ms: sql<number | null>`AVG(${planReviewRuns.durationMs})`,
      })
      .from(planReviewRuns)
      .groupBy(planReviewRuns.strategy)
      .orderBy(asc(planReviewRuns.strategy));

    // Fetch latest accuracy snapshot (most recent run with non-null model_weights)
    const accuracyRows = await db
      .select({
        runId: planReviewRuns.runId,
        strategy: planReviewRuns.strategy,
        modelWeights: planReviewRuns.modelWeights,
        emittedAt: planReviewRuns.emittedAt,
      })
      .from(planReviewRuns)
      .where(isNotNull(planReviewRuns.modelWeights))
      .orderBy(desc(planReviewRuns.emittedAt))
      .limit(1);

    const latestAccuracy = accuracyRows[0];
    const accuracy: AccuracySnapshot = {
      label: 'latest_snapshot',
      run_id: latestAccuracy?.runId ?? null,
      strategy: latestAccuracy?.strategy ?? null,
      emitted_at: latestAccuracy?.emittedAt ?? null,
      model_weights:
        latestAccuracy?.modelWeights != null
          ? (latestAccuracy.modelWeights as Record<string, number>)
          : null,
    };

    return {
      runs,
      strategies: strategyRows,
      accuracy,
    };
  }
}
