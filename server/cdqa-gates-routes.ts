/**
 * CDQA Gate API Routes (OMN-3190)
 *
 * REST endpoints for the CDQA gate dashboard:
 * GET /api/cdqa-gates  — all PR gate summaries (PrGateSummary[])
 *
 * Data is served from the in-memory CdqaGateProjection singleton,
 * populated by the cdqa-gate-watcher file poller.
 *
 * Uses DataSourceWithFallback (OMN-5202): prefers Kafka read-model when
 * available; falls back to local file-poll projection on failure.
 * The `source` field in the response indicates which tier was used.
 */

import { Router } from 'express';
import { cdqaGateProjection } from './projections/cdqa-gate-projection';
import { withFallback } from './lib/data-source-fallback';

const router = Router();

// ============================================================================
// GET /api/cdqa-gates
// ============================================================================

router.get('/', async (_req, res) => {
  try {
    // Primary: Kafka read-model (not yet wired — throws immediately so local is used)
    // TODO: replace primary stub with read-model query once Kafka projection exists
    const result = await withFallback(
      async () => {
        throw new Error('kafka read-model not yet wired for cdqa-gates');
      },
      async () => cdqaGateProjection.getAllSummaries(),
      []
    );

    return res.json({ data: result.data, source: result.source });
  } catch (error) {
    console.error('[cdqa-gates] Error fetching gate summaries:', error);
    return res.status(500).json({ error: 'Failed to fetch CDQA gate summaries' });
  }
});

export default router;
