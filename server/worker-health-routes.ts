/**
 * Worker Health API Routes (OMN-3598)
 *
 * REST endpoints for the Runtime Health dashboard:
 * GET /api/worker-health — all worker records + summary + docker availability
 *
 * Data is served from the in-memory WorkerHealthProjection singleton,
 * populated by the worker-health-poller docker inspect poller.
 *
 * Uses DataSourceWithFallback (OMN-5202): prefers Kafka read-model when
 * available; falls back to local docker-poll projection on failure.
 * The `source` field in the response indicates which tier was used.
 */

import { Router } from 'express';
import { workerHealthProjection, WorkerHealthSummary } from './projections/worker-health-projection';
import { withFallback } from './lib/data-source-fallback';

const router = Router();

// ============================================================================
// GET /api/worker-health
// ============================================================================

router.get('/', async (_req, res) => {
  try {
    // Primary: Kafka read-model (not yet wired — throws immediately so local is used)
    // TODO(OMN-6111): replace primary stub with read-model query once Kafka projection exists
    const result = await withFallback(
      async () => {
        throw new Error('kafka read-model not yet wired for worker-health');
      },
      async () => {
        const workers = workerHealthProjection.getAll();
        const summary = workerHealthProjection.getSummary();
        const dockerAvailable = workerHealthProjection.dockerAvailable;
        const restartThreshold = workerHealthProjection.restartThreshold;
        return { workers, summary, dockerAvailable, restartThreshold };
      },
      { workers: [], summary: { total: 0, healthy: 0, restarting: 0, down: 0 } as WorkerHealthSummary, dockerAvailable: false, restartThreshold: 3 }
    );

    return res.json({ ...result.data, source: result.source });
  } catch (error) {
    console.error('[worker-health] Error fetching health data:', error);
    return res.status(500).json({ error: 'Failed to fetch worker health' });
  }
});

export default router;
