/**
 * Skill Dashboard API Routes (OMN-5278)
 *
 * REST endpoints for the skill invocation dashboard:
 * GET /api/skills  — top skills by invocation count + recent invocations
 *
 * Data is served directly from the skill_invocations read-model table.
 */

import { Router } from 'express';
import { tryGetIntelligenceDb } from './storage';
import { sql } from 'drizzle-orm';

export function createSkillRouter(): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const db = tryGetIntelligenceDb();
    if (!db) return res.json({ skills: [], recent: [] });
    try {
      const [skills, recent] = await Promise.all([
        db.execute(
          sql`SELECT skill_name, COUNT(*)::int as invocations, AVG(duration_ms)::int as avg_ms, SUM(CASE WHEN success THEN 1 ELSE 0 END)::float / COUNT(*) as success_rate FROM skill_invocations GROUP BY skill_name ORDER BY invocations DESC LIMIT 20`
        ),
        db.execute(
          sql`SELECT * FROM skill_invocations ORDER BY created_at DESC LIMIT 50`
        ),
      ]);
      return res.json({ skills: skills.rows, recent: recent.rows });
    } catch {
      return res.json({ skills: [], recent: [] });
    }
  });

  return router;
}
