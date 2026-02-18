/**
 * Mock Data: Pattern Enforcement (OMN-2275)
 *
 * Realistic demo data for the enforcement dashboard.
 * Used when the database is unavailable or returns empty results.
 */

import type {
  EnforcementSummary,
  EnforcementByLanguage,
  EnforcementByDomain,
  ViolatedPattern,
  EnforcementTrendPoint,
  EnforcementTimeWindow,
} from '@shared/enforcement-types';

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

const CORRECTION_RATE_TREND_7D = Array.from({ length: 7 }, (_, i) => ({
  date: isoDate(6 - i),
  value: 0.62 + i * 0.03 + Math.sin(i * 0.9) * 0.04,
}));

const CORRECTION_RATE_TREND_30D = Array.from({ length: 30 }, (_, i) => ({
  date: isoDate(29 - i),
  value: 0.48 + i * 0.008 + Math.sin(i * 0.5) * 0.06,
}));

const CORRECTION_RATE_TREND_24H = Array.from({ length: 24 }, (_, i) => ({
  date: isoTs(0, 23 - i),
  value: 0.71 + Math.sin(i * 0.7) * 0.05,
}));

export function getMockEnforcementSummary(window: EnforcementTimeWindow): EnforcementSummary {
  const windowMultiplier = window === '24h' ? 1 : window === '7d' ? 7 : 30;
  const base = 340 * windowMultiplier;

  const hits = Math.round(base * 0.64);
  const violations = Math.round(base * 0.19);
  const corrected = Math.round(base * 0.12);
  const false_positives = Math.round(base * 0.05);
  const total = hits + violations + corrected + false_positives;

  return {
    total_evaluations: total,
    hit_rate: hits / total,
    correction_rate: corrected / Math.max(1, violations + corrected),
    false_positive_rate: false_positives / total,
    violated_pattern_count: 14,
    counts: {
      hits,
      violations,
      corrected,
      false_positives,
    },
    correction_rate_trend:
      window === '24h'
        ? CORRECTION_RATE_TREND_24H
        : window === '7d'
          ? CORRECTION_RATE_TREND_7D
          : CORRECTION_RATE_TREND_30D,
  };
}

// ============================================================================
// By Language
// ============================================================================

export function getMockEnforcementByLanguage(
  _window: EnforcementTimeWindow
): EnforcementByLanguage[] {
  return [
    {
      language: 'Python',
      evaluations: 1240,
      hits: 892,
      violations: 201,
      corrected: 110,
      false_positives: 37,
      hit_rate: 0.719,
    },
    {
      language: 'TypeScript',
      evaluations: 980,
      hits: 641,
      violations: 178,
      corrected: 121,
      false_positives: 40,
      hit_rate: 0.654,
    },
    {
      language: 'JavaScript',
      evaluations: 540,
      hits: 329,
      violations: 118,
      corrected: 72,
      false_positives: 21,
      hit_rate: 0.609,
    },
    {
      language: 'Go',
      evaluations: 320,
      hits: 218,
      violations: 62,
      corrected: 32,
      false_positives: 8,
      hit_rate: 0.681,
    },
    {
      language: 'Rust',
      evaluations: 180,
      hits: 130,
      violations: 30,
      corrected: 16,
      false_positives: 4,
      hit_rate: 0.722,
    },
    {
      language: 'SQL',
      evaluations: 140,
      hits: 82,
      violations: 36,
      corrected: 17,
      false_positives: 5,
      hit_rate: 0.586,
    },
  ];
}

// ============================================================================
// By Domain
// ============================================================================

export function getMockEnforcementByDomain(_window: EnforcementTimeWindow): EnforcementByDomain[] {
  return [
    {
      domain: 'error-handling',
      evaluations: 720,
      hits: 504,
      violations: 126,
      corrected: 72,
      false_positives: 18,
      hit_rate: 0.7,
    },
    {
      domain: 'validation',
      evaluations: 610,
      hits: 390,
      violations: 130,
      corrected: 74,
      false_positives: 16,
      hit_rate: 0.639,
    },
    {
      domain: 'api-design',
      evaluations: 490,
      hits: 338,
      violations: 87,
      corrected: 52,
      false_positives: 13,
      hit_rate: 0.69,
    },
    {
      domain: 'logging',
      evaluations: 380,
      hits: 250,
      violations: 82,
      corrected: 36,
      false_positives: 12,
      hit_rate: 0.658,
    },
    {
      domain: 'authentication',
      evaluations: 290,
      hits: 204,
      violations: 53,
      corrected: 28,
      false_positives: 5,
      hit_rate: 0.703,
    },
    {
      domain: 'data-access',
      evaluations: 260,
      hits: 156,
      violations: 62,
      corrected: 30,
      false_positives: 12,
      hit_rate: 0.6,
    },
    {
      domain: 'configuration',
      evaluations: 210,
      hits: 128,
      violations: 52,
      corrected: 24,
      false_positives: 6,
      hit_rate: 0.61,
    },
    {
      domain: 'testing',
      evaluations: 180,
      hits: 122,
      violations: 34,
      corrected: 20,
      false_positives: 4,
      hit_rate: 0.678,
    },
  ];
}

