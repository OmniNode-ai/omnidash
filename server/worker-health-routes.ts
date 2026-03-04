/**
 * Worker Health API Routes (OMN-3598)
 *
 * REST endpoints for the Runtime Health dashboard:
 * GET /api/worker-health — all worker records + summary + docker availability
 *
 * Data is served from the in-memory WorkerHealthProjection singleton,
 * populated by the worker-health-poller docker inspect poller.
 */

import { Router } from 'express';
import { workerHealthProjection } from './projections/worker-health-projection';

const router = Router();

// ============================================================================
// GET /api/worker-health
// ============================================================================

router.get('/', (_req, res) => {
  try {
    const workers = workerHealthProjection.getAll();
    const summary = workerHealthProjection.getSummary();
    const dockerAvailable = workerHealthProjection.dockerAvailable;
    const restartThreshold = workerHealthProjection.restartThreshold;

    return res.json({
      workers,
      summary,
      dockerAvailable,
      restartThreshold,
    });
  } catch (error) {
    console.error('[worker-health] Error fetching health data:', error);
    return res.status(500).json({ error: 'Failed to fetch worker health' });
  }
});

export default router;
