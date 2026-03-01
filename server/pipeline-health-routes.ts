/**
 * Pipeline Health API Routes (OMN-3192)
 *
 * REST endpoints for the Pipeline Health dashboard:
 * GET /api/pipeline-health        — all pipeline summaries (PipelineHealthSummary[])
 * GET /api/pipeline-health/:id    — single pipeline by ticket_id
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

router.get('/', (_req, res) => {
  try {
    const pipelines = pipelineHealthProjection.getAllPipelines();
    return res.json(pipelines);
  } catch (error) {
    console.error('[pipeline-health] Error fetching pipelines:', error);
    return res.status(500).json({ error: 'Failed to fetch pipeline health' });
  }
});

// ============================================================================
// GET /api/pipeline-health/:ticketId
// ============================================================================

router.get('/:ticketId', (req, res) => {
  try {
    const { ticketId } = req.params;
    const pipeline = pipelineHealthProjection.getPipelineForTicket(ticketId);
    if (!pipeline) {
      return res.status(404).json({ error: `No pipeline found for ticket ${ticketId}` });
    }
    return res.json(pipeline);
  } catch (error) {
    console.error('[pipeline-health] Error fetching pipeline:', error);
    return res.status(500).json({ error: 'Failed to fetch pipeline' });
  }
});

export default router;
