/**
 * Learned Insights API Routes
 *
 * REST endpoints for the learned insights dashboard: summary and trend.
 * Data originates from OmniMemory / OmniClaude session analysis.
 *
 * Currently returns empty responses to trigger client-side mock fallback.
 * When OmniMemory is live, these endpoints will query the insights tables.
 *
 * @see OMN-1407 - Learned Insights Panel (OmniClaude Integration)
 */

import { Router } from 'express';

const router = Router();

// ============================================================================
// GET /api/insights/summary
// Returns learned insights with confidence scores and evidence
// ============================================================================

router.get('/summary', async (_req, res) => {
  try {
    // TODO: Query OmniMemory insights tables when available
    // For now, return empty to trigger client-side mock fallback
    res.json({
      insights: [],
      total: 0,
      new_this_week: 0,
      avg_confidence: 0,
      total_sessions_analyzed: 0,
      by_type: { pattern: 0, convention: 0, architecture: 0, error: 0, tool: 0 },
    });
  } catch (error) {
    console.error('[insights] Error getting summary:', error);
    res.status(500).json({ error: 'Failed to get insights summary' });
  }
});

// ============================================================================
// GET /api/insights/trend
// Returns insight discovery trend over time
// ============================================================================

router.get('/trend', async (_req, res) => {
  try {
    // TODO: Query OmniMemory insights tables when available
    res.json([]);
  } catch (error) {
    console.error('[insights] Error getting trend:', error);
    res.status(500).json({ error: 'Failed to get insights trend' });
  }
});

export default router;
