/**
 * Subsystem Health API Routes (OMN-7007)
 *
 * REST endpoints for the subsystem health dashboard page.
 * Reads verification results from subsystem_health_results table
 * (populated by cron-closeout Phase E).
 *
 * GET /api/subsystem-health — Latest status per subsystem
 * POST /api/subsystem-health — Record a verification result
 *
 * Per OMN-2325: route files must not use DB accessors directly.
 * All DB access is delegated to subsystem-health-service.
 *
 * @see OMN-6995 Platform Subsystem Verification epic
 */

import { Router } from 'express';
import {
  getSubsystemHealth,
  recordSubsystemResult,
} from './services/subsystem-health-service';

const router = Router();

/**
 * GET /api/subsystem-health
 *
 * Returns the latest verification status for each subsystem.
 * Applies staleness degradation to status values.
 */
router.get('/', async (_req, res) => {
  try {
    const result = await getSubsystemHealth();
    return res.json(result);
  } catch (err) {
    console.error('[subsystem-health] Error fetching results:', err);
    return res.status(500).json({
      error: 'Failed to fetch subsystem health results',
      subsystems: [],
      checkedAt: new Date().toISOString(),
    });
  }
});

/**
 * POST /api/subsystem-health
 *
 * Record a verification result from cron-closeout Phase E.
 * Called by the close-out pipeline after running verification tests.
 */
router.post('/', async (req, res) => {
  try {
    const { subsystem, status, testCount, passCount, failCount, runId, details } = req.body;

    const error = await recordSubsystemResult({
      subsystem,
      status,
      testCount,
      passCount,
      failCount,
      runId,
      details,
    });

    if (error === 'Database not configured') {
      return res.status(503).json({ error });
    }
    if (error) {
      return res.status(400).json({ error });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[subsystem-health] Error recording result:', err);
    return res.status(500).json({ error: 'Failed to record result' });
  }
});

export default router;
