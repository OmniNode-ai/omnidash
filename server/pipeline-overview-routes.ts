/**
 * Pipeline Overview API Routes (OMN-6753)
 *
 * Aggregates signals from pipeline-health, epic-run, and pipeline-budget
 * into a single summary endpoint for the /pipeline landing page.
 *
 *   GET /api/pipeline-overview — summary stats from sub-dashboards
 */

import { Router } from 'express';
import { pipelineHealthProjection } from './projections/pipeline-health-projection';
import { epicRunProjection } from './projection-bootstrap';
import { sql } from 'drizzle-orm';
import { tryGetIntelligenceDb } from './storage';

const router = Router();

// ============================================================================
// GET /api/pipeline-overview
// ============================================================================

router.get('/', async (_req, res) => {
  try {
    // Pipeline health summary
    let pipelineHealth = { total: 0, stuck: 0, active: 0 };
    try {
      const pipelines = pipelineHealthProjection.getAllPipelines();
      pipelineHealth = {
        total: pipelines.length,
        stuck: pipelines.filter((p: any) => p.stuck).length,
        active: pipelines.filter((p: any) => !p.stuck && p.status === 'active').length,
      };
    } catch {
      // projection not ready
    }

    // Epic run summary
    let epicRun = { totalRuns: 0, activeRuns: 0 };
    try {
      const snapshot = await epicRunProjection.ensureFresh();
      const events = snapshot?.events || [];
      epicRun = {
        totalRuns: events.length,
        activeRuns: events.filter((e: any) => e.status === 'running').length,
      };
    } catch {
      // projection not ready
    }

    // Pipeline budget summary from DB
    let budget = { totalBudgets: 0, overBudget: 0 };
    try {
      const db = tryGetIntelligenceDb();
      if (db) {
        const result = await db.execute(
          sql`SELECT
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE budget_exceeded = true)::int AS over_budget
              FROM pipeline_budget_state`
        );
        const row = result.rows[0] as any;
        if (row) {
          budget = { totalBudgets: row.total || 0, overBudget: row.over_budget || 0 };
        }
      }
    } catch {
      // table may not exist
    }

    return res.json({
      pipelineHealth,
      epicRun,
      budget,
    });
  } catch (error) {
    console.error('[pipeline-overview] Error fetching data:', error);
    return res.status(500).json({ error: 'Failed to fetch pipeline overview' });
  }
});

export default router;
