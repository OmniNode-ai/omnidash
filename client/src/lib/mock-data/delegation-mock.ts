/**
 * Delegation Mock Data (OMN-2284)
 *
 * Deterministic mock data factories for delegation dashboard tests.
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
    total_shadow_comparisons: 50,
    avg_delegation_latency_ms: 320,
    counts: {
      total: 142,
      quality_gate_passed: 118,
      quality_gate_failed: 24,
      shadow_diverged: 6,
      shadow_agreed: 44,
    },
    quality_gate_trend: [
      { date: '2026-03-01', value: 0.8 },
      { date: '2026-03-02', value: 0.85 },
      { date: '2026-03-03', value: 0.83 },
    ],
  };
}

export function getMockDelegationByTaskType(_window: DelegationTimeWindow): DelegationByTaskType[] {
  return [
    {
      task_type: 'code-review',
      total: 45,
      quality_gate_passed: 40,
      quality_gate_pass_rate: 0.89,
      total_cost_savings_usd: 450.0,
      avg_cost_savings_usd: 10.0,
      avg_latency_ms: 280,
      shadow_divergences: 2,
    },
    {
      task_type: 'refactor',
      total: 32,
      quality_gate_passed: 25,
      quality_gate_pass_rate: 0.78,
      total_cost_savings_usd: 320.0,
      avg_cost_savings_usd: 10.0,
      avg_latency_ms: 350,
      shadow_divergences: 3,
    },
  ];
}

export function getMockDelegationCostSavings(
  _window: DelegationTimeWindow
): DelegationCostSavingsTrendPoint[] {
  return [
    {
      date: '2026-03-01',
      cost_savings_usd: 150.0,
      total_cost_usd: 50.0,
      total_delegations: 20,
      avg_savings_usd: 7.5,
    },
    {
      date: '2026-03-02',
      cost_savings_usd: 200.0,
      total_cost_usd: 60.0,
      total_delegations: 25,
      avg_savings_usd: 8.0,
    },
  ];
}

export function getMockDelegationQualityGates(
  _window: DelegationTimeWindow
): DelegationQualityGatePoint[] {
  return [
    { date: '2026-03-01', pass_rate: 0.8, total_checked: 20, passed: 16, failed: 4 },
    { date: '2026-03-02', pass_rate: 0.85, total_checked: 25, passed: 21, failed: 4 },
  ];
}

export function getMockDelegationShadowDivergence(
  _window: DelegationTimeWindow
): DelegationShadowDivergence[] {
  return [
    {
      occurred_at: '2026-03-02T14:30:00Z',
      primary_agent: 'polymorphic-agent',
      shadow_agent: 'specialist-refactor',
      task_type: 'refactor',
      count: 3,
      avg_divergence_score: 0.45,
      avg_primary_latency_ms: 320,
      avg_shadow_latency_ms: 280,
    },
  ];
}

export function getMockDelegationTrend(_window: DelegationTimeWindow): DelegationTrendPoint[] {
  return [
    {
      date: '2026-03-01',
      quality_gate_pass_rate: 0.8,
      shadow_divergence_rate: 0.15,
      cost_savings_usd: 150.0,
      total_delegations: 20,
    },
    {
      date: '2026-03-02',
      quality_gate_pass_rate: 0.85,
      shadow_divergence_rate: 0.1,
      cost_savings_usd: 200.0,
      total_delegations: 25,
    },
  ];
}
