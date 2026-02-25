// SPDX-License-Identifier: MIT
/**
 * Objective Mock Data Tests (OMN-2583)
 *
 * Unit tests for the objective evaluation mock data generators.
 * Validates data shape, dimension coverage, and anti-scalar invariants.
 */

import { describe, it, expect } from 'vitest';
import {
  getMockScoreVectorSummary,
  getMockGateFailureTimeline,
  getMockPolicyStateHistory,
  getMockAntiGamingAlerts,
} from '@/lib/mock-data/objective-mock';
import type { ObjectiveTimeWindow } from '@shared/objective-types';

const WINDOWS: ObjectiveTimeWindow[] = ['24h', '7d', '30d'];
const SCORE_KEYS = ['correctness', 'safety', 'cost', 'latency', 'maintainability', 'human_time'];

describe('getMockScoreVectorSummary', () => {
  it.each(WINDOWS)('returns non-empty points for window %s', (window) => {
    const data = getMockScoreVectorSummary(window);
    expect(data.points.length).toBeGreaterThan(0);
  });

  it('returns all six score dimensions on each point', () => {
    const data = getMockScoreVectorSummary('7d');
    data.points.forEach((p) => {
      SCORE_KEYS.forEach((key) => {
        expect(p.scores).toHaveProperty(key);
        expect(typeof p.scores[key as keyof typeof p.scores]).toBe('number');
      });
    });
  });

  it('never collapses dimensions to a scalar — each dimension preserved independently', () => {
    const data = getMockScoreVectorSummary('7d');
    data.points.forEach((p) => {
      // All six dimensions must be distinct objects, not a single sum
      expect(Object.keys(p.scores)).toHaveLength(6);
    });
  });

  it('score values are clamped between 0 and 1', () => {
    const data = getMockScoreVectorSummary('7d');
    data.points.forEach((p) => {
      SCORE_KEYS.forEach((key) => {
        const val = p.scores[key as keyof typeof p.scores];
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      });
    });
  });

  it('correctness and safety are always present in each point (highest priority dimensions)', () => {
    const data = getMockScoreVectorSummary('7d');
    data.points.forEach((p) => {
      expect(p.scores.correctness).toBeDefined();
      expect(p.scores.safety).toBeDefined();
    });
  });

  it('returns aggregates with sample_count > 0', () => {
    const data = getMockScoreVectorSummary('7d');
    expect(data.aggregates.length).toBeGreaterThan(0);
    data.aggregates.forEach((agg) => {
      expect(agg.sample_count).toBeGreaterThan(0);
    });
  });

  it('returns non-empty sessions, agents, task_classes lists', () => {
    const data = getMockScoreVectorSummary('7d');
    expect(data.sessions.length).toBeGreaterThan(0);
    expect(data.agents.length).toBeGreaterThan(0);
    expect(data.task_classes.length).toBeGreaterThan(0);
  });
});

describe('getMockGateFailureTimeline', () => {
  it.each(WINDOWS)('returns events for window %s', (window) => {
    const data = getMockGateFailureTimeline(window);
    expect(data.events.length).toBeGreaterThan(0);
  });

  it('returns correct total_failures count', () => {
    const data = getMockGateFailureTimeline('7d');
    expect(data.total_failures).toBe(data.events.length);
  });

  it('bins are non-empty arrays', () => {
    const data = getMockGateFailureTimeline('7d');
    expect(data.bins.length).toBeGreaterThan(0);
  });

  it('24h window produces 24 bins', () => {
    const data = getMockGateFailureTimeline('24h');
    expect(data.bins.length).toBe(24);
  });

  it('events have all required fields', () => {
    const data = getMockGateFailureTimeline('7d');
    data.events.forEach((e) => {
      expect(e.occurred_at).toBeTruthy();
      expect(e.gate_type).toBeTruthy();
      expect(e.session_id).toBeTruthy();
      expect(e.evaluation_id).toBeTruthy();
      expect(Array.isArray(e.attribution_refs)).toBe(true);
      expect(typeof e.score_value).toBe('number');
      expect(typeof e.threshold).toBe('number');
    });
  });

  it('score values are below threshold for all failures', () => {
    const data = getMockGateFailureTimeline('7d');
    data.events.forEach((e) => {
      // Gate failures should have score below threshold
      expect(e.score_value).toBeLessThan(e.threshold);
    });
  });

  it('totals_by_gate_type sums match total_failures', () => {
    const data = getMockGateFailureTimeline('7d');
    const total = Object.values(data.totals_by_gate_type).reduce((s, v) => s + (v ?? 0), 0);
    expect(total).toBe(data.total_failures);
  });
});

