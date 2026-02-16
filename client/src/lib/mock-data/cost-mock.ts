/**
 * Mock Data for Cost Trend Dashboard (OMN-2242)
 *
 * Provides demo data when the API is unavailable or returns empty results.
 * Follows the same pattern as baselines-mock.ts.
 */

import type {
  CostSummary,
  CostTrendPoint,
  CostByModel,
  CostByRepo,
  CostByPattern,
  TokenUsagePoint,
  BudgetAlert,
  CostTimeWindow,
  UsageSource,
} from '@shared/cost-types';

// ============================================================================
// Helpers
// ============================================================================

/** Map a time window to the number of calendar days it spans. */
function daysForWindow(window: CostTimeWindow): number {
  switch (window) {
    case '24h':
      return 1;
    case '7d':
      return 7;
    case '30d':
      return 30;
  }
}

/** Number of chart buckets for a window (24 hourly for 24h, daily otherwise). */
function bucketCount(window: CostTimeWindow): number {
  switch (window) {
    case '24h':
      return 24; // hourly
    case '7d':
      return 7; // daily
    case '30d':
      return 30; // daily
  }
}

// ============================================================================
// Cost Summary
// ============================================================================

/** Generate a deterministic cost summary for the given time window. */
export function getMockCostSummary(window: CostTimeWindow = '7d'): CostSummary {
  const multiplier = daysForWindow(window);
  const baseCost = 12.45 * multiplier;
  const reportedPct = 0.82;
  return {
    total_cost_usd: +baseCost.toFixed(2),
    reported_cost_usd: +(baseCost * reportedPct).toFixed(2),
    estimated_cost_usd: +(baseCost * (1 - reportedPct)).toFixed(2),
    reported_coverage_pct: +(reportedPct * 100).toFixed(1),
    total_tokens: Math.round(248_000 * multiplier),
    prompt_tokens: Math.round(186_000 * multiplier),
    completion_tokens: Math.round(62_000 * multiplier),
    session_count: Math.round(34 * multiplier),
    model_count: 5,
    avg_cost_per_session: +(baseCost / (34 * multiplier)).toFixed(4),
    cost_change_pct: -8.3,
    active_alerts: 1,
  };
}

// ============================================================================
// Cost Trend (Line Chart)
// ============================================================================

/**
 * Generate a time-series of cost data points for the line chart.
 * Uses modulo-based variance to keep values organic but deterministic.
 */
export function getMockCostTrend(window: CostTimeWindow = '7d'): CostTrendPoint[] {
  const count = bucketCount(window);
  const now = new Date();

  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now);
    if (window === '24h') {
      d.setHours(d.getHours() - (count - 1 - i));
    } else {
      d.setDate(d.getDate() - (count - 1 - i));
    }

    // Deterministic variance: modulo-based offsets keep demo data "organic" but repeatable
    const wave = (((i * 7 + 3) % 11) - 5) * 0.6; // range roughly -3..+3
    const base = 10 + (i % 7) * 1.5 + wave;
    const reportedRatio = 0.78 + (i % 5) * 0.03;

    return {
      timestamp: window === '24h' ? d.toISOString().slice(0, 16) : d.toISOString().slice(0, 10),
      total_cost_usd: +base.toFixed(2),
      reported_cost_usd: +(base * reportedRatio).toFixed(2),
      estimated_cost_usd: +(base * (1 - reportedRatio)).toFixed(2),
      session_count: 5 + (i % 4),
    };
  });
}

// ============================================================================
// Cost by Model (Bar Chart)
// ============================================================================

/** Generate per-model cost breakdown. Includes both API-reported and estimated sources. */
export function getMockCostByModel(): CostByModel[] {
  const models: Array<{
    name: string;
    cost: number;
    tokens: number;
    source: UsageSource;
  }> = [
    { name: 'claude-3-opus', cost: 28.5, tokens: 42_000, source: 'API' },
    { name: 'claude-3-sonnet', cost: 18.2, tokens: 98_000, source: 'API' },
    { name: 'gpt-4-turbo', cost: 14.8, tokens: 56_000, source: 'API' },
    { name: 'qwen2.5-coder-14b', cost: 4.2, tokens: 120_000, source: 'ESTIMATED' },
    { name: 'qwen2.5-72b', cost: 2.1, tokens: 38_000, source: 'ESTIMATED' },
  ];

  return models.map((m, i) => {
    const promptRatio = 0.72 + (i % 5) * 0.02;
    const reportedRatio = m.source === 'API' ? 1.0 : 0.0;
    return {
      model_name: m.name,
      total_cost_usd: m.cost,
      reported_cost_usd: +(m.cost * reportedRatio).toFixed(2),
      estimated_cost_usd: +(m.cost * (1 - reportedRatio)).toFixed(2),
      total_tokens: m.tokens,
      prompt_tokens: Math.round(m.tokens * promptRatio),
      completion_tokens: Math.round(m.tokens * (1 - promptRatio)),
      request_count: Math.round(m.tokens / 2500),
      usage_source: m.source,
    };
  });
}

// ============================================================================
// Cost by Repo (Bar Chart)
// ============================================================================

