/**
 * Contract Drift API Routes (OMN-6753)
 *
 * REST endpoints for the /drift dashboard:
 *   GET /api/contract-drift          — recent events + summary by type and severity
 *   GET /api/contract-drift/by-repo  — drift counts grouped by repository
 *
 * Source table: contract_drift_events (populated by ChangeControlProjectionHandler)
 * Source topic: onex.evt.onex-change-control.contract-drift-detected.v1
 */

import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { tryGetIntelligenceDb } from './storage';

const router = Router();

// ============================================================================
// GET /api/contract-drift
// ============================================================================

router.get('/', async (_req, res) => {
  const db = tryGetIntelligenceDb();
  if (!db) {
    return res.json({ recent: [], bySeverity: [], byType: [] });
  }
  try {
    const recent = await db.execute(
      sql`SELECT id, repo, node_name, drift_type, severity, description,
                 expected_value, actual_value, contract_path, detected_at, created_at
          FROM contract_drift_events
          ORDER BY detected_at DESC
          LIMIT 100`
    );
    const bySeverity = await db.execute(
      sql`SELECT severity, COUNT(*)::int AS count
          FROM contract_drift_events
          GROUP BY severity
          ORDER BY count DESC`
    );
    const byType = await db.execute(
      sql`SELECT drift_type, COUNT(*)::int AS count
          FROM contract_drift_events
          GROUP BY drift_type
          ORDER BY count DESC`
    );
    return res.json({
      recent: recent.rows,
      bySeverity: bySeverity.rows,
      byType: byType.rows,
    });
  } catch (error) {
    console.error('[contract-drift] Error fetching data:', error);
    return res.json({ recent: [], bySeverity: [], byType: [] });
  }
});

// ============================================================================
// GET /api/contract-drift/by-repo
// ============================================================================

router.get('/by-repo', async (_req, res) => {
  const db = tryGetIntelligenceDb();
  if (!db) {
    return res.json({ repos: [] });
  }
  try {
    const repos = await db.execute(
      sql`SELECT repo, COUNT(*)::int AS total,
                 COUNT(*) FILTER (WHERE severity = 'critical')::int AS critical,
                 COUNT(*) FILTER (WHERE severity = 'high')::int AS high,
                 MAX(detected_at) AS last_detected
          FROM contract_drift_events
          GROUP BY repo
          ORDER BY total DESC`
    );
    return res.json({ repos: repos.rows });
  } catch (error) {
    console.error('[contract-drift] Error fetching by-repo data:', error);
    return res.json({ repos: [] });
  }
});

export default router;
