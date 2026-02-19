/**
 * Mock Data: Context Enrichment (OMN-2280)
 *
 * Realistic demo data for the context enrichment dashboard.
 * Used when the database is unavailable or returns empty results.
 */

import type {
  EnrichmentSummary,
  EnrichmentByChannel,
  LatencyDistributionPoint,
  TokenSavingsTrendPoint,
  SimilarityQualityPoint,
  InflationAlert,
  EnrichmentTimeWindow,
} from '@shared/enrichment-types';

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

export function getMockEnrichmentSummary(window: EnrichmentTimeWindow): EnrichmentSummary {
  const multiplier = window === '24h' ? 1 : window === '7d' ? 7 : 30;
  const base = 520 * multiplier;

  const hits = Math.round(base * 0.61);
  const misses = Math.round(base * 0.24);
  const errors = Math.round(base * 0.04);
  const inflated = Math.round(base * 0.11);
  const total = hits + misses + errors + inflated;

  // Positive net_tokens_saved across the window
  const netTokensSaved = Math.round(base * 142);

  return {
    total_enrichments: total,
    hit_rate: hits / total,
    net_tokens_saved: netTokensSaved,
    p50_latency_ms: 38,
    p95_latency_ms: 184,
    avg_similarity_score: 0.781,
    inflation_alert_count: inflated,
    error_rate: errors / total,
    counts: {
      hits,
      misses,
      errors,
      inflated,
    },
  };
}

// ============================================================================
// By Channel
// ============================================================================

export function getMockEnrichmentByChannel(_window: EnrichmentTimeWindow): EnrichmentByChannel[] {
  return [
    {
      channel: 'qdrant',
      total: 1840,
      hits: 1196,
      misses: 386,
      errors: 48,
      inflated: 210,
      hit_rate: 0.65,
      avg_latency_ms: 52,
      avg_net_tokens_saved: 168,
    },
    {
      channel: 'pattern-cache',
      total: 1320,
      hits: 1069,
      misses: 198,
      errors: 26,
      inflated: 27,
      hit_rate: 0.81,
      avg_latency_ms: 12,
      avg_net_tokens_saved: 214,
    },
    {
      channel: 'similarity-search',
      total: 980,
      hits: 588,
      misses: 294,
      errors: 39,
      inflated: 59,
      hit_rate: 0.6,
      avg_latency_ms: 86,
      avg_net_tokens_saved: 102,
    },
    {
      channel: 'summarization',
      total: 760,
      hits: 532,
      misses: 152,
      errors: 30,
      inflated: 46,
      hit_rate: 0.7,
      avg_latency_ms: 145,
      avg_net_tokens_saved: 312,
    },
    {
      channel: 'inline-context',
      total: 540,
      hits: 324,
      misses: 162,
      errors: 22,
      inflated: 32,
      hit_rate: 0.6,
      avg_latency_ms: 18,
      avg_net_tokens_saved: 74,
    },
  ];
}

// ============================================================================
// Latency Distribution by Model
// ============================================================================

export function getMockLatencyDistribution(
  _window: EnrichmentTimeWindow
): LatencyDistributionPoint[] {
  return [
    {
      model: 'gte-qwen2-1.5b',
      p50_ms: 28,
      p90_ms: 64,
      p95_ms: 88,
      p99_ms: 142,
      sample_count: 1840,
    },
    {
      model: 'qwen2.5-coder-14b',
      p50_ms: 52,
      p90_ms: 128,
      p95_ms: 184,
      p99_ms: 296,
      sample_count: 980,
    },
    {
      model: 'qwen2.5-72b',
      p50_ms: 118,
      p90_ms: 248,
      p95_ms: 312,
      p99_ms: 490,
      sample_count: 760,
    },
    {
      model: 'pattern-cache',
      p50_ms: 8,
      p90_ms: 18,
      p95_ms: 24,
      p99_ms: 42,
      sample_count: 1320,
    },
    {
      model: 'inline-embedding',
      p50_ms: 14,
      p90_ms: 32,
      p95_ms: 48,
      p99_ms: 86,
      sample_count: 540,
    },
  ];
}

// ============================================================================
// Token Savings Trend
// ============================================================================

