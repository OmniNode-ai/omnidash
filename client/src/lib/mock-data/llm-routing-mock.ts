/**
 * Mock Data: LLM Routing Effectiveness (OMN-2279)
 *
 * Realistic demo data for the LLM routing effectiveness dashboard.
 * Used when the database is unavailable or returns empty results.
 *
 * Designed to demonstrate:
 * - Agreement rate hovering near the 60% target
 * - Visible improvement across routing_prompt_version releases
 * - Occasional fallback spikes when LLM is slow
 */

import type {
  LlmRoutingSummary,
  LlmRoutingLatencyPoint,
  LlmRoutingByVersion,
  LlmRoutingDisagreement,
  LlmRoutingTrendPoint,
  LlmRoutingTimeWindow,
} from '@shared/llm-routing-types';

// ============================================================================
// Helpers
// ============================================================================

function isoDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function isoTs(daysAgo: number, hoursAgo = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(d.getHours() - hoursAgo);
  return d.toISOString();
}

// ============================================================================
// Summary
// ============================================================================

// 7d and 30d trends use isoDate (day-level granularity: "YYYY-MM-DD").
const AGREEMENT_TREND_7D = Array.from({ length: 7 }, (_, i) => ({
  date: isoDate(6 - i),
  value: 0.58 + i * 0.015 + Math.sin(i * 0.9) * 0.03,
}));

const AGREEMENT_TREND_30D = Array.from({ length: 30 }, (_, i) => ({
  date: isoDate(29 - i),
  value: 0.44 + i * 0.007 + Math.sin(i * 0.5) * 0.04,
}));

// 24h trend intentionally uses isoTs (full ISO-8601 timestamps) because the
// chart renders hourly granularity and needs sub-day precision for axis labels.
const AGREEMENT_TREND_24H = Array.from({ length: 24 }, (_, i) => ({
  date: isoTs(0, 23 - i),
  value: 0.65 + Math.sin(i * 0.6) * 0.06,
}));

export function getMockLlmRoutingSummary(window: LlmRoutingTimeWindow): LlmRoutingSummary {
  // Base is derived from the per-period decision rate used in getMockLlmRoutingTrend
  // so that summary.total_decisions is consistent with the sum of the trend points:
  //   24h  → 24 hourly points × 420 decisions/hr  ≈ 10,080
  //   7d   → 7 daily points   × 480 decisions/day ≈  3,360
  //   30d  → 30 daily points  × 480 decisions/day ≈ 14,400
  const base = window === '24h' ? 420 * 24 : window === '7d' ? 480 * 7 : 480 * 30;

  const agreed = Math.round(base * 0.64);
  const disagreed = Math.round(base * 0.27);
  const fallback = Math.round(base * 0.09);
  const total = agreed + disagreed + fallback;

  return {
    total_decisions: total,
    agreement_rate: agreed / (agreed + disagreed),
    fallback_rate: fallback / total,
    avg_cost_usd: 0.000082,
    llm_p50_latency_ms: 148,
    llm_p95_latency_ms: 390,
    fuzzy_p50_latency_ms: 4,
    fuzzy_p95_latency_ms: 18,
    counts: { total, agreed, disagreed, fallback },
    agreement_rate_trend:
      window === '24h'
        ? AGREEMENT_TREND_24H
        : window === '7d'
          ? AGREEMENT_TREND_7D
          : AGREEMENT_TREND_30D,
  };
}

// ============================================================================
// Latency Distribution
// ============================================================================

export function getMockLlmRoutingLatency(_window: LlmRoutingTimeWindow): LlmRoutingLatencyPoint[] {
  return [
    {
      method: 'LLM',
      p50_ms: 148,
      p90_ms: 310,
      p95_ms: 390,
      p99_ms: 640,
      sample_count: 3024,
    },
    {
      method: 'Fuzzy',
      p50_ms: 4,
      p90_ms: 12,
      p95_ms: 18,
      p99_ms: 38,
      sample_count: 3024,
    },
  ];
}

// ============================================================================
// By Version
// ============================================================================

