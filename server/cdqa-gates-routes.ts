/**
 * CDQA Gate API Routes (OMN-3190)
 *
 * REST endpoints for the CDQA gate dashboard:
 * GET /api/cdqa-gates  — all PR gate summaries (PrGateSummary[])
 *
 * Data is served from the in-memory CdqaGateProjection singleton,
 * populated by the cdqa-gate-watcher file poller.
 */

import { Router } from 'express';
import { cdqaGateProjection } from './projections/cdqa-gate-projection';

const router = Router();

// ============================================================================
// GET /api/cdqa-gates
// ============================================================================

router.get('/', (_req, res) => {
  try {
    const summaries = cdqaGateProjection.getAllSummaries();
    return res.json(summaries);
  } catch (error) {
    console.error('[cdqa-gates] Error fetching gate summaries:', error);
    return res.status(500).json({ error: 'Failed to fetch CDQA gate summaries' });
  }
});

export default router;