export function getMockTokenSavingsTrend(window: EnrichmentTimeWindow): TokenSavingsTrendPoint[] {
  if (window === '24h') {
    return Array.from({ length: 24 }, (_, i) => ({
      date: isoTs(0, 23 - i),
      net_tokens_saved: 8_400 + Math.round(Math.sin(i * 0.7) * 1_200),
      total_enrichments: 520 + Math.round(Math.sin(i * 0.5) * 80),
      avg_tokens_before: 2_840 + Math.round(Math.sin(i * 0.4) * 120),
      avg_tokens_after: 2_698 + Math.round(Math.sin(i * 0.4) * 80),
    }));
  }

  const days = window === '7d' ? 7 : 30;
  return Array.from({ length: days }, (_, i) => ({
    date: isoDate(days - 1 - i),
    net_tokens_saved: 62_000 + Math.round((i / days) * 18_000 + Math.sin(i * 0.8) * 5_000),
    total_enrichments: 3_640 + Math.round((i / days) * 420 + Math.sin(i * 0.6) * 200),
    avg_tokens_before: 2_780 + Math.round(Math.sin(i * 0.5) * 140),
    avg_tokens_after: 2_614 + Math.round(Math.sin(i * 0.5) * 100),
  }));
}

// ============================================================================
// Similarity Quality Trend
// ============================================================================

export function getMockSimilarityQuality(window: EnrichmentTimeWindow): SimilarityQualityPoint[] {
  if (window === '24h') {
    return Array.from({ length: 24 }, (_, i) => ({
      date: isoTs(0, 23 - i),
      avg_similarity_score: 0.76 + Math.sin(i * 0.6) * 0.04,
      avg_quality_score: 0.72 + Math.sin(i * 0.5) * 0.05,
      search_count: 96 + Math.round(Math.sin(i * 0.4) * 18),
    }));
  }

  const days = window === '7d' ? 7 : 30;
  return Array.from({ length: days }, (_, i) => ({
    date: isoDate(days - 1 - i),
    avg_similarity_score: 0.74 + (i / days) * 0.05 + Math.sin(i * 0.7) * 0.03,
    avg_quality_score: 0.7 + (i / days) * 0.06 + Math.sin(i * 0.6) * 0.03,
    search_count: 680 + Math.round((i / days) * 80 + Math.sin(i) * 40),
  }));
}

// ============================================================================
// Inflation Alerts
// ============================================================================

export function getMockInflationAlerts(_window: EnrichmentTimeWindow): InflationAlert[] {
  return [
    {
      correlation_id: 'cee-mock-001',
      channel: 'qdrant',
      model_name: 'qwen2.5-72b',
      tokens_before: 1_840,
      tokens_after: 3_210,
      net_tokens_saved: -1_370,
      occurred_at: isoTs(0, 1),
      repo: 'platform-core',
      agent_name: 'api-architect',
    },
    {
      correlation_id: 'cee-mock-002',
      channel: 'summarization',
      model_name: 'qwen2.5-72b',
      tokens_before: 2_100,
      tokens_after: 3_450,
      net_tokens_saved: -1_350,
      occurred_at: isoTs(0, 3),
      repo: 'platform-infra',
      agent_name: 'python-fastapi-expert',
    },
    {
      correlation_id: 'cee-mock-003',
      channel: 'similarity-search',
      model_name: 'gte-qwen2-1.5b',
      tokens_before: 1_560,
      tokens_after: 2_680,
      net_tokens_saved: -1_120,
      occurred_at: isoTs(0, 5),
      repo: 'omnidash4',
      agent_name: 'frontend-developer',
    },
    {
      correlation_id: 'cee-mock-004',
      channel: 'qdrant',
      model_name: 'qwen2.5-coder-14b',
      tokens_before: 1_240,
      tokens_after: 2_140,
      net_tokens_saved: -900,
      occurred_at: isoTs(0, 8),
      repo: 'platform-orchestrator',
      agent_name: 'context-gatherer',
    },
    {
      correlation_id: 'cee-mock-005',
      channel: 'inline-context',
      model_name: 'inline-embedding',
      tokens_before: 980,
      tokens_after: 1_760,
      net_tokens_saved: -780,
      occurred_at: isoTs(1, 0),
      repo: 'platform-claude',
      agent_name: 'debug-intelligence',
    },
    {
      correlation_id: 'cee-mock-006',
      channel: 'summarization',
      model_name: 'qwen2.5-72b',
      tokens_before: 1_620,
      tokens_after: 2_360,
      net_tokens_saved: -740,
      occurred_at: isoTs(1, 4),
      repo: 'platform-core',
      agent_name: 'documentation-architect',
    },
    {
      correlation_id: 'cee-mock-007',
      channel: 'qdrant',
      model_name: 'gte-qwen2-1.5b',
      tokens_before: 1_440,
      tokens_after: 2_160,
      net_tokens_saved: -720,
      occurred_at: isoTs(1, 9),
      repo: 'platform-base',
    },
    {
      correlation_id: 'cee-mock-008',
      channel: 'pattern-cache',
      model_name: 'pattern-cache',
      tokens_before: 860,
      tokens_after: 1_480,
      net_tokens_saved: -620,
      occurred_at: isoTs(2, 2),
      repo: 'omnidash4',
      agent_name: 'polymorphic-agent',
    },
  ];
}
