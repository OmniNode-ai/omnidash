/**
 * Pipeline Health API Routes (OMN-3192)
 *
 * REST endpoints for the Pipeline Health dashboard:
 * GET /api/pipeline-health            — all pipeline summaries (PipelineHealthSummary[])
 * GET /api/pipeline-health/summary    — aggregated counts by status
 * GET /api/pipeline-health/:ticketId  — single pipeline by ticket_id
 *
 * Data is served from the in-memory PipelineHealthProjection singleton,
 * populated by the pipeline-health-watcher file poller.
 */

import { Router } from 'express';
import { pipelineHealthProjection } from './projections/pipeline-health-projection';

const router = Router();

// ============================================================================
// GET /api/pipeline-health
// ============================================================================

router.get('/', async (_req, res) => {
  try {
    const data = pipelineHealthProjection.getAllPipelines();
    return res.json({ data, source: 'local-projection' });
  } catch (error) {
    console.error('[pipeline-health] Error fetching pipelines:', error);
    return res.status(500).json({ error: 'Failed to fetch pipeline health' });
  }
});

// ============================================================================
// GET /api/pipeline-health/summary
// ============================================================================

router.get('/summary', async (_req, res) => {
  try {
    const pipelines = pipelineHealthProjection.getAllPipelines() as Array<{
      status: string;
      stuck: boolean;
      blocked: boolean;
    }>;
    const total = pipelines.length;
    const running = pipelines.filter((p) => p.status === 'running').length;
    const done = pipelines.filter((p) => p.status === 'done' || p.status === 'merged').length;
    const failed = pipelines.filter((p) => p.status === 'failed').length;
    const stuck = pipelines.filter((p) => p.stuck).length;
    const blocked = pipelines.filter((p) => p.blocked).length;

    return res.json({
      total,
      running,
      done,
      failed,
      stuck,
      blocked,
      source: 'local-projection',
    });
  } catch (error) {
    console.error('[pipeline-health] Error fetching summary:', error);
    return res.status(500).json({ error: 'Failed to fetch pipeline health summary' });
  }
});

// ============================================================================
// GET /api/pipeline-health/:ticketId
// ============================================================================

router.get('/:ticketId', async (req, res) => {
  try {
    const { ticketId } = req.params;
    const pipeline = pipelineHealthProjection.getPipelineForTicket(ticketId);

    if (!pipeline) {
      return res.status(404).json({ error: `No pipeline found for ticket ${ticketId}` });
    }
    return res.json({ data: pipeline, source: 'local-projection' });
  } catch (error) {
    console.error('[pipeline-health] Error fetching pipeline:', error);
    return res.status(500).json({ error: 'Failed to fetch pipeline' });
  }
});

export default router;
