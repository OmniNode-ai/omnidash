/**
 * Mock Data for Injection Effectiveness Dashboard
 *
 * Provides demo data when API is unavailable.
 * @see OMN-1891
 */

import type {
  EffectivenessSummary,
  ThrottleStatus,
  LatencyDetails,
  UtilizationDetails,
  ABComparison,
  EffectivenessTrendPoint,
} from '@shared/effectiveness-types';

export function getMockSummary(): EffectivenessSummary {
  return {
    injection_rate: 0.82,
    injection_rate_target: 0.8,
    median_utilization: 0.65,
    utilization_target: 0.6,
    mean_agent_accuracy: 0.78,
    accuracy_target: 0.8,
    latency_delta_p95_ms: 120,
    latency_delta_target_ms: 150,
    total_sessions: 1247,
    treatment_sessions: 843,
    control_sessions: 404,
    throttle_active: false,
    throttle_reason: null,
  };
}

export function getMockThrottleStatus(): ThrottleStatus {
  return {
    active: false,
    reason: null,
    latency_delta_p95_1h: 95,
    median_utilization_1h: 0.62,
    injected_sessions_1h: 38,
    window_start: new Date(Date.now() - 3600000).toISOString(),
  };
}

export function getMockLatencyDetails(): LatencyDetails {
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return d.toISOString().slice(0, 10);
  });

  return {
    breakdowns: [
      {
        cohort: 'treatment',
        p50_ms: 245,
        p95_ms: 520,
        p99_ms: 890,
        routing_avg_ms: 45,
        retrieval_avg_ms: 120,
        injection_avg_ms: 80,
        sample_count: 4320,
      },
      {
        cohort: 'control',
        p50_ms: 180,
        p95_ms: 400,
        p99_ms: 720,
        routing_avg_ms: 42,
        retrieval_avg_ms: 0,
        injection_avg_ms: 0,
        sample_count: 2180,
      },
    ],
    trend: days.map((date) => ({
      date,
      treatment_p50: 220 + Math.random() * 60,
      treatment_p95: 480 + Math.random() * 80,
      control_p50: 170 + Math.random() * 30,
      control_p95: 380 + Math.random() * 40,
      delta_p95: 80 + Math.random() * 60,
    })),
    cache: {
      hit_rate: 0.34,
      total_hits: 1470,
      total_misses: 2850,
    },
  };
}

export function getMockUtilizationDetails(): UtilizationDetails {
  return {
    histogram: [
      { range_start: 0.0, range_end: 0.1, count: 12 },
      { range_start: 0.1, range_end: 0.2, count: 28 },
      { range_start: 0.2, range_end: 0.3, count: 45 },
      { range_start: 0.3, range_end: 0.4, count: 67 },
      { range_start: 0.4, range_end: 0.5, count: 89 },
      { range_start: 0.5, range_end: 0.6, count: 124 },
      { range_start: 0.6, range_end: 0.7, count: 156 },
      { range_start: 0.7, range_end: 0.8, count: 132 },
      { range_start: 0.8, range_end: 0.9, count: 95 },
      { range_start: 0.9, range_end: 1.0, count: 52 },
    ],
    by_method: [
      { method: 'heuristic', median_score: 0.68, session_count: 520 },
      { method: 'embedding_similarity', median_score: 0.72, session_count: 310 },
      { method: 'keyword_match', median_score: 0.55, session_count: 170 },
    ],
    pattern_rates: Array.from({ length: 10 }, (_, i) => ({
      pattern_id: `pat-${String(i + 1).padStart(4, '0')}`,
      avg_utilization: 0.9 - i * 0.06,
      session_count: 200 - i * 15,
    })),
    low_utilization_sessions: Array.from({ length: 5 }, (_, i) => ({
      session_id: `sess-low-${i + 1}`,
      utilization_score: 0.05 + i * 0.03,
      agent_name: ['api-architect', 'code-reviewer', 'test-runner'][i % 3],
      detection_method: 'heuristic',
      created_at: new Date(Date.now() - i * 3600000).toISOString(),
    })),
  };
}

export function getMockABComparison(): ABComparison {
  return {
    cohorts: [
      {
        cohort: 'treatment',
        session_count: 843,
        median_utilization_pct: 65.2,
        avg_accuracy_pct: 78.4,
        success_rate_pct: 87.3,
        avg_latency_ms: 312,
      },
      {
        cohort: 'control',
        session_count: 404,
        median_utilization_pct: 0,
        avg_accuracy_pct: 0,
        success_rate_pct: 81.6,
        avg_latency_ms: 195,
      },
    ],
    total_sessions: 1247,
  };
}

export function getMockEffectivenessTrend(): EffectivenessTrendPoint[] {
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    // Slight upward drift over the 14 days to look realistic
    const drift = i * 0.003;
    return {
      date: d.toISOString().slice(0, 10),
      injection_rate: 0.75 + drift + (Math.random() - 0.5) * 0.06,
      avg_utilization: 0.55 + drift + (Math.random() - 0.5) * 0.08,
      avg_accuracy: 0.72 + drift + (Math.random() - 0.5) * 0.06,
      avg_latency_delta_ms: 110 + (Math.random() - 0.5) * 40 - i * 1.5,
    };
  });
}
