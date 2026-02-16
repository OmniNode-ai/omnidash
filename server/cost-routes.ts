/**
 * Cost Trend API Routes (OMN-2242)
 *
 * REST endpoints for the LLM cost and token usage trend dashboard:
 * summary, trend, by-model, by-repo, by-pattern, token-usage, alerts.
 *
 * Currently returns empty/placeholder responses so the client falls
 * back to mock data. When the upstream aggregation service (OMN-2240)
 * populates the llm_cost_aggregates table, replace with real Drizzle
 * queries following the same pattern as baselines-routes.ts.
 */

import { Router } from 'express';
import type {
  CostSummary,
  CostTrendPoint,
  CostByModel,
  CostByRepo,
  CostByPattern,
  TokenUsagePoint,
  BudgetAlert,
  CostTimeWindow,
} from '@shared/cost-types';

const router = Router();

/** Validate and normalize the time window query parameter. */
function parseWindow(raw: unknown): CostTimeWindow {
  if (raw === '24h' || raw === '7d' || raw === '30d') return raw;
  return '7d';
}

// ============================================================================
// GET /api/costs/summary?window=7d&includeEstimated=false
// ============================================================================

router.get('/summary', async (req, res) => {
  try {
    // TODO(OMN-2240): Replace with real Drizzle query against llm_cost_aggregates.
    const _window = parseWindow(req.query.window);
    const _includeEstimated = req.query.includeEstimated === 'true';

    const summary: CostSummary = {
      total_cost_usd: 0,
      reported_cost_usd: 0,
      estimated_cost_usd: 0,
      estimated_coverage_pct: 0,
      total_tokens: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      session_count: 0,
      model_count: 0,
      avg_cost_per_session: 0,
      cost_change_pct: 0,
      active_alerts: 0,
    };
    return res.json(summary);
  } catch (error) {
    console.error('[costs] Error fetching summary:', error);
    return res.status(500).json({ error: 'Failed to fetch cost summary' });
  }
});

// ============================================================================
// GET /api/costs/trend?window=7d&includeEstimated=false
// ============================================================================

router.get('/trend', async (req, res) => {
  try {
    const _window = parseWindow(req.query.window);
    const _includeEstimated = req.query.includeEstimated === 'true';

    const trend: CostTrendPoint[] = [];
    return res.json(trend);
  } catch (error) {
    console.error('[costs] Error fetching trend:', error);
    return res.status(500).json({ error: 'Failed to fetch cost trend' });
  }
});

// ============================================================================
// GET /api/costs/by-model?includeEstimated=false
// ============================================================================

router.get('/by-model', async (req, res) => {
  try {
    const _includeEstimated = req.query.includeEstimated === 'true';

    const data: CostByModel[] = [];
    return res.json(data);
  } catch (error) {
    console.error('[costs] Error fetching by-model:', error);
    return res.status(500).json({ error: 'Failed to fetch cost by model' });
  }
});

// ============================================================================
// GET /api/costs/by-repo?includeEstimated=false
// ============================================================================

router.get('/by-repo', async (req, res) => {
  try {
    const _includeEstimated = req.query.includeEstimated === 'true';

    const data: CostByRepo[] = [];
    return res.json(data);
  } catch (error) {
    console.error('[costs] Error fetching by-repo:', error);
    return res.status(500).json({ error: 'Failed to fetch cost by repo' });
  }
});

// ============================================================================
// GET /api/costs/by-pattern?includeEstimated=false
// ============================================================================

router.get('/by-pattern', async (req, res) => {
  try {
    const _includeEstimated = req.query.includeEstimated === 'true';

    const data: CostByPattern[] = [];
    return res.json(data);
  } catch (error) {
    console.error('[costs] Error fetching by-pattern:', error);
    return res.status(500).json({ error: 'Failed to fetch cost by pattern' });
  }
});

// ============================================================================
// GET /api/costs/token-usage?window=7d&includeEstimated=false
// ============================================================================

router.get('/token-usage', async (req, res) => {
  try {
    const _window = parseWindow(req.query.window);
    const _includeEstimated = req.query.includeEstimated === 'true';

    const data: TokenUsagePoint[] = [];
    return res.json(data);
  } catch (error) {
    console.error('[costs] Error fetching token-usage:', error);
    return res.status(500).json({ error: 'Failed to fetch token usage' });
  }
});

// ============================================================================
// GET /api/costs/alerts
// ============================================================================

router.get('/alerts', async (_req, res) => {
  try {
    // TODO(OMN-2240): Replace with real database query for budget alerts.
    const alerts: BudgetAlert[] = [];
    return res.json(alerts);
  } catch (error) {
    console.error('[costs] Error fetching alerts:', error);
    return res.status(500).json({ error: 'Failed to fetch budget alerts' });
  }
});

export default router;
