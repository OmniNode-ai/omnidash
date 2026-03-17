/**
 * Pipeline Health API Routes (OMN-3192)
 *
 * REST endpoints for the Pipeline Health dashboard:
 * GET /api/pipeline-health        — all pipeline summaries (PipelineHealthSummary[])
 * GET /api/pipeline-health/:id    — single pipeline by ticket_id
 *
 * Data is served from the in-memory PipelineHealthProjection singleton,
 * populated by the pipeline-health-watcher file poller.
 *
 * Uses DataSourceWithFallback (OMN-5202): prefers Kafka read-model when
 * available; falls back to local file-poll projection on failure.
 * The `source` field in the response indicates which tier was used.
 */

import { Router } from 'express';
import { pipelineHealthProjection } from './projections/pipeline-health-projection';
import { withFallback } from './lib/data-source-fallback';

const router = Router();

// ============================================================================
// GET /api/pipeline-health
// ============================================================================

router.get('/', async (_req, res) => {
  try {
    // Primary: Kafka read-model (not yet wired — throws immediately so local is used)
    // TODO: replace primary stub with read-model query once Kafka projection exists
    const result = await withFallback(
      async () => {
        throw new Error('kafka read-model not yet wired for pipeline-health');
      },
      async () => pipelineHealthProjection.getAllPipelines(),
      []
    );

    return res.json({ data: result.data, source: result.source });
  } catch (error) {
    console.error('[pipeline-health] Error fetching pipelines:', error);
    return res.status(500).json({ error: 'Failed to fetch pipeline health' });
  }
});

// ============================================================================
// GET /api/pipeline-health/:ticketId
// ============================================================================

router.get('/:ticketId', async (req, res) => {
  try {
    const { ticketId } = req.params;

    const result = await withFallback(
      async () => {
        throw new Error('kafka read-model not yet wired for pipeline-health');
      },
      async () => {
        const pipeline = pipelineHealthProjection.getPipelineForTicket(ticketId);
        if (!pipeline) throw new Error(`no pipeline for ticket ${ticketId}`);
        return pipeline;
      },
      null
    );

    if (result.source === 'empty' || result.data === null) {
      return res.status(404).json({ error: `No pipeline found for ticket ${ticketId}` });
    }
    return res.json({ data: result.data, source: result.source });
  } catch (error) {
    console.error('[pipeline-health] Error fetching pipeline:', error);
    return res.status(500).json({ error: 'Failed to fetch pipeline' });
  }
});

export default router;
