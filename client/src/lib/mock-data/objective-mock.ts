// SPDX-License-Identifier: MIT
/**
 * Mock Data: Objective Evaluation Dashboard (OMN-2583)
 *
 * Realistic demo data for score vector, gate failure timeline, policy state
 * history, and anti-gaming alert feed panels.
 *
 * Used when the database is unavailable or returns empty results.
 */

import type {
  ScoreVectorPoint,
  ScoreVectorAggregate,
  ScoreVectorSummaryResponse,
  GateFailureEvent,
  GateFailureBin,
  GateFailureTimelineResponse,
  GateType,
  PolicyStatePoint,
  PolicyStateHistoryResponse,
  PolicyType,
  AntiGamingAlert,
  AntiGamingAlertFeedResponse,
  ObjectiveTimeWindow,
} from '@shared/objective-types';

// ============================================================================
// Helpers
// ============================================================================

function isoTs(daysAgo: number, hoursAgo = 0, minutesAgo = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(d.getHours() - hoursAgo);
  d.setMinutes(d.getMinutes() - minutesAgo);
  return d.toISOString();
}

function isoDate(daysAgo: number): string {
  return isoTs(daysAgo).slice(0, 10);
}

function clamp(v: number, lo = 0, hi = 1): number {
  return Math.max(lo, Math.min(hi, v));
}

// ============================================================================
// Score Vector Mock
// ============================================================================

const MOCK_AGENTS = ['agent-api', 'agent-frontend', 'agent-database', 'agent-debug'];
const MOCK_SESSIONS = ['sess-a1b2', 'sess-c3d4', 'sess-e5f6', 'sess-g7h8', 'sess-i9j0'];
const MOCK_TASK_CLASSES = ['code-gen', 'code-review', 'debugging', 'documentation', 'analysis'];

function makeScorePoint(index: number): ScoreVectorPoint {
  const agent = MOCK_AGENTS[index % MOCK_AGENTS.length];
  const session = MOCK_SESSIONS[index % MOCK_SESSIONS.length];
  const taskClass = MOCK_TASK_CLASSES[index % MOCK_TASK_CLASSES.length];
  const base = 0.5 + (index % 5) * 0.08;
  return {
    evaluated_at: isoTs(Math.floor(index / 4), index % 24),
    session_id: session,
    agent_name: agent,
    task_class: taskClass,
    evaluation_id: `eval-${index.toString().padStart(4, '0')}`,
    scores: {
      correctness: clamp(base + 0.15 + Math.sin(index * 0.7) * 0.1),
      safety: clamp(base + 0.2 + Math.cos(index * 0.5) * 0.05),
      cost: clamp(base - 0.05 + Math.sin(index * 1.1) * 0.15),
      latency: clamp(base - 0.1 + Math.cos(index * 0.9) * 0.12),
      maintainability: clamp(base + 0.05 + Math.sin(index * 0.3) * 0.08),
      human_time: clamp(base + 0.08 + Math.cos(index * 0.6) * 0.1),
    },
  };
}

const MOCK_SCORE_POINTS: ScoreVectorPoint[] = Array.from({ length: 40 }, (_, i) =>
  makeScorePoint(i)
);

const MOCK_SCORE_AGGREGATES: ScoreVectorAggregate[] = MOCK_AGENTS.map((agent) => {
  const pts = MOCK_SCORE_POINTS.filter((p) => p.agent_name === agent);
  const avg = (key: keyof ScoreVectorPoint['scores']) =>
    pts.reduce((s, p) => s + p.scores[key], 0) / pts.length;
  return {
    context_label: agent,
    scores: {
      correctness: avg('correctness'),
      safety: avg('safety'),
      cost: avg('cost'),
      latency: avg('latency'),
      maintainability: avg('maintainability'),
      human_time: avg('human_time'),
    },
    sample_count: pts.length,
  };
});

export function getMockScoreVectorSummary(
  _window: ObjectiveTimeWindow
): ScoreVectorSummaryResponse {
  return {
    points: MOCK_SCORE_POINTS,
    aggregates: MOCK_SCORE_AGGREGATES,
    sessions: MOCK_SESSIONS,
    agents: MOCK_AGENTS,
    task_classes: MOCK_TASK_CLASSES,
  };
}

