// SPDX-License-Identifier: MIT
/**
 * Objective Evaluation Mock Data (OMN-2583)
 *
 * Deterministic mock data for ObjectiveEvaluation component tests.
 * Each getter accepts an ObjectiveTimeWindow for API parity but
 * returns the same fixture data regardless of window.
 */

import type {
  ScoreVectorSummaryResponse,
  GateFailureTimelineResponse,
  PolicyStateHistoryResponse,
  AntiGamingAlertFeedResponse,
  ObjectiveTimeWindow,
} from '@shared/objective-types';

export function getMockScoreVectorSummary(
  _window: ObjectiveTimeWindow
): ScoreVectorSummaryResponse {
  return {
    points: [
      {
        evaluated_at: '2026-03-27T10:00:00Z',
        session_id: 'sess-001',
        agent_name: 'claude-opus',
        task_class: 'code-review',
        scores: {
          correctness: 0.92,
          safety: 0.98,
          cost: 0.75,
          latency: 0.8,
          maintainability: 0.88,
          human_time: 0.7,
        },
        evaluation_id: 'eval-001',
      },
      {
        evaluated_at: '2026-03-27T11:00:00Z',
        session_id: 'sess-002',
        agent_name: 'claude-sonnet',
        task_class: 'refactor',
        scores: {
          correctness: 0.85,
          safety: 0.95,
          cost: 0.9,
          latency: 0.92,
          maintainability: 0.82,
          human_time: 0.65,
        },
        evaluation_id: 'eval-002',
      },
    ],
    aggregates: [
      {
        context_label: 'claude-opus',
        scores: {
          correctness: 0.92,
          safety: 0.98,
          cost: 0.75,
          latency: 0.8,
          maintainability: 0.88,
          human_time: 0.7,
        },
        sample_count: 1,
      },
    ],
    sessions: ['sess-001', 'sess-002'],
    agents: ['claude-opus', 'claude-sonnet'],
    task_classes: ['code-review', 'refactor'],
  };
}

export function getMockGateFailureTimeline(
  _window: ObjectiveTimeWindow
): GateFailureTimelineResponse {
  return {
    bins: [
      {
        bin_start: '2026-03-27T00:00:00Z',
        total: 3,
        by_gate_type: { safety_hard: 1, correctness: 2 },
      },
      {
        bin_start: '2026-03-27T06:00:00Z',
        total: 1,
        by_gate_type: { cost_budget: 1 },
      },
    ],
    events: [
      {
        occurred_at: '2026-03-27T02:30:00Z',
        gate_type: 'safety_hard',
        session_id: 'sess-001',
        agent_name: 'claude-opus',
        evaluation_id: 'eval-001',
        attribution_refs: ['tool-call-abc'],
        score_value: 0.3,
        threshold: 0.5,
        increased_vs_prev_window: false,
      },
      {
        occurred_at: '2026-03-27T03:15:00Z',
        gate_type: 'correctness',
        session_id: 'sess-002',
        agent_name: 'claude-sonnet',
        evaluation_id: 'eval-002',
        attribution_refs: ['tool-call-def'],
        score_value: 0.45,
        threshold: 0.6,
        increased_vs_prev_window: true,
      },
    ],
    totals_by_gate_type: { safety_hard: 1, correctness: 2, cost_budget: 1 },
    total_failures: 4,
    escalating_sessions: ['sess-002'],
  };
}

export function getMockPolicyStateHistory(
  _window: ObjectiveTimeWindow
): PolicyStateHistoryResponse {
  return {
    points: [
      {
        recorded_at: '2026-03-26T10:00:00Z',
        policy_id: 'policy-scoring-v1',
        policy_type: 'scoring',
        policy_version: '1.0.0',
        lifecycle_state: 'candidate',
        reliability_0_1: 0.75,
        confidence_0_1: 0.6,
        is_transition: true,
        is_auto_blacklist: false,
        has_tool_degraded_alert: false,
      },
      {
        recorded_at: '2026-03-27T10:00:00Z',
        policy_id: 'policy-scoring-v1',
        policy_type: 'scoring',
        policy_version: '1.0.0',
        lifecycle_state: 'validated',
        reliability_0_1: 0.85,
        confidence_0_1: 0.78,
        is_transition: true,
        is_auto_blacklist: false,
        has_tool_degraded_alert: false,
      },
    ],
    policy_ids: ['policy-scoring-v1'],
    policy_types: ['scoring'],
    current_states: [
      {
        policy_id: 'policy-scoring-v1',
        policy_type: 'scoring',
        lifecycle_state: 'candidate',
        reliability_0_1: 0.85,
        confidence_0_1: 0.78,
      },
    ],
  };
}

export function getMockAntiGamingAlerts(_window: ObjectiveTimeWindow): AntiGamingAlertFeedResponse {
  return {
    alerts: [
      {
        alert_id: 'alert-001',
        alert_type: 'goodhart_violation',
        triggered_at: '2026-03-27T14:00:00Z',
        metric_name: 'correctness',
        proxy_metric: 'test_pass_rate',
        delta: 0.25,
        description:
          'Correctness score increased 25% while test pass rate remained flat — possible Goodhart optimization.',
        session_id: 'sess-003',
        acknowledged: false,
      },
      {
        alert_id: 'alert-002',
        alert_type: 'goodhart_violation',
        triggered_at: '2026-03-27T12:00:00Z',
        metric_name: 'cost',
        proxy_metric: 'quality_score',
        delta: 0.18,
        description:
          'Cost score improved 18% but quality score degraded — possible gaming of cost metric.',
        session_id: 'sess-004',
        acknowledged: true,
        acknowledged_at: '2026-03-27T13:00:00Z',
      },
    ],
    total_unacknowledged: 1,
  };
}
