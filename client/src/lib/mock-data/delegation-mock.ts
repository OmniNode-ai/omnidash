/**
 * Mock Data: Delegation Metrics (OMN-2284)
 *
 * Realistic demo data for the delegation metrics dashboard.
 * Used when the database is unavailable or returns empty results.
 *
 * Designed to demonstrate:
 * - Quality gate pass rate hovering near and above the 80% target
 * - Cost savings from delegating tasks to specialist agents
 * - Shadow validation divergence patterns by task type
 * - Visible improvement in quality gate pass rate over time
 */

import type {
  DelegationSummary,
  DelegationByTaskType,
  DelegationCostSavingsTrendPoint,
  DelegationQualityGatePoint,
  DelegationShadowDivergence,
  DelegationTrendPoint,
  DelegationTimeWindow,
} from '@shared/delegation-types';

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

const QUALITY_GATE_TREND_7D = Array.from({ length: 7 }, (_, i) => ({
  date: isoDate(6 - i),
  value: 0.76 + i * 0.012 + Math.sin(i * 0.8) * 0.025,
}));

const QUALITY_GATE_TREND_30D = Array.from({ length: 30 }, (_, i) => ({
  date: isoDate(29 - i),
  value: 0.62 + i * 0.006 + Math.sin(i * 0.5) * 0.03,
}));

const QUALITY_GATE_TREND_24H = Array.from({ length: 24 }, (_, i) => ({
  date: isoTs(0, 23 - i),
  value: 0.82 + Math.sin(i * 0.6) * 0.05,
}));

export function getMockDelegationSummary(window: DelegationTimeWindow): DelegationSummary {
  // Base decision counts per window
  const base = window === '24h' ? 380 * 24 : window === '7d' ? 420 * 7 : 420 * 30;

  const qualityPassed = Math.round(base * 0.83);
  const qualityFailed = Math.round(base * 0.17);
  const shadowCompared = Math.round(base * 0.45);
  const shadowDiverged = Math.round(shadowCompared * 0.14);

  return {
    total_delegations: base,
    delegation_rate: 0.68,
    quality_gate_pass_rate: qualityPassed / (qualityPassed + qualityFailed),
    total_cost_savings_usd: base * 0.0024,
    avg_cost_savings_usd: 0.0024,
    shadow_divergence_rate: shadowDiverged / shadowCompared,
    total_shadow_comparisons: shadowCompared,
    avg_delegation_latency_ms: 42,
    counts: {
      total: base,
      quality_gate_passed: qualityPassed,
      quality_gate_failed: qualityFailed,
      shadow_diverged: shadowDiverged,
      shadow_agreed: shadowCompared - shadowDiverged,
    },
    quality_gate_trend:
      window === '24h'
        ? QUALITY_GATE_TREND_24H
        : window === '7d'
          ? QUALITY_GATE_TREND_7D
          : QUALITY_GATE_TREND_30D,
  };
}

// ============================================================================
// By Task Type
// ============================================================================

export function getMockDelegationByTaskType(_window: DelegationTimeWindow): DelegationByTaskType[] {
  return [
    {
      task_type: 'code-review',
      total: 1840,
      quality_gate_passed: 1585,
      quality_gate_pass_rate: 1585 / 1840,
      total_cost_savings_usd: 1840 * 0.0031,
      avg_cost_savings_usd: 0.0031,
      avg_latency_ms: 38,
      shadow_divergences: 64,
    },
    {
      task_type: 'refactor',
      total: 1210,
      quality_gate_passed: 1008,
      quality_gate_pass_rate: 1008 / 1210,
      total_cost_savings_usd: 1210 * 0.0018,
      avg_cost_savings_usd: 0.0018,
      avg_latency_ms: 55,
      shadow_divergences: 42,
    },
    {
      task_type: 'test-generation',
      total: 980,
      quality_gate_passed: 857,
      quality_gate_pass_rate: 857 / 980,
      total_cost_savings_usd: 980 * 0.0022,
      avg_cost_savings_usd: 0.0022,
      avg_latency_ms: 61,
      shadow_divergences: 38,
    },
    {
      task_type: 'documentation',
      total: 740,
      quality_gate_passed: 680,
      quality_gate_pass_rate: 680 / 740,
      total_cost_savings_usd: 740 * 0.0015,
      avg_cost_savings_usd: 0.0015,
      avg_latency_ms: 29,
      shadow_divergences: 21,
    },
    {
      task_type: 'debugging',
      total: 620,
      quality_gate_passed: 490,
      quality_gate_pass_rate: 490 / 620,
      total_cost_savings_usd: 620 * 0.0028,
      avg_cost_savings_usd: 0.0028,
      avg_latency_ms: 74,
      shadow_divergences: 55,
    },
    {
      task_type: 'security-audit',
      total: 380,
      quality_gate_passed: 342,
      quality_gate_pass_rate: 342 / 380,
      total_cost_savings_usd: 380 * 0.0041,
      avg_cost_savings_usd: 0.0041,
      avg_latency_ms: 88,
      shadow_divergences: 18,
    },
  ];
}

// ============================================================================
// Cost Savings Trend
// ============================================================================

