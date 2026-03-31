/**
 * Intent Breakdown API Routes (OMN-5288)
 *
 * REST endpoint for the IntentDashboard classification breakdown card:
 *   GET /api/intents/breakdown — grouped intent_type counts from intent_signals
 *
 * Source table: intent_signals (populated by OmniintelligenceProjectionHandler)
 * Source topic: onex.evt.omniintelligence.intent-classified.v1
 */

import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { tryGetIntelligenceDb } from './storage';

const router = Router();

// ============================================================================
// GET /api/intents/breakdown
// ============================================================================

router.get('/', async (_req, res) => {
  const db = tryGetIntelligenceDb();
  if (!db) {
    return res.json({ breakdown: [] });
  }
  try {
    const result = await db.execute(
      sql`SELECT intent_type, COUNT(*)::int AS count
          FROM intent_signals
          GROUP BY intent_type
          ORDER BY count DESC`
    );
    return res.json({ breakdown: result.rows });
  } catch (error) {
    console.error('[intent-breakdown] Error fetching data:', error);
    return res.json({ breakdown: [] });
  }
});

export default router;