// ============================================================================
// Violated Patterns
// ============================================================================

export function getMockViolatedPatterns(_window: EnforcementTimeWindow): ViolatedPattern[] {
  return [
    {
      pattern_name: 'explicit-error-typing',
      violation_count: 87,
      corrected_count: 62,
      correction_rate: 0.713,
      last_violation_at: isoTs(0, 2),
      language: 'Python',
      domain: 'error-handling',
    },
    {
      pattern_name: 'pydantic-v2-field-validators',
      violation_count: 72,
      corrected_count: 45,
      correction_rate: 0.625,
      last_violation_at: isoTs(0, 4),
      language: 'Python',
      domain: 'validation',
    },
    {
      pattern_name: 'strict-null-checks-ts',
      violation_count: 65,
      corrected_count: 51,
      correction_rate: 0.785,
      last_violation_at: isoTs(1, 0),
      language: 'TypeScript',
      domain: 'validation',
    },
    {
      pattern_name: 'structured-logging-context',
      violation_count: 58,
      corrected_count: 34,
      correction_rate: 0.586,
      last_violation_at: isoTs(0, 6),
      language: 'Python',
      domain: 'logging',
    },
    {
      pattern_name: 'async-context-propagation',
      violation_count: 49,
      corrected_count: 38,
      correction_rate: 0.776,
      last_violation_at: isoTs(1, 3),
      language: 'TypeScript',
      domain: 'api-design',
    },
    {
      pattern_name: 'drizzle-select-columns',
      violation_count: 41,
      corrected_count: 22,
      correction_rate: 0.537,
      last_violation_at: isoTs(2, 0),
      language: 'TypeScript',
      domain: 'data-access',
    },
    {
      pattern_name: 'go-error-wrapping',
      violation_count: 38,
      corrected_count: 28,
      correction_rate: 0.737,
      last_violation_at: isoTs(1, 8),
      language: 'Go',
      domain: 'error-handling',
    },
    {
      pattern_name: 'zod-schema-first',
      violation_count: 34,
      corrected_count: 20,
      correction_rate: 0.588,
      last_violation_at: isoTs(2, 5),
      language: 'TypeScript',
      domain: 'validation',
    },
    {
      pattern_name: 'jwt-expiry-check',
      violation_count: 28,
      corrected_count: 22,
      correction_rate: 0.786,
      last_violation_at: isoTs(3, 2),
      language: 'TypeScript',
      domain: 'authentication',
    },
    {
      pattern_name: 'sql-parameterized-query',
      violation_count: 24,
      corrected_count: 12,
      correction_rate: 0.5,
      last_violation_at: isoTs(3, 10),
      language: 'SQL',
      domain: 'data-access',
    },
  ];
}

// ============================================================================
// Trend
// ============================================================================

export function getMockEnforcementTrend(window: EnforcementTimeWindow): EnforcementTrendPoint[] {
  if (window === '24h') {
    return Array.from({ length: 24 }, (_, i) => ({
      date: isoTs(0, 23 - i),
      hit_rate: 0.62 + Math.sin(i * 0.5) * 0.06,
      correction_rate: 0.68 + Math.sin(i * 0.4) * 0.07,
      false_positive_rate: 0.05 + Math.sin(i * 0.3) * 0.015,
      total_evaluations: 280 + Math.round(Math.sin(i * 0.6) * 40),
    }));
  }

  const days = window === '7d' ? 7 : 30;
  return Array.from({ length: days }, (_, i) => ({
    date: isoDate(days - 1 - i),
    hit_rate: 0.58 + (i / days) * 0.1 + Math.sin(i * 0.8) * 0.04,
    correction_rate: 0.52 + (i / days) * 0.2 + Math.sin(i * 0.6) * 0.05,
    false_positive_rate: 0.07 - (i / days) * 0.02 + Math.sin(i * 0.4) * 0.01,
    total_evaluations: 320 + Math.round((i / days) * 80) + Math.round(Math.sin(i) * 30),
  }));
}
