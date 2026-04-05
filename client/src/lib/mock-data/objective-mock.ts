/**
 * Objective Evaluation Mock Data (OMN-2583)
 *
 * Deterministic mock data factories for objective evaluation dashboard tests.
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
        evaluated_at: '2026-03-02T10:00:00Z',
        session_id: 'sess-001',
        agent_name: 'polymorphic-agent',
        task_class: 'code-review',
        scores: {
          correctness: 0.92,
          safety: 0.95,
          cost: 0.78,
          latency: 0.85,
          maintainability: 0.88,
          human_time: 0.72,
        },
        evaluation_id: 'eval-001',
      },
    ],
    aggregates: [
      {
        context_label: 'polymorphic-agent',
        scores: {
          correctness: 0.9,
          safety: 0.94,
          cost: 0.8,
          latency: 0.83,
          maintainability: 0.87,
          human_time: 0.7,
        },
        sample_count: 15,
      },
    ],
    sessions: ['sess-001'],
    agents: ['polymorphic-agent'],
    task_classes: ['code-review'],
  };
}

export function getMockGateFailureTimeline(
  _window: ObjectiveTimeWindow
): GateFailureTimelineResponse {
  return {
    bins: [
      {
        bin_start: '2026-03-02T00:00:00Z',
        total: 3,
        by_gate_type: { safety_hard: 1, correctness: 2 },
      },
    ],
    events: [
      {
        occurred_at: '2026-03-02T10:30:00Z',
        gate_type: 'safety_hard',
        session_id: 'sess-002',
        agent_name: 'polymorphic-agent',
        evaluation_id: 'eval-002',
        attribution_refs: ['tool-call-123'],
        score_value: 0.3,
        threshold: 0.5,
        increased_vs_prev_window: false,
      },
    ],
    totals_by_gate_type: { safety_hard: 1, correctness: 2 },
    total_failures: 3,
    escalating_sessions: [],
  };
}

export function getMockPolicyStateHistory(
  _window: ObjectiveTimeWindow
): PolicyStateHistoryResponse {
  return {
    points: [
      {
        recorded_at: '2026-03-02T08:00:00Z',
        policy_id: 'policy-scoring-v1',
        policy_type: 'scoring',
        policy_version: '1.0.0',
        lifecycle_state: 'validated',
        reliability_0_1: 0.92,
        confidence_0_1: 0.88,
        is_transition: false,
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
        reliability_0_1: 0.92,
        confidence_0_1: 0.88,
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
        triggered_at: '2026-03-02T11:00:00Z',
        metric_name: 'correctness',
        proxy_metric: 'test_pass_rate',
        delta: 0.15,
        description: 'Goodhart Violation: correctness metric diverged from test_pass_rate proxy',
        session_id: 'sess-003',
        acknowledged: false,
      },
      {
        alert_id: 'alert-002',
        alert_type: 'goodhart_violation',
        triggered_at: '2026-03-02T12:00:00Z',
        metric_name: 'cost',
        proxy_metric: 'token_efficiency',
        delta: 0.2,
        description: 'Goodhart Violation: cost metric diverged from token_efficiency proxy',
        session_id: 'sess-004',
        acknowledged: true,
        acknowledged_at: '2026-03-02T12:30:00Z',
      },
    ],
    total_unacknowledged: 1,
  };
}