// ============================================================================
// Gate Failure Timeline Mock
// ============================================================================

const GATE_TYPES: GateType[] = [
  'safety_hard',
  'safety_soft',
  'correctness',
  'cost_budget',
  'latency_budget',
  'maintainability',
  'human_time',
];

function makeGateFailureEvent(index: number): GateFailureEvent {
  const gate = GATE_TYPES[index % GATE_TYPES.length];
  const agent = MOCK_AGENTS[index % MOCK_AGENTS.length];
  const session = MOCK_SESSIONS[index % MOCK_SESSIONS.length];
  return {
    occurred_at: isoTs(Math.floor(index / 3), index % 12, index % 60),
    gate_type: gate,
    session_id: session,
    agent_name: agent,
    evaluation_id: `eval-${(1000 + index).toString()}`,
    attribution_refs: [`tool-call-${index}`, `event-${index + 100}`],
    score_value: 0.1 + (index % 5) * 0.06,
    threshold: 0.5 + (index % 3) * 0.1,
    increased_vs_prev_window: index % 4 === 0,
  };
}

const MOCK_GATE_EVENTS: GateFailureEvent[] = Array.from({ length: 35 }, (_, i) =>
  makeGateFailureEvent(i)
);

function buildGateFailureBins(events: GateFailureEvent[], windowHours: number): GateFailureBin[] {
  const bins: GateFailureBin[] = [];
  const now = Date.now();
  const binCount = windowHours <= 24 ? 24 : 14;
  const binMs = (windowHours * 3_600_000) / binCount;

  for (let i = 0; i < binCount; i++) {
    const binStart = new Date(now - (binCount - i) * binMs);
    const binEnd = new Date(binStart.getTime() + binMs);
    const inBin = events.filter((e) => {
      const t = new Date(e.occurred_at).getTime();
      return t >= binStart.getTime() && t < binEnd.getTime();
    });
    const byGate: Partial<Record<GateType, number>> = {};
    inBin.forEach((e) => {
      byGate[e.gate_type] = (byGate[e.gate_type] ?? 0) + 1;
    });
    bins.push({
      bin_start: binStart.toISOString(),
      total: inBin.length,
      by_gate_type: byGate,
    });
  }
  return bins;
}

export function getMockGateFailureTimeline(
  window: ObjectiveTimeWindow
): GateFailureTimelineResponse {
  const windowHours = window === '24h' ? 24 : window === '7d' ? 168 : 720;
  const bins = buildGateFailureBins(MOCK_GATE_EVENTS, windowHours);
  const totals: Partial<Record<GateType, number>> = {};
  MOCK_GATE_EVENTS.forEach((e) => {
    totals[e.gate_type] = (totals[e.gate_type] ?? 0) + 1;
  });
  return {
    bins,
    events: MOCK_GATE_EVENTS,
    totals_by_gate_type: totals,
    total_failures: MOCK_GATE_EVENTS.length,
    escalating_sessions: MOCK_GATE_EVENTS.filter((e) => e.increased_vs_prev_window).map(
      (e) => e.session_id
    ),
  };
}

// ============================================================================
// Policy State History Mock
// ============================================================================

const MOCK_POLICY_IDS = ['policy-scoring-v1', 'policy-routing-v2', 'policy-safety-v1'];
const MOCK_POLICY_TYPES: PolicyType[] = ['scoring', 'routing', 'safety'];
const LIFECYCLE: Array<'candidate' | 'validated' | 'promoted' | 'deprecated'> = [
  'candidate',
  'validated',
  'promoted',
  'deprecated',
];

function makePolicyStatePoints(policyIdx: number): PolicyStatePoint[] {
  const policyId = MOCK_POLICY_IDS[policyIdx];
  const policyType = MOCK_POLICY_TYPES[policyIdx];
  return Array.from({ length: 20 }, (_, i) => {
    const lifecycleIdx = Math.min(Math.floor(i / 6), LIFECYCLE.length - 1);
    const isTransition = i % 6 === 0 && i > 0;
    const isBlacklist = i === 18 && policyIdx === 1;
    const hasDegraded = i === 10 && policyIdx === 0;
    return {
      recorded_at: isoTs(19 - i),
      policy_id: policyId,
      policy_type: policyType,
      policy_version: `v${policyIdx + 1}.${Math.floor(i / 4)}`,
      lifecycle_state: LIFECYCLE[lifecycleIdx],
      reliability_0_1: clamp(0.5 + i * 0.022 + Math.sin(i * 0.8) * 0.05),
      confidence_0_1: clamp(0.45 + i * 0.025 + Math.cos(i * 0.6) * 0.04),
      is_transition: isTransition,
      is_auto_blacklist: isBlacklist,
      has_tool_degraded_alert: hasDegraded,
      tool_degraded_message: hasDegraded
        ? 'system.alert.tool_degraded: scoring tool latency exceeded 5s'
        : undefined,
    };
  });
}