describe('getMockPolicyStateHistory', () => {
  it.each(WINDOWS)('returns non-empty points for window %s', (window) => {
    const data = getMockPolicyStateHistory(window);
    expect(data.points.length).toBeGreaterThan(0);
  });

  it('reliability and confidence values are clamped 0–1', () => {
    const data = getMockPolicyStateHistory('7d');
    data.points.forEach((p) => {
      expect(p.reliability_0_1).toBeGreaterThanOrEqual(0);
      expect(p.reliability_0_1).toBeLessThanOrEqual(1);
      expect(p.confidence_0_1).toBeGreaterThanOrEqual(0);
      expect(p.confidence_0_1).toBeLessThanOrEqual(1);
    });
  });

  it('lifecycle states are valid enum values', () => {
    const validStates = new Set(['candidate', 'validated', 'promoted', 'deprecated']);
    const data = getMockPolicyStateHistory('7d');
    data.points.forEach((p) => {
      expect(validStates.has(p.lifecycle_state)).toBe(true);
    });
  });

  it('current_states has one entry per unique policy_id', () => {
    const data = getMockPolicyStateHistory('7d');
    const ids = new Set(data.current_states.map((s) => s.policy_id));
    expect(ids.size).toBe(data.current_states.length);
  });

  it('auto-blacklist events are marked in at least one policy', () => {
    const data = getMockPolicyStateHistory('7d');
    const hasBlacklist = data.points.some((p) => p.is_auto_blacklist);
    expect(hasBlacklist).toBe(true);
  });

  it('tool_degraded events are marked in at least one point', () => {
    const data = getMockPolicyStateHistory('7d');
    const hasDegraded = data.points.some((p) => p.has_tool_degraded_alert);
    expect(hasDegraded).toBe(true);
  });
});

describe('getMockAntiGamingAlerts', () => {
  it.each(WINDOWS)('returns alerts for window %s', (window) => {
    const data = getMockAntiGamingAlerts(window);
    expect(data.alerts.length).toBeGreaterThan(0);
  });

  it('total_unacknowledged matches filtered count', () => {
    const data = getMockAntiGamingAlerts('7d');
    const actual = data.alerts.filter((a) => !a.acknowledged).length;
    expect(data.total_unacknowledged).toBe(actual);
  });

  it('all alert types are valid enum values', () => {
    const validTypes = new Set(['goodhart_violation', 'reward_hacking', 'distributional_shift']);
    const data = getMockAntiGamingAlerts('7d');
    data.alerts.forEach((a) => {
      expect(validTypes.has(a.alert_type)).toBe(true);
    });
  });

  it('alerts have metric_name and proxy_metric populated', () => {
    const data = getMockAntiGamingAlerts('7d');
    data.alerts.forEach((a) => {
      expect(a.metric_name).toBeTruthy();
      expect(a.proxy_metric).toBeTruthy();
    });
  });

  it('delta is a non-zero number on all alerts', () => {
    const data = getMockAntiGamingAlerts('7d');
    data.alerts.forEach((a) => {
      expect(typeof a.delta).toBe('number');
      expect(a.delta).not.toBe(0);
    });
  });

  it('acknowledged alerts have acknowledged_at populated', () => {
    const data = getMockAntiGamingAlerts('7d');
    data.alerts
      .filter((a) => a.acknowledged)
      .forEach((a) => {
        expect(a.acknowledged_at).toBeTruthy();
      });
  });
});
