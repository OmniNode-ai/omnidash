/**
 * LLM Routing Effectiveness API Routes (OMN-2279)
 *
 * REST endpoints for the LLM routing effectiveness dashboard:
 * summary, latency, by-version, disagreements, trend.
 *
 * Returns empty/placeholder responses so the client falls back to mock data.
 * When the upstream omniclaude service populates the read-model via the
 * `onex.evt.omniclaude.llm-routing-decision.v1` consumer projection,
 * replace with real queries following the same pattern as baselines-routes.ts.
 *
 * NOTE: Per OMN-2325 architectural rule, route files must not import DB
 * accessors directly. Use projectionService views for data access once
 * the llm-routing projection is wired (future ticket).
 */

import { Router } from 'express';
import type {
  LlmRoutingSummary,
  LlmRoutingLatencyPoint,
  LlmRoutingByVersion,
  LlmRoutingDisagreement,
  LlmRoutingTrendPoint,
} from '@shared/llm-routing-types';

const router = Router();

const VALID_WINDOWS = ['24h', '7d', '30d'] as const;

function validateWindow(
  req: Parameters<Parameters<typeof router.get>[1]>[0],
  res: Parameters<Parameters<typeof router.get>[1]>[1]
): string | null {
  const timeWindow = typeof req.query.window === 'string' ? req.query.window : '7d';
  if (!VALID_WINDOWS.includes(timeWindow as (typeof VALID_WINDOWS)[number])) {
    res.status(400).json({ error: 'Invalid window parameter. Must be one of: 24h, 7d, 30d' });
    return null;
  }
  return timeWindow;
}

// ============================================================================
// GET /api/llm-routing/summary?window=7d
// ============================================================================

router.get('/summary', (req, res) => {
  try {
    const timeWindow = validateWindow(req, res);
    if (timeWindow === null) return;
    // TODO(OMN-2279-followup): Replace with projectionService.getView('llm-routing').getSnapshot()
    // once the llm-routing projection is implemented. Use `timeWindow` to scope the query.
    const empty: LlmRoutingSummary = {
      total_decisions: 0,
      agreement_rate: 0,
      fallback_rate: 0,
      avg_cost_usd: 0,
      llm_p50_latency_ms: 0,
      llm_p95_latency_ms: 0,
      fuzzy_p50_latency_ms: 0,
      fuzzy_p95_latency_ms: 0,
      counts: { total: 0, agreed: 0, disagreed: 0, fallback: 0 },
      agreement_rate_trend: [],
    };
    return res.json(empty);
  } catch (error) {
    console.error('[llm-routing] Error fetching summary:', error);
    return res.status(500).json({ error: 'Failed to fetch LLM routing summary' });
  }
});

// ============================================================================
// GET /api/llm-routing/latency?window=7d
// ============================================================================

router.get('/latency', (req, res) => {
  try {
    const timeWindow = validateWindow(req, res);
    if (timeWindow === null) return;
    // TODO(OMN-2279-followup): Replace with projection view query scoped to `timeWindow`.
    const data: LlmRoutingLatencyPoint[] = [];
    return res.json(data);
  } catch (error) {
    console.error('[llm-routing] Error fetching latency:', error);
    return res.status(500).json({ error: 'Failed to fetch LLM routing latency' });
  }
});

// ============================================================================
// GET /api/llm-routing/by-version?window=7d
// ============================================================================

router.get('/by-version', (req, res) => {
  try {
    const timeWindow = validateWindow(req, res);
    if (timeWindow === null) return;
    // TODO(OMN-2279-followup): Replace with projection view query scoped to `timeWindow`.
    const data: LlmRoutingByVersion[] = [];
    return res.json(data);
  } catch (error) {
    console.error('[llm-routing] Error fetching by-version:', error);
    return res.status(500).json({ error: 'Failed to fetch LLM routing by version' });
  }
});

// ============================================================================
// GET /api/llm-routing/disagreements?window=7d
// ============================================================================

router.get('/disagreements', (req, res) => {
  try {
    const timeWindow = validateWindow(req, res);
    if (timeWindow === null) return;
    // TODO(OMN-2279-followup): Replace with projection view query scoped to `timeWindow`.
    const data: LlmRoutingDisagreement[] = [];
    return res.json(data);
  } catch (error) {
    console.error('[llm-routing] Error fetching disagreements:', error);
    return res.status(500).json({ error: 'Failed to fetch LLM routing disagreements' });
  }
});

// ============================================================================
// GET /api/llm-routing/trend?window=7d
// ============================================================================

router.get('/trend', (req, res) => {
  try {
    const timeWindow = validateWindow(req, res);
    if (timeWindow === null) return;
    // TODO(OMN-2279-followup): Replace with projection view query scoped to `timeWindow`.
    const data: LlmRoutingTrendPoint[] = [];
    return res.json(data);
  } catch (error) {
    console.error('[llm-routing] Error fetching trend:', error);
    return res.status(500).json({ error: 'Failed to fetch LLM routing trend' });
  }
});

export default router;