/** Generate per-repository cost breakdown with session counts. */
export function getMockCostByRepo(): CostByRepo[] {
  const repos: Array<{ name: string; cost: number; tokens: number; sessions: number }> = [
    { name: 'repo-orchestrator', cost: 22.4, tokens: 145_000, sessions: 48 },
    { name: 'repo-core', cost: 15.8, tokens: 92_000, sessions: 32 },
    { name: 'repo-dashboard', cost: 11.3, tokens: 68_000, sessions: 25 },
    { name: 'repo-intelligence', cost: 8.6, tokens: 52_000, sessions: 18 },
    { name: 'repo-assistant', cost: 5.2, tokens: 31_000, sessions: 12 },
    { name: 'repo-infra', cost: 3.1, tokens: 18_000, sessions: 8 },
  ];

  return repos.map((r) => ({
    repo_name: r.name,
    total_cost_usd: r.cost,
    reported_cost_usd: +(r.cost * 0.82).toFixed(2),
    estimated_cost_usd: +(r.cost * 0.18).toFixed(2),
    total_tokens: r.tokens,
    session_count: r.sessions,
    usage_source: 'API' as UsageSource,
  }));
}

// ============================================================================
// Cost by Pattern (Table)
// ============================================================================

/**
 * Generate per-pattern cost breakdown with injection frequency.
 * Two patterns (pat-0008, pat-0010) are marked as ESTIMATED to exercise
 * the usage-source badge rendering in the table view.
 */
export function getMockCostByPattern(): CostByPattern[] {
  const patterns = [
    { id: 'pat-0001', name: 'Error Retry with Backoff', cost: 8.4, injections: 145 },
    { id: 'pat-0002', name: 'Auth Token Refresh', cost: 6.2, injections: 98 },
    { id: 'pat-0003', name: 'Cache Invalidation Strategy', cost: 5.8, injections: 112 },
    { id: 'pat-0004', name: 'Pagination Cursor Handler', cost: 4.1, injections: 76 },
    { id: 'pat-0005', name: 'Rate Limit Decorator', cost: 3.6, injections: 64 },
    { id: 'pat-0006', name: 'Circuit Breaker Pattern', cost: 3.2, injections: 58 },
    { id: 'pat-0007', name: 'Structured Logging Wrapper', cost: 2.8, injections: 92 },
    { id: 'pat-0008', name: 'Config Validation on Boot', cost: 1.9, injections: 34 },
    { id: 'pat-0009', name: 'Graceful Shutdown Handler', cost: 1.4, injections: 28 },
    { id: 'pat-0010', name: 'Batch Insert Optimizer', cost: 1.1, injections: 22 },
  ];

  return patterns.map((p) => {
    const promptRatio = 0.7;
    const totalTokens = Math.round(p.cost * 8200);
    const isEstimated = p.id === 'pat-0008' || p.id === 'pat-0010';
    return {
      pattern_id: p.id,
      pattern_name: p.name,
      total_cost_usd: p.cost,
      reported_cost_usd: isEstimated ? 0 : p.cost,
      estimated_cost_usd: isEstimated ? p.cost : 0,
      prompt_tokens: Math.round(totalTokens * promptRatio),
      completion_tokens: Math.round(totalTokens * (1 - promptRatio)),
      injection_count: p.injections,
      avg_cost_per_injection: +(p.cost / p.injections).toFixed(4),
      usage_source: (isEstimated ? 'ESTIMATED' : 'API') as UsageSource,
    };
  });
}

// ============================================================================
// Token Usage Breakdown (Stacked Bar)
// ============================================================================

/**
 * Generate a time-series of prompt vs completion token counts.
 * Uses modulo-based variance to keep values organic but deterministic.
 */
export function getMockTokenUsage(window: CostTimeWindow = '7d'): TokenUsagePoint[] {
  const count = bucketCount(window);
  const now = new Date();

  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now);
    if (window === '24h') {
      d.setHours(d.getHours() - (count - 1 - i));
    } else {
      d.setDate(d.getDate() - (count - 1 - i));
    }

    // Deterministic variance: modulo-based offsets keep demo data "organic" but repeatable
    const wave = (((i * 11 + 5) % 13) - 6) * 1_250; // range roughly -7500..+7500
    const base = 30_000 + (i % 5) * 5_000 + wave;
    const promptRatio = 0.72 + (i % 3) * 0.03;
    const promptTokens = Math.round(base * promptRatio);
    const completionTokens = Math.round(base * (1 - promptRatio));

    return {
      timestamp: window === '24h' ? d.toISOString().slice(0, 16) : d.toISOString().slice(0, 10),
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
      usage_source: 'API' as UsageSource,
    };
  });
}

// ============================================================================
// Budget Alerts
// ============================================================================

/** Generate three budget alerts (daily, weekly, monthly). Weekly is pre-triggered. */
export function getMockBudgetAlerts(): BudgetAlert[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'alert-001',
      name: 'Daily Spend Limit',
      threshold_usd: 25.0,
      period: 'daily',
      current_spend_usd: 18.42,
      utilization_pct: 73.7,
      is_triggered: false,
      last_evaluated: now,
    },
    {
      id: 'alert-002',
      name: 'Weekly Budget',
      threshold_usd: 150.0,
      period: 'weekly',
      current_spend_usd: 162.8,
      utilization_pct: 108.5,
      is_triggered: true,
      last_evaluated: now,
    },
    {
      id: 'alert-003',
      name: 'Monthly Cap',
      threshold_usd: 500.0,
      period: 'monthly',
      current_spend_usd: 287.6,
      utilization_pct: 57.5,
      is_triggered: false,
      last_evaluated: now,
    },
  ];
}