export function getMockLlmRoutingByVersion(_window: LlmRoutingTimeWindow): LlmRoutingByVersion[] {
  return [
    {
      routing_prompt_version: 'v1.0.0',
      total: 4820,
      agreed: 2459,
      disagreed: 2120,
      agreement_rate: 0.51,
      avg_llm_latency_ms: 195,
      avg_fuzzy_latency_ms: 5,
      avg_cost_usd: 0.000094,
    },
    {
      routing_prompt_version: 'v1.1.0',
      total: 3640,
      agreed: 2148,
      disagreed: 1310,
      agreement_rate: 0.59,
      avg_llm_latency_ms: 172,
      avg_fuzzy_latency_ms: 5,
      avg_cost_usd: 0.000088,
    },
    {
      routing_prompt_version: 'v1.2.0',
      total: 2910,
      agreed: 1960,
      disagreed: 824,
      agreement_rate: 0.67,
      avg_llm_latency_ms: 151,
      avg_fuzzy_latency_ms: 4,
      avg_cost_usd: 0.000082,
    },
    {
      routing_prompt_version: 'v1.3.0',
      total: 1840,
      agreed: 1306,
      disagreed: 442,
      agreement_rate: 0.71,
      avg_llm_latency_ms: 143,
      avg_fuzzy_latency_ms: 4,
      avg_cost_usd: 0.000079,
    },
  ];
}

// ============================================================================
// Top Disagreements
// ============================================================================

export function getMockLlmRoutingDisagreements(
  _window: LlmRoutingTimeWindow
): LlmRoutingDisagreement[] {
  return [
    {
      occurred_at: isoTs(0, 1),
      llm_agent: 'python-fastapi-expert',
      fuzzy_agent: 'api-architect',
      count: 142,
      avg_llm_confidence: 0.72,
      avg_fuzzy_confidence: 0.68,
      routing_prompt_version: 'v1.2.0',
    },
    {
      occurred_at: isoTs(0, 3),
      llm_agent: 'testing',
      fuzzy_agent: 'code-quality-analyzer',
      count: 118,
      avg_llm_confidence: 0.65,
      avg_fuzzy_confidence: 0.71,
      routing_prompt_version: 'v1.2.0',
    },
    {
      occurred_at: isoTs(1, 0),
      llm_agent: 'documentation-architect',
      fuzzy_agent: 'onex-readme',
      count: 96,
      avg_llm_confidence: 0.61,
      avg_fuzzy_confidence: 0.58,
      routing_prompt_version: 'v1.1.0',
    },
    {
      occurred_at: isoTs(1, 6),
      llm_agent: 'debug',
      fuzzy_agent: 'debug-intelligence',
      count: 84,
      avg_llm_confidence: 0.78,
      avg_fuzzy_confidence: 0.63,
      routing_prompt_version: 'v1.3.0',
    },
    {
      occurred_at: isoTs(2, 2),
      llm_agent: 'security-audit',
      fuzzy_agent: 'code-quality-analyzer',
      count: 71,
      avg_llm_confidence: 0.69,
      avg_fuzzy_confidence: 0.74,
      routing_prompt_version: 'v1.2.0',
    },
    {
      occurred_at: isoTs(2, 8),
      llm_agent: 'frontend-developer',
      fuzzy_agent: 'ui-testing',
      count: 63,
      avg_llm_confidence: 0.64,
      avg_fuzzy_confidence: 0.72,
      routing_prompt_version: 'v1.1.0',
    },
    {
      occurred_at: isoTs(3, 4),
      llm_agent: 'devops-infrastructure',
      fuzzy_agent: 'repository-setup',
      count: 55,
      avg_llm_confidence: 0.58,
      avg_fuzzy_confidence: 0.62,
      routing_prompt_version: 'v1.1.0',
    },
    {
      occurred_at: isoTs(4, 0),
      llm_agent: 'performance',
      fuzzy_agent: 'code-quality-analyzer',
      count: 48,
      avg_llm_confidence: 0.76,
      avg_fuzzy_confidence: 0.59,
      routing_prompt_version: 'v1.0.0',
    },
  ];
}

// ============================================================================
// Trend
// ============================================================================

export function getMockLlmRoutingTrend(window: LlmRoutingTimeWindow): LlmRoutingTrendPoint[] {
  if (window === '24h') {
    return Array.from({ length: 24 }, (_, i) => ({
      date: isoTs(0, 23 - i),
      agreement_rate: 0.62 + Math.sin(i * 0.5) * 0.07,
      fallback_rate: 0.08 + Math.sin(i * 0.3) * 0.03,
      avg_cost_usd: 0.000082 + Math.sin(i * 0.4) * 0.000008,
      total_decisions: 420 + Math.round(Math.sin(i * 0.6) * 60),
    }));
  }

  const days = window === '7d' ? 7 : 30;
  return Array.from({ length: days }, (_, i) => ({
    date: isoDate(days - 1 - i),
    agreement_rate: 0.5 + (i / days) * 0.18 + Math.sin(i * 0.8) * 0.04,
    fallback_rate: 0.12 - (i / days) * 0.05 + Math.sin(i * 0.4) * 0.02,
    avg_cost_usd: 0.000094 - (i / days) * 0.000015,
    total_decisions: 480 + Math.round((i / days) * 60) + Math.round(Math.sin(i) * 40),
  }));
}
