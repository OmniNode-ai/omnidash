/**
 * LLM Routing Effectiveness API Routes (OMN-2279 / OMN-2372)
 *
 * REST endpoints for the LLM routing effectiveness dashboard:
 * summary, latency, by-version, disagreements, trend.
 *
 * All routes are backed by LlmRoutingProjection (DB-backed, TTL-cached).
 * Routes do NOT execute SQL directly — all queries are encapsulated in the
 * projection following the OMN-2325 architectural rule.
 *
 * Source table: llm_routing_decisions (migrations/0006_llm_routing_decisions.sql)
 * Event consumed: onex.evt.omniclaude.llm-routing-decision.v1
 *
 * GOLDEN METRIC: agreement_rate > 60%. Alert if disagreement_rate > 40%.
 */

import { Router, type Request, type Response } from 'express';
import type {
  LlmRoutingSummary,
  LlmRoutingLatencyPoint,
  LlmRoutingByVersion,
  LlmRoutingDisagreement,
  LlmRoutingTrendPoint,
} from '@shared/llm-routing-types';
import { llmRoutingProjection } from './projection-bootstrap';
import { LlmRoutingTimeWindowSchema } from './llm-routing-schemas';

const router = Router();

function validateWindow(req: Request, res: Response) {
  const raw = typeof req.query.window === 'string' ? req.query.window : '7d';
  const result = LlmRoutingTimeWindowSchema.safeParse(raw);
  if (!result.success) {
    res.status(400).json({ error: 'Invalid window parameter. Must be one of: 24h, 7d, 30d' });
    return null;
  }
  return result.data;
}

/**
 * Fetch the projection payload for the given window.
 * Uses ensureFresh() for the default 7d window (avoids per-window cache overhead),
 * and ensureFreshForWindow() for non-default windows.
 */
async function fetchPayload(window: '24h' | '7d' | '30d') {
  if (window === '7d') {
    return llmRoutingProjection.ensureFresh();
  }
  return llmRoutingProjection.ensureFreshForWindow(window);
}

/**
 * Set X-Omnidash-Degraded: true on the response when the payload's actual
 * window does not match the requested window (i.e. ensureFreshForWindow()
 * fell back to the 7d cache because the DB was unavailable).
 *
 * The 7d path (ensureFresh()) never sets payload.degraded, so no header is
 * needed there. For non-7d requests, payload.degraded is the canonical flag;
 * the window mismatch is a belt-and-suspenders secondary check.
 */
function setDegradedHeader(
  res: Response,
  requestedWindow: '24h' | '7d' | '30d',
  payload: Awaited<ReturnType<typeof fetchPayload>>
): void {
  if (
    requestedWindow !== '7d' &&
    (payload.degraded === true ||
      (payload.window !== undefined && payload.window !== requestedWindow))
  ) {
    res.setHeader('X-Omnidash-Degraded', 'true');
  }
}

// ============================================================================
// GET /api/llm-routing/summary?window=7d
// ============================================================================

router.get('/summary', async (req, res) => {
  try {
    const timeWindow = validateWindow(req, res);
    if (timeWindow === null) return;
    const payload = await fetchPayload(timeWindow);
    setDegradedHeader(res, timeWindow, payload);
    return res.json(payload.summary satisfies LlmRoutingSummary);
  } catch (error) {
    console.error('[llm-routing] Error fetching summary:', error);
    return res.status(500).json({ error: 'Failed to fetch LLM routing summary' });
  }
});

// ============================================================================
// GET /api/llm-routing/latency?window=7d
// ============================================================================

router.get('/latency', async (req, res) => {
  try {
    const timeWindow = validateWindow(req, res);
    if (timeWindow === null) return;
    const payload = await fetchPayload(timeWindow);
    setDegradedHeader(res, timeWindow, payload);
    return res.json(payload.latency satisfies LlmRoutingLatencyPoint[]);
  } catch (error) {
    console.error('[llm-routing] Error fetching latency:', error);
    return res.status(500).json({ error: 'Failed to fetch LLM routing latency' });
  }
});

// ============================================================================
// GET /api/llm-routing/by-version?window=7d
// ============================================================================

router.get('/by-version', async (req, res) => {
  try {
    const timeWindow = validateWindow(req, res);
    if (timeWindow === null) return;
    const payload = await fetchPayload(timeWindow);
    setDegradedHeader(res, timeWindow, payload);
    return res.json(payload.byVersion satisfies LlmRoutingByVersion[]);
  } catch (error) {
    console.error('[llm-routing] Error fetching by-version:', error);
    return res.status(500).json({ error: 'Failed to fetch LLM routing by version' });
  }
});

// ============================================================================
// GET /api/llm-routing/disagreements?window=7d
// ============================================================================

router.get('/disagreements', async (req, res) => {
  try {
    const timeWindow = validateWindow(req, res);
    if (timeWindow === null) return;
    const payload = await fetchPayload(timeWindow);
    setDegradedHeader(res, timeWindow, payload);
    return res.json(payload.disagreements satisfies LlmRoutingDisagreement[]);
  } catch (error) {
    console.error('[llm-routing] Error fetching disagreements:', error);
    return res.status(500).json({ error: 'Failed to fetch LLM routing disagreements' });
  }
});

// ============================================================================
// GET /api/llm-routing/trend?window=7d
// ============================================================================

router.get('/trend', async (req, res) => {
  try {
    const timeWindow = validateWindow(req, res);
    if (timeWindow === null) return;
    const payload = await fetchPayload(timeWindow);
    setDegradedHeader(res, timeWindow, payload);
    return res.json(payload.trend satisfies LlmRoutingTrendPoint[]);
  } catch (error) {
    console.error('[llm-routing] Error fetching trend:', error);
    return res.status(500).json({ error: 'Failed to fetch LLM routing trend' });
  }
});

export default router;
