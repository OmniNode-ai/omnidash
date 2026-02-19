/**
 * Delegation Metrics API Routes (OMN-2284)
 *
 * REST endpoints for the delegation metrics dashboard:
 * summary, by-task-type, cost-savings, quality-gates, shadow-divergence, trend.
 *
 * Returns empty/placeholder responses so the client falls back to mock data.
 * When the upstream omniclaude service populates the read-model via the
 * `onex.evt.omniclaude.task-delegated.v1` and
 * `onex.evt.omniclaude.delegation-shadow-comparison.v1` consumer projections,
 * replace with real queries following the same pattern as baselines-routes.ts.
 *
 * NOTE: Per OMN-2325 architectural rule, route files must not import DB
 * accessors directly. Use projectionService views for data access once
 * the delegation projection is wired (future ticket).
 */

import { Router, type Request, type Response } from 'express';
import type {
  DelegationSummary,
  DelegationByTaskType,
  DelegationCostSavingsTrendPoint,
  DelegationQualityGatePoint,
  DelegationShadowDivergence,
  DelegationTrendPoint,
} from '@shared/delegation-types';

const router = Router();

const VALID_WINDOWS = ['24h', '7d', '30d'] as const;

function validateWindow(req: Request, res: Response): string | null {
  const timeWindow = typeof req.query.window === 'string' ? req.query.window : '7d';
  if (!VALID_WINDOWS.includes(timeWindow as (typeof VALID_WINDOWS)[number])) {
    res.status(400).json({ error: 'Invalid window parameter. Must be one of: 24h, 7d, 30d' });
    return null;
  }
  return timeWindow;
}

// ============================================================================
// GET /api/delegation/summary?window=7d
// ============================================================================

router.get('/summary', (req, res) => {
  try {
    const _timeWindow = validateWindow(req, res);
    if (_timeWindow === null) return;
    // TODO(OMN-2284-followup): Replace with real DB query once the delegation
    // projection is wired in read-model-consumer.ts.
    return res.json({
      total_delegations: 0,
      // delegation_rate is a stub returning 0. The intended derivation is:
      //   delegated_count / total_count from the agent_routing_decisions table,
      //   where delegated_count = rows whose chosen agent is a sub-agent delegate
      //   and total_count = all routing decisions in the requested time window.
      // Wire this once the delegation projection is added to read-model-consumer.ts.
      delegation_rate: 0,
      quality_gate_pass_rate: 0,
      total_cost_savings_usd: 0,
      avg_cost_savings_usd: 0,
      shadow_divergence_rate: 0,
      total_shadow_comparisons: 0,
      avg_delegation_latency_ms: 0,
      counts: {
        total: 0,
        quality_gate_passed: 0,
        quality_gate_failed: 0,
        shadow_diverged: 0,
        shadow_agreed: 0,
      },
      quality_gate_trend: [],
    } satisfies DelegationSummary);
  } catch (error) {
    console.error('[delegation] Error fetching summary:', error);
    return res.status(500).json({ error: 'Failed to fetch delegation summary' });
  }
});

// ============================================================================
// GET /api/delegation/by-task-type?window=7d
// ============================================================================

router.get('/by-task-type', (req, res) => {
  try {
    const _timeWindow = validateWindow(req, res);
    if (_timeWindow === null) return;
    return res.json([] satisfies DelegationByTaskType[]);
  } catch (error) {
    console.error('[delegation] Error fetching by-task-type:', error);
    return res.status(500).json({ error: 'Failed to fetch delegation by task type' });
  }
});

// ============================================================================
// GET /api/delegation/cost-savings?window=7d
// ============================================================================

router.get('/cost-savings', (req, res) => {
  try {
    const _timeWindow = validateWindow(req, res);
    if (_timeWindow === null) return;
    return res.json([] satisfies DelegationCostSavingsTrendPoint[]);
  } catch (error) {
    console.error('[delegation] Error fetching cost-savings:', error);
    return res.status(500).json({ error: 'Failed to fetch delegation cost savings' });
  }
});

// ============================================================================
// GET /api/delegation/quality-gates?window=7d
// ============================================================================

router.get('/quality-gates', (req, res) => {
  try {
    const _timeWindow = validateWindow(req, res);
    if (_timeWindow === null) return;
    return res.json([] satisfies DelegationQualityGatePoint[]);
  } catch (error) {
    console.error('[delegation] Error fetching quality-gates:', error);
    return res.status(500).json({ error: 'Failed to fetch delegation quality gates' });
  }
});

// ============================================================================
// GET /api/delegation/shadow-divergence?window=7d
// ============================================================================

router.get('/shadow-divergence', (req, res) => {
  try {
    const _timeWindow = validateWindow(req, res);
    if (_timeWindow === null) return;
    return res.json([] satisfies DelegationShadowDivergence[]);
  } catch (error) {
    console.error('[delegation] Error fetching shadow-divergence:', error);
    return res.status(500).json({ error: 'Failed to fetch delegation shadow divergence' });
  }
});

// ============================================================================
// GET /api/delegation/trend?window=7d
// ============================================================================

router.get('/trend', (req, res) => {
  try {
    const _timeWindow = validateWindow(req, res);
    if (_timeWindow === null) return;
    return res.json([] satisfies DelegationTrendPoint[]);
  } catch (error) {
    console.error('[delegation] Error fetching trend:', error);
    return res.status(500).json({ error: 'Failed to fetch delegation trend' });
  }
});

export default router;
