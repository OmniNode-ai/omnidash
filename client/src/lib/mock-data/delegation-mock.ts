/**
 * Delegation Dashboard Mock Data (OMN-2284)
 *
 * Deterministic mock data for DelegationDashboard component tests.
 * Each getter accepts a DelegationTimeWindow for API parity but
 * returns the same fixture data regardless of window.
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

export function getMockDelegationSummary(_window: DelegationTimeWindow): DelegationSummary {
  return {
    total_delegations: 142,
    delegation_rate: 0.68,
    quality_gate_pass_rate: 0.83,
    total_cost_savings_usd: 1245.5,
    avg_cost_savings_usd: 8.77,
    shadow_divergence_rate: 0.12,
    total_shadow_comparisons: 85,
    avg_delegation_latency_ms: 320,
    counts: {
      total: 142,
      quality_gate_passed: 118,
      quality_gate_failed: 24,
      shadow_diverged: 10,
      shadow_agreed: 75,
    },
    quality_gate_trend: [
      { date: '2026-03-25', value: 0.8 },
      { date: '2026-03-26', value: 0.82 },
      { date: '2026-03-27', value: 0.85 },
      { date: '2026-03-28', value: 0.83 },
    ],
  };
}

export function getMockDelegationByTaskType(_window: DelegationTimeWindow): DelegationByTaskType[] {
  return [
    {
      task_type: 'code-review',
      total: 52,
      quality_gate_passed: 45,
      quality_gate_pass_rate: 0.87,
      total_cost_savings_usd: 520.0,
      avg_cost_savings_usd: 10.0,
      avg_latency_ms: 280,
      shadow_divergences: 3,
    },
    {
      task_type: 'refactor',
      total: 38,
      quality_gate_passed: 30,
      quality_gate_pass_rate: 0.79,
      total_cost_savings_usd: 380.0,
      avg_cost_savings_usd: 10.0,
      avg_latency_ms: 450,
      shadow_divergences: 4,
    },
    {
      task_type: 'test-generation',
      total: 28,
      quality_gate_passed: 24,
      quality_gate_pass_rate: 0.86,
      total_cost_savings_usd: 210.0,
      avg_cost_savings_usd: 7.5,
      avg_latency_ms: 220,
      shadow_divergences: 2,
    },
  ];
}

export function getMockDelegationCostSavings(
  _window: DelegationTimeWindow
): DelegationCostSavingsTrendPoint[] {
  return [
    {
      date: '2026-03-25',
      cost_savings_usd: 150.0,
      total_cost_usd: 45.0,
      total_delegations: 20,
      avg_savings_usd: 7.5,
    },
    {
      date: '2026-03-26',
      cost_savings_usd: 180.0,
      total_cost_usd: 52.0,
      total_delegations: 24,
      avg_savings_usd: 7.5,
    },
    {
      date: '2026-03-27',
      cost_savings_usd: 210.0,
      total_cost_usd: 60.0,
      total_delegations: 28,
      avg_savings_usd: 7.5,
    },
  ];
}

export function getMockDelegationQualityGates(
  _window: DelegationTimeWindow
): DelegationQualityGatePoint[] {
  return [
    { date: '2026-03-25', pass_rate: 0.8, total_checked: 20, passed: 16, failed: 4 },
    { date: '2026-03-26', pass_rate: 0.83, total_checked: 24, passed: 20, failed: 4 },
    { date: '2026-03-27', pass_rate: 0.86, total_checked: 28, passed: 24, failed: 4 },
  ];
}

export function getMockDelegationShadowDivergence(
  _window: DelegationTimeWindow
): DelegationShadowDivergence[] {
  return [
    {
      occurred_at: '2026-03-27T14:30:00Z',
      primary_agent: 'claude-opus',
      shadow_agent: 'claude-sonnet',
      task_type: 'code-review',
      count: 3,
      avg_divergence_score: 0.35,
      avg_primary_latency_ms: 280,
      avg_shadow_latency_ms: 180,
    },
    {
      occurred_at: '2026-03-27T12:15:00Z',
      primary_agent: 'claude-opus',
      shadow_agent: 'qwen3-coder',
      task_type: 'refactor',
      count: 2,
      avg_divergence_score: 0.52,
      avg_primary_latency_ms: 450,
      avg_shadow_latency_ms: 320,
    },
  ];
}

export function getMockDelegationTrend(_window: DelegationTimeWindow): DelegationTrendPoint[] {
  return [
    {
      date: '2026-03-25',
      quality_gate_pass_rate: 0.8,
      shadow_divergence_rate: 0.15,
      cost_savings_usd: 150.0,
      total_delegations: 20,
    },
    {
      date: '2026-03-26',
      quality_gate_pass_rate: 0.83,
      shadow_divergence_rate: 0.12,
      cost_savings_usd: 180.0,
      total_delegations: 24,
    },
    {
      date: '2026-03-27',
      quality_gate_pass_rate: 0.86,
      shadow_divergence_rate: 0.1,
      cost_savings_usd: 210.0,
      total_delegations: 28,
    },
  ];
}
