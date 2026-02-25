/**
 * Learned Insights API Routes
 *
 * REST endpoints for the learned insights dashboard: summary and trend.
 * Data originates from the learned_patterns table (OmniMemory projections).
 *
 * Graceful degradation: when database is not configured, returns empty
 * responses so the client falls back to mock data.
 *
 * @see OMN-2306 - Connect Learned Insights page to OmniMemory API
 * @see OMN-1407 - Learned Insights Panel (OmniClaude Integration)
 */

import { Router } from 'express';
import { queryInsightsSummary, queryInsightsTrend } from './insight-queries';

const router = Router();

// ============================================================================
// GET /api/insights/summary
// Returns learned insights with confidence scores and evidence
// ============================================================================

router.get('/summary', async (_req, res) => {
  try {
    const result = await queryInsightsSummary();

    // Graceful degradation: database not configured
    if (result === null) {
      console.log('[Insights] Database not configured - returning empty response (demo mode)');
      return res.json({
        insights: [],
        total: 0,
        new_this_week: 0,
        avg_confidence: 0,
        total_sessions_analyzed: 0,
        by_type: { pattern: 0, convention: 0, architecture: 0, error: 0, tool: 0 },
      });
    }

    // No caching for real-time data
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    });

    res.json(result);
  } catch (error) {
    console.error('[insights] Error getting summary:', error);
    res.status(500).json({ error: 'Failed to get insights summary' });
  }
});

// ============================================================================
// GET /api/insights/trend
// Returns insight discovery trend over time (default 14 days)
// ============================================================================

router.get('/trend', async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(String(req.query.days ?? '14'), 10) || 14, 1), 90);

    const result = await queryInsightsTrend(days);

    // Graceful degradation: database not configured
    if (result === null) {
      console.log('[Insights] Database not configured - returning empty trend (demo mode)');
      return res.json([]);
    }

    // No caching for real-time data
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    });

    res.json(result);
  } catch (error) {
    console.error('[insights] Error getting trend:', error);
    res.status(500).json({ error: 'Failed to get insights trend' });
  }
});

export default router;
