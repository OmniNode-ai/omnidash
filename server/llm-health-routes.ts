/**
 * LLM Health API Routes (OMN-5279)
 *
 * REST endpoints for the LLM Health Dashboard:
 *   GET /api/llm-health         — latest snapshot per model + recent history
 *   GET /api/llm-health/history — paginated history for a specific model_id
 *
 * Data is served from the omnidash_analytics llm_health_snapshots table,
 * populated by the read-model-consumer projecting llm-health-snapshot events.
 */

import { Router } from 'express';
import { desc, eq, sql } from 'drizzle-orm';
import { tryGetIntelligenceDb } from './storage';
import { llmHealthSnapshots } from '@shared/intelligence-schema';

const router = Router();

// ============================================================================
// GET /api/llm-health
// Returns: { models: LlmModelHealth[], generatedAt: string }
// ============================================================================

router.get('/', async (_req, res) => {
  const db = tryGetIntelligenceDb();
  if (!db) {
    return res.json({ models: [], generatedAt: new Date().toISOString() });
  }

  try {
    // Latest snapshot per model_id using a subquery approach
    const latestPerModel = await db
      .select()
      .from(llmHealthSnapshots)
      .orderBy(desc(llmHealthSnapshots.createdAt))
      .limit(500);

    // Deduplicate: keep only the most recent row per model_id
    const seenModels = new Map<string, (typeof latestPerModel)[0]>();
    for (const row of latestPerModel) {
      if (!seenModels.has(row.modelId)) {
        seenModels.set(row.modelId, row);
      }
    }

    // Recent history (last 50 rows per model, up to 10 models = 500 rows max)
    const recentHistory = latestPerModel.slice(0, 200);

    return res.json({
      models: [...seenModels.values()],
      history: recentHistory,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[llm-health] Error fetching LLM health data:', err);
    return res.status(500).json({ error: 'Failed to fetch LLM health data' });
  }
});

// ============================================================================
// GET /api/llm-health/history?modelId=<id>&limit=<n>
// Returns last N rows for a specific model
// ============================================================================

router.get('/history', async (req, res) => {
  const db = tryGetIntelligenceDb();
  if (!db) {
    return res.json({ rows: [] });
  }

  const modelId = String(req.query.modelId ?? '').trim();
  const limit = Math.min(parseInt(String(req.query.limit ?? '100'), 10) || 100, 500);

  if (!modelId) {
    return res.status(400).json({ error: 'modelId query param required' });
  }

  try {
    const rows = await db
      .select()
      .from(llmHealthSnapshots)
      .where(eq(llmHealthSnapshots.modelId, modelId))
      .orderBy(desc(llmHealthSnapshots.createdAt))
      .limit(limit);

    return res.json({ rows });
  } catch (err) {
    console.error('[llm-health] Error fetching history:', err);
    return res.status(500).json({ error: 'Failed to fetch LLM health history' });
  }
});

export default router;
