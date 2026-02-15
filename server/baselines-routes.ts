/**
 * Baselines & ROI API Routes (OMN-2156)
 *
 * REST endpoints for the baselines/ROI dashboard: summary, comparisons,
 * trend, and recommendation breakdown.
 *
 * Currently returns empty/placeholder responses. When the upstream
 * baselines tables are created, replace with real Drizzle queries
 * following the same pattern as effectiveness-routes.ts.
 */

import { Router } from 'express';
import type {
  BaselinesSummary,
  PatternComparison,
  ROITrendPoint,
  RecommendationBreakdown,
} from '@shared/baselines-types';

const router = Router();

// ============================================================================
// GET /api/baselines/summary
// ============================================================================

router.get('/summary', async (_req, res) => {
  try {
    // TODO: Replace with real database query when baselines tables exist.
    // For now, return an empty summary so the client falls back to mock data.
    const summary: BaselinesSummary = {
      total_comparisons: 0,
      promote_count: 0,
      shadow_count: 0,
      suppress_count: 0,
      fork_count: 0,
      avg_cost_savings: 0,
      avg_outcome_improvement: 0,
      total_token_savings: 0,
      total_time_savings_ms: 0,
    };
    return res.json(summary);
  } catch (error) {
    console.error('[baselines] Error fetching summary:', error);
    return res.status(500).json({ error: 'Failed to fetch baselines summary' });
  }
});

// ============================================================================
// GET /api/baselines/comparisons
// ============================================================================

router.get('/comparisons', async (_req, res) => {
  try {
    // TODO: Replace with real database query when baselines tables exist.
    const comparisons: PatternComparison[] = [];
    return res.json(comparisons);
  } catch (error) {
    console.error('[baselines] Error fetching comparisons:', error);
    return res.status(500).json({ error: 'Failed to fetch baselines comparisons' });
  }
});

// ============================================================================
// GET /api/baselines/trend?days=14
// ============================================================================

router.get('/trend', async (_req, res) => {
  try {
    // TODO: Replace with real database query when baselines tables exist.
    // The `days` query param (e.g. ?days=14) will be used for time-window filtering.
    const trend: ROITrendPoint[] = [];
    return res.json(trend);
  } catch (error) {
    console.error('[baselines] Error fetching trend:', error);
    return res.status(500).json({ error: 'Failed to fetch baselines trend' });
  }
});

// ============================================================================
// GET /api/baselines/breakdown
// ============================================================================

router.get('/breakdown', async (_req, res) => {
  try {
    // TODO: Replace with real database query when baselines tables exist.
    const breakdown: RecommendationBreakdown[] = [];
    return res.json(breakdown);
  } catch (error) {
    console.error('[baselines] Error fetching breakdown:', error);
    return res.status(500).json({ error: 'Failed to fetch baselines breakdown' });
  }
});

export default router;
