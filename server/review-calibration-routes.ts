/**
 * Review Calibration API Routes (OMN-6176)
 *
 * REST endpoints for the review calibration dashboard:
 * GET /api/review-calibration/history   — calibration run history
 * GET /api/review-calibration/scores    — per-model accuracy scores
 * GET /api/review-calibration/fewshot-log — few-shot prompt metadata
 *
 * Data is served from the review_calibration_runs_rm read-model table,
 * projected from Kafka events by the read-model consumer.
 */

import { Router } from 'express';
import { sql, desc } from 'drizzle-orm';
import { tryGetIntelligenceDb } from './storage';
import { reviewCalibrationRuns } from '@shared/intelligence-schema';

const router = Router();

// ============================================================================
// GET /api/review-calibration/history
// ============================================================================

router.get('/history', async (req, res) => {
  try {
    const db = tryGetIntelligenceDb();
    if (!db) {
      return res.json({ runs: [] });
    }

    const model = req.query.model as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);

    const conditions = model ? sql`${reviewCalibrationRuns.challengerModel} = ${model}` : undefined;

    const runs = await db
      .select({
        runId: reviewCalibrationRuns.runId,
        groundTruthModel: reviewCalibrationRuns.groundTruthModel,
        challengerModel: reviewCalibrationRuns.challengerModel,
        precision: reviewCalibrationRuns.precision,
        recall: reviewCalibrationRuns.recall,
        f1: reviewCalibrationRuns.f1,
        noiseRatio: reviewCalibrationRuns.noiseRatio,
        createdAt: reviewCalibrationRuns.createdAt,
      })
      .from(reviewCalibrationRuns)
      .where(conditions)
      .orderBy(desc(reviewCalibrationRuns.createdAt))
      .limit(limit);

    const formatted = runs.map((r) => ({
      run_id: r.runId,
      ground_truth_model: r.groundTruthModel,
      challenger_model: r.challengerModel,
      precision: r.precision,
      recall: r.recall,
      f1: r.f1,
      noise_ratio: r.noiseRatio,
      created_at: r.createdAt?.toISOString() ?? null,
    }));

    return res.json({ runs: formatted });
  } catch (error) {
    console.error('[review-calibration] Error fetching history:', error);
    return res.status(500).json({ error: 'Failed to fetch calibration history' });
  }
});

// ============================================================================
// GET /api/review-calibration/scores
// ============================================================================

router.get('/scores', async (_req, res) => {
  try {
    const db = tryGetIntelligenceDb();
    if (!db) {
      return res.json({ models: [] });
    }

    const rows = await db
      .select({
        modelId: reviewCalibrationRuns.challengerModel,
        scoreCorrectness: sql<number>`ROUND(AVG(${reviewCalibrationRuns.f1})::numeric, 4)`,
        runCount: sql<number>`COUNT(*)::int`,
        calibrationRunCount: sql<number>`COUNT(DISTINCT ${reviewCalibrationRuns.runId})::int`,
      })
      .from(reviewCalibrationRuns)
      .groupBy(reviewCalibrationRuns.challengerModel)
      .orderBy(sql`AVG(${reviewCalibrationRuns.f1}) DESC`);

    const models = rows.map((r) => ({
      model_id: r.modelId,
      score_correctness: parseFloat(r.scoreCorrectness?.toString() ?? '0'),
      run_count: r.runCount,
      calibration_run_count: r.calibrationRunCount,
    }));

    return res.json({ models });
  } catch (error) {
    console.error('[review-calibration] Error fetching scores:', error);
    return res.status(500).json({ error: 'Failed to fetch calibration scores' });
  }
});

// ============================================================================
// GET /api/review-calibration/fewshot-log
// ============================================================================

router.get('/fewshot-log', async (_req, res) => {
  try {
    const db = tryGetIntelligenceDb();
    if (!db) {
      return res.json({ prompt_version: null, example_count: 0, last_updated: null });
    }

    // Few-shot log is derived from calibration run metadata.
    // For now, return the latest run count and timestamp as a proxy.
    const result = await db
      .select({
        exampleCount: sql<number>`COUNT(*)::int`,
        lastUpdated: sql<string>`MAX(${reviewCalibrationRuns.createdAt})::text`,
      })
      .from(reviewCalibrationRuns);

    const row = result[0];
    return res.json({
      prompt_version: row && row.exampleCount > 0 ? 'v1' : null,
      example_count: row?.exampleCount ?? 0,
      last_updated: row?.lastUpdated ?? null,
    });
  } catch (error) {
    console.error('[review-calibration] Error fetching fewshot log:', error);
    return res.status(500).json({ error: 'Failed to fetch fewshot log' });
  }
});

export default router;