export function getMockDelegationCostSavings(
  window: DelegationTimeWindow
): DelegationCostSavingsTrendPoint[] {
  if (window === '24h') {
    return Array.from({ length: 24 }, (_, i) => {
      const total = 380 + Math.round(Math.sin(i * 0.6) * 45);
      const savings = total * (0.0024 + Math.sin(i * 0.4) * 0.0003);
      return {
        date: isoTs(0, 23 - i),
        cost_savings_usd: savings,
        total_cost_usd: total * 0.0038,
        total_delegations: total,
        avg_savings_usd: savings / total,
      };
    });
  }

  const days = window === '7d' ? 7 : 30;
  return Array.from({ length: days }, (_, i) => {
    const total = 420 + Math.round((i / days) * 60) + Math.round(Math.sin(i) * 30);
    const savings = total * (0.0021 + (i / days) * 0.0006);
    return {
      date: isoDate(days - 1 - i),
      cost_savings_usd: savings,
      total_cost_usd: total * 0.0035,
      total_delegations: total,
      avg_savings_usd: savings / total,
    };
  });
}

// ============================================================================
// Quality Gate Pass Rate
// ============================================================================

export function getMockDelegationQualityGates(
  window: DelegationTimeWindow
): DelegationQualityGatePoint[] {
  if (window === '24h') {
    return Array.from({ length: 24 }, (_, i) => {
      const total = 380 + Math.round(Math.sin(i * 0.6) * 40);
      const passRate = 0.82 + Math.sin(i * 0.5) * 0.05;
      const passed = Math.round(total * passRate);
      return {
        date: isoTs(0, 23 - i),
        pass_rate: passRate,
        total_checked: total,
        passed,
        failed: total - passed,
      };
    });
  }

  const days = window === '7d' ? 7 : 30;
  return Array.from({ length: days }, (_, i) => {
    const total = 420 + Math.round((i / days) * 50);
    const passRate = 0.7 + (i / days) * 0.14 + Math.sin(i * 0.7) * 0.03;
    const passed = Math.round(total * passRate);
    return {
      date: isoDate(days - 1 - i),
      pass_rate: passRate,
      total_checked: total,
      passed,
      failed: total - passed,
    };
  });
}

// ============================================================================
// Shadow Divergence Pairs
// ============================================================================

export function getMockDelegationShadowDivergence(
  _window: DelegationTimeWindow
): DelegationShadowDivergence[] {
  return [
    {
      occurred_at: isoTs(0, 2),
      primary_agent: 'python-fastapi-expert',
      shadow_agent: 'testing',
      task_type: 'code-review',
      count: 128,
      avg_divergence_score: 0.34,
      avg_primary_latency_ms: 88,
      avg_shadow_latency_ms: 142,
    },
    {
      occurred_at: isoTs(0, 5),
      primary_agent: 'testing',
      shadow_agent: 'code-quality-analyzer',
      task_type: 'test-generation',
      count: 96,
      avg_divergence_score: 0.28,
      avg_primary_latency_ms: 62,
      avg_shadow_latency_ms: 74,
    },
    {
      occurred_at: isoTs(1, 0),
      primary_agent: 'debug',
      shadow_agent: 'debug-intelligence',
      task_type: 'debugging',
      count: 84,
      avg_divergence_score: 0.41,
      avg_primary_latency_ms: 75,
      avg_shadow_latency_ms: 68,
    },
    {
      occurred_at: isoTs(1, 8),
      primary_agent: 'documentation-architect',
      shadow_agent: 'onex-readme',
      task_type: 'documentation',
      count: 61,
      avg_divergence_score: 0.19,
      avg_primary_latency_ms: 28,
      avg_shadow_latency_ms: 35,
    },
    {
      occurred_at: isoTs(2, 3),
      primary_agent: 'security-audit',
      shadow_agent: 'code-quality-analyzer',
      task_type: 'security-audit',
      count: 47,
      avg_divergence_score: 0.52,
      avg_primary_latency_ms: 91,
      avg_shadow_latency_ms: 104,
    },
    {
      occurred_at: isoTs(3, 1),
      primary_agent: 'api-architect',
      shadow_agent: 'python-fastapi-expert',
      task_type: 'refactor',
      count: 38,
      avg_divergence_score: 0.23,
      avg_primary_latency_ms: 56,
      avg_shadow_latency_ms: 82,
    },
  ];
}

// ============================================================================
// Trend
// ============================================================================

export function getMockDelegationTrend(window: DelegationTimeWindow): DelegationTrendPoint[] {
  if (window === '24h') {
    return Array.from({ length: 24 }, (_, i) => ({
      date: isoTs(0, 23 - i),
      quality_gate_pass_rate: 0.82 + Math.sin(i * 0.5) * 0.06,
      shadow_divergence_rate: 0.14 + Math.sin(i * 0.3) * 0.04,
      cost_savings_usd: (380 + Math.round(Math.sin(i * 0.6) * 40)) * 0.0024,
      total_delegations: 380 + Math.round(Math.sin(i * 0.6) * 40),
    }));
  }

  const days = window === '7d' ? 7 : 30;
  return Array.from({ length: days }, (_, i) => ({
    date: isoDate(days - 1 - i),
    quality_gate_pass_rate: 0.68 + (i / days) * 0.16 + Math.sin(i * 0.7) * 0.03,
    shadow_divergence_rate: 0.22 - (i / days) * 0.09 + Math.sin(i * 0.4) * 0.02,
    cost_savings_usd: (420 + Math.round((i / days) * 60)) * (0.0021 + (i / days) * 0.0005),
    total_delegations: 420 + Math.round((i / days) * 60),
  }));
}