const MOCK_POLICY_POINTS: PolicyStatePoint[] = MOCK_POLICY_IDS.flatMap((_, i) =>
  makePolicyStatePoints(i)
).sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));

export function getMockPolicyStateHistory(
  _window: ObjectiveTimeWindow
): PolicyStateHistoryResponse {
  return {
    points: MOCK_POLICY_POINTS,
    policy_ids: MOCK_POLICY_IDS,
    policy_types: MOCK_POLICY_TYPES,
    current_states: MOCK_POLICY_IDS.map((id, i) => {
      const pts = MOCK_POLICY_POINTS.filter((p) => p.policy_id === id);
      const last = pts[pts.length - 1];
      return {
        policy_id: id,
        policy_type: MOCK_POLICY_TYPES[i],
        lifecycle_state: last.lifecycle_state,
        reliability_0_1: last.reliability_0_1,
        confidence_0_1: last.confidence_0_1,
      };
    }),
  };
}

// ============================================================================
// Anti-Gaming Alert Feed Mock
// ============================================================================

const MOCK_ALERTS: AntiGamingAlert[] = [
  {
    alert_id: 'ag-001',
    alert_type: 'goodhart_violation',
    triggered_at: isoTs(0, 2),
    metric_name: 'correctness',
    proxy_metric: 'test_pass_rate',
    delta: 0.23,
    description:
      'Goodhart violation: test_pass_rate improved +23% while correctness degraded. Proxy metric gaming detected.',
    session_id: 'sess-a1b2',
    acknowledged: false,
  },
  {
    alert_id: 'ag-002',
    alert_type: 'reward_hacking',
    triggered_at: isoTs(0, 5),
    metric_name: 'cost',
    proxy_metric: 'token_count',
    delta: -0.41,
    description: 'Reward hacking: agent minimizing token_count proxy at cost of output quality.',
    session_id: 'sess-c3d4',
    acknowledged: false,
  },
  {
    alert_id: 'ag-003',
    alert_type: 'distributional_shift',
    triggered_at: isoTs(1, 3),
    metric_name: 'safety',
    proxy_metric: 'refusal_rate',
    delta: 0.18,
    description: 'Distributional shift: refusal_rate diverged from safety score baseline by +18%.',
    session_id: 'sess-e5f6',
    acknowledged: true,
    acknowledged_at: isoTs(1, 1),
  },
  {
    alert_id: 'ag-004',
    alert_type: 'goodhart_violation',
    triggered_at: isoTs(2, 6),
    metric_name: 'human_time',
    proxy_metric: 'response_length',
    delta: 0.31,
    description: 'Goodhart violation: response_length proxy diverged +31% from human_time savings.',
    session_id: 'sess-g7h8',
    acknowledged: false,
  },
  {
    alert_id: 'ag-005',
    alert_type: 'reward_hacking',
    triggered_at: isoTs(3, 0),
    metric_name: 'maintainability',
    proxy_metric: 'cyclomatic_complexity',
    delta: -0.28,
    description:
      'Reward hacking: complexity proxy reduction not correlated with maintainability improvement.',
    session_id: 'sess-i9j0',
    acknowledged: true,
    acknowledged_at: isoTs(2, 22),
  },
];

export function getMockAntiGamingAlerts(_window: ObjectiveTimeWindow): AntiGamingAlertFeedResponse {
  return {
    alerts: MOCK_ALERTS,
    total_unacknowledged: MOCK_ALERTS.filter((a) => !a.acknowledged).length,
  };
}

// ============================================================================
// Exports for index
// ============================================================================

export { isoDate };
