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
 * @see OMN-6995 Platform Subsystem Verification epic
 */

import { Router } from 'express';
import { tryGetIntelligenceDb } from './storage';
import { sql } from 'drizzle-orm';

const router = Router();

// Staleness thresholds (hours)
const WARN_HOURS = 8;
const STALE_HOURS = 24;

/**
 * Compute effective status considering staleness degradation.
 * - If last verification > STALE_HOURS ago: STALE
 * - If last verification > WARN_HOURS ago: WARN (unless already FAIL)
 * - Otherwise: use the recorded status
 */
function degradeStatus(status: string, verifiedAt: string): string {
  const ageMs = Date.now() - new Date(verifiedAt).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);

  if (ageHours > STALE_HOURS) return 'STALE';
  if (ageHours > WARN_HOURS && status === 'PASS') return 'WARN';
  return status;
}

/**
 * GET /api/subsystem-health
 *
 * Returns the latest verification status for each subsystem.
 * Applies staleness degradation to status values.
 */
router.get('/', async (_req, res) => {
  try {
    const db = tryGetIntelligenceDb();
    if (!db) {
      return res.json({
        subsystems: [],
        checkedAt: new Date().toISOString(),
        _demo: true,
        _message: 'Database not configured. Running in demo-only mode.',
      });
    }

    // Get latest result per subsystem using DISTINCT ON
    const results = await db.execute(sql`
      SELECT DISTINCT ON (subsystem)
        subsystem,
        status,
        test_count,
        pass_count,
        fail_count,
        run_id,
        verified_at,
        details
      FROM subsystem_health_results
      ORDER BY subsystem, verified_at DESC
    `);

    const subsystems = (results.rows as Array<{
      subsystem: string;
      status: string;
      test_count: number;
      pass_count: number;
      fail_count: number;
      run_id: string;
      verified_at: string;
      details: Record<string, unknown>;
    }>).map((row) => ({
      subsystem: row.subsystem,
      status: degradeStatus(row.status, row.verified_at),
      originalStatus: row.status,
      testCount: row.test_count,
      passCount: row.pass_count,
      failCount: row.fail_count,
      passRate: row.test_count > 0
        ? Math.round((row.pass_count / row.test_count) * 100)
        : 0,
      lastVerified: row.verified_at,
      runId: row.run_id,
      details: row.details,
    }));

    return res.json({
      subsystems,
      checkedAt: new Date().toISOString(),
    });
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
    const db = tryGetIntelligenceDb();
    if (!db) {
      return res.status(503).json({ error: 'Database not configured' });
    }

    const { subsystem, status, testCount, passCount, failCount, runId, details } = req.body;

    if (!subsystem || !status || !runId) {
      return res.status(400).json({
        error: 'Missing required fields: subsystem, status, runId',
      });
    }

    await db.execute(sql`
      INSERT INTO subsystem_health_results
        (subsystem, status, test_count, pass_count, fail_count, run_id, details)
      VALUES
        (${subsystem}, ${status}, ${testCount ?? 0}, ${passCount ?? 0}, ${failCount ?? 0}, ${runId}, ${JSON.stringify(details ?? {})}::jsonb)
    `);

    return res.json({ ok: true });
  } catch (err) {
    console.error('[subsystem-health] Error recording result:', err);
    return res.status(500).json({ error: 'Failed to record result' });
  }
});

export default router;
