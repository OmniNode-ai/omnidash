/**
 * Golden Path Test Routes
 *
 * Gated HTTP endpoint for verifying end-to-end data arrival in the
 * intelligence database. Safe-by-construction: only mounts when ALL
 * activation conditions are met.
 *
 * Activation requires ALL of:
 * - ENABLE_TEST_ROUTES=true
 * - NODE_ENV=test OR OMNIDASH_TEST_MODE=true
 * - TEST_ROUTE_AUTH_TOKEN is set
 *
 * @see OMN-2079 - Golden path dashboard API verification
 */

import { Router } from 'express';
import { tryGetIntelligenceDb } from './storage';
import { sql } from 'drizzle-orm';
import { learnedPatterns, injectionEffectiveness } from '@shared/intelligence-schema';

/**
 * Create golden path test routes.
 * Returns null if test routes are not enabled (safe-by-construction).
 *
 * Activation requires ALL of:
 * - ENABLE_TEST_ROUTES=true
 * - NODE_ENV=test OR OMNIDASH_TEST_MODE=true
 * - TEST_ROUTE_AUTH_TOKEN is set
 */
export function createGoldenPathRoutes(): Router | null {
  const enabled = process.env.ENABLE_TEST_ROUTES === 'true';
  const testEnv = process.env.NODE_ENV === 'test' || process.env.OMNIDASH_TEST_MODE === 'true';
  const authToken = process.env.TEST_ROUTE_AUTH_TOKEN;

  if (!enabled || !testEnv || !authToken) {
    return null;
  }

  const router = Router();

  // Auth middleware
  router.use((req, res, next) => {
    const token = req.headers['x-test-auth'];
    if (token !== authToken) {
      return res.status(401).json({ error: 'Unauthorized: invalid or missing X-Test-Auth header' });
    }
    next();
  });

  // GET /api/test/golden-path/verify
  router.get('/verify', async (req, res) => {
    try {
      const db = tryGetIntelligenceDb();
      if (!db) {
        return res.status(503).json({ error: 'Database not configured' });
      }

      const sessionId = req.query.session_id as string | undefined;
      const since = req.query.since as string | undefined;

      if (!sessionId && !since) {
        return res.status(400).json({ error: 'Required: session_id or since parameter' });
      }

      // Validate "since" time window (P0-2)
      if (since) {
        const sinceDate = new Date(since);
        if (isNaN(sinceDate.getTime())) {
          return res.status(400).json({ error: 'Invalid since timestamp' });
        }
        // Must have explicit timezone (ends with Z or +/-HH:MM)
        if (!/Z|[+-]\d{2}:\d{2}$/.test(since)) {
          return res.status(400).json({ error: 'Timestamp must include timezone (Z or ±HH:MM)' });
        }
        const maxWindowMs = 10 * 60 * 1000;
        const now = new Date();
        if (now.getTime() - sinceDate.getTime() > maxWindowMs) {
          return res.status(400).json({ error: 'Time window exceeds maximum of 10 minutes' });
        }
        if (sinceDate.getTime() > now.getTime()) {
          return res.status(400).json({ error: 'since cannot be in the future' });
        }
      }

      // Query patterns
      let patternCount = 0;
      let patternFound = false;
      let patternHeuristic = false;

      if (sessionId) {
        // Use source_session_ids array containment
        const result = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(learnedPatterns)
          .where(sql`${learnedPatterns.sourceSessionIds} @> ARRAY[${sessionId}]::uuid[]`);
        patternCount = result[0]?.count ?? 0;
        patternFound = patternCount > 0;
      } else if (since) {
        patternHeuristic = true;
        const result = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(learnedPatterns)
          .where(sql`${learnedPatterns.createdAt} >= ${since}::timestamptz`);
        patternCount = result[0]?.count ?? 0;
        patternFound = patternCount > 0;
      }

      // Query effectiveness
      let effectivenessCount = 0;
      let effectivenessFound = false;
      let effectivenessHeuristic = false;

      if (sessionId) {
        const result = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(injectionEffectiveness)
          .where(sql`${injectionEffectiveness.sessionId} = ${sessionId}::uuid`);
        effectivenessCount = result[0]?.count ?? 0;
        effectivenessFound = effectivenessCount > 0;
      } else if (since) {
        effectivenessHeuristic = true;
        const result = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(injectionEffectiveness)
          .where(sql`${injectionEffectiveness.createdAt} >= ${since}::timestamptz`);
        effectivenessCount = result[0]?.count ?? 0;
        effectivenessFound = effectivenessCount > 0;
      }

      res.json({
        patterns: { found: patternFound, count: patternCount, heuristic: patternHeuristic },
        effectiveness: {
          found: effectivenessFound,
          count: effectivenessCount,
          heuristic: effectivenessHeuristic,
        },
      });
    } catch (error) {
      console.error('[golden-path] Verification error:', error);
      res.status(500).json({ error: 'Verification failed' });
    }
  });

  return router;
}
