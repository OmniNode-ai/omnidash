/**
 * Cross-Repo Validation Event Types
 *
 * TypeScript interfaces for cross-repo validation events consumed from Kafka.
 * Used by the Validation Dashboard to display run history, violations, and trends.
 *
 * @see OMN-1907 - Cross-Repo Validation Dashboard Integration
 * @see OMN-1776 - Phase 2 event contracts (upstream)
 */

import { z } from 'zod';
import {
  resolveTopicName,
  SUFFIX_VALIDATION_RUN_STARTED,
  SUFFIX_VALIDATION_VIOLATIONS_BATCH,
  SUFFIX_VALIDATION_RUN_COMPLETED,
} from './topics';

// ============================================================================
// Topic Constants (resolved at runtime from canonical ONEX suffixes)
//
// Corrected format: onex.evt.validation.<event-name>.v1
// (was: onex.validation.cross_repo.<event>.v1 — non-canonical)
//
// Migration note: upstream producer (omnibase_infra topic_resolver.py) was updated
// to the canonical format in the same changeset. See platform_topic_suffixes.py
// for the matching suffixes. No dual-subscription is needed because omnidash and
// omnibase_infra are deployed together — deploy the upstream producer first (or
// simultaneously) so the new topic names are active before omnidash subscribes.
// ============================================================================

/** Kafka topic for validation run started events */
export const VALIDATION_RUN_STARTED_TOPIC = resolveTopicName(SUFFIX_VALIDATION_RUN_STARTED);

/** Kafka topic for validation violations batch events */
export const VALIDATION_VIOLATIONS_BATCH_TOPIC = resolveTopicName(
  SUFFIX_VALIDATION_VIOLATIONS_BATCH
);

/** Kafka topic for validation run completed events */
export const VALIDATION_RUN_COMPLETED_TOPIC = resolveTopicName(SUFFIX_VALIDATION_RUN_COMPLETED);

/** WebSocket channel for validation events */
export const WS_CHANNEL_VALIDATION = 'validation';

// ============================================================================
// Violation Severity
// ============================================================================

/** Allowed violation severity levels, ordered from most to least severe. */
export const VIOLATION_SEVERITIES = ['error', 'warning', 'info'] as const;

/** Union type of valid violation severity strings. */
export type ViolationSeverity = (typeof VIOLATION_SEVERITIES)[number];

// ============================================================================
// Zod Schemas
// ============================================================================

/** Zod schema for the ValidationRunStarted Kafka event. */
export const ValidationRunStartedSchema = z.object({
  event_type: z.literal('ValidationRunStarted'),
  run_id: z.string(),
  repos: z.array(z.string()),
  validators: z.array(z.string()),
  triggered_by: z.string().optional(),
  timestamp: z.string().datetime(),
});

/** Zod schema for a single validation violation entry. */
export const ViolationSchema = z.object({
  rule_id: z.string(),
  severity: z.enum(VIOLATION_SEVERITIES),
  message: z.string(),
  repo: z.string(),
  file_path: z.string().optional(),
  line: z.number().optional(),
  validator: z.string(),
});

/** Zod schema for the ValidationViolationsBatch Kafka event. */
export const ValidationViolationsBatchSchema = z.object({
  event_type: z.literal('ValidationViolationsBatch'),
  run_id: z.string(),
  violations: z.array(ViolationSchema),
  batch_index: z.number(),
  timestamp: z.string().datetime(),
});

/** Zod schema for the ValidationRunCompleted Kafka event. */
export const ValidationRunCompletedSchema = z.object({
  event_type: z.literal('ValidationRunCompleted'),
  run_id: z.string(),
  status: z.enum(['passed', 'failed', 'error']),
  total_violations: z.number(),
  violations_by_severity: z.record(z.number()).optional(),
  duration_ms: z.number(),
  timestamp: z.string().datetime(),
});

// ============================================================================
// TypeScript Interfaces
// ============================================================================

export type ValidationRunStartedEvent = z.infer<typeof ValidationRunStartedSchema>;
export type Violation = z.infer<typeof ViolationSchema>;
export type ValidationViolationsBatchEvent = z.infer<typeof ValidationViolationsBatchSchema>;
export type ValidationRunCompletedEvent = z.infer<typeof ValidationRunCompletedSchema>;

/**
 * Reconstructed validation run aggregated from Kafka events.
 *
 * @property run_id - Unique identifier for the validation run
 * @property repos - List of repositories included in the run
 * @property validators - List of validator names that were executed
 * @property triggered_by - User or system that initiated the run
 * @property status - Current run status: running, passed, failed, or error
 * @property started_at - ISO-8601 timestamp when the run started
 * @property completed_at - ISO-8601 timestamp when the run finished
 * @property duration_ms - Total run duration in milliseconds
 * @property total_violations - Aggregate count of all violations found
 * @property violations_by_severity - Violation counts keyed by severity level
 * @property violations - Full list of individual violation records
 */
export interface ValidationRun {
  run_id: string;
  repos: string[];
  validators: string[];
  triggered_by?: string;
  status: 'running' | 'passed' | 'failed' | 'error';
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  total_violations: number;
  violations_by_severity: Record<string, number>;
  violations: Violation[];
}

/**
 * Per-repo violation trend data point for a single date.
 *
 * @property date - ISO-8601 date string for this data point
 * @property errors - Number of error-severity violations on this date
 * @property warnings - Number of warning-severity violations on this date
 * @property infos - Number of info-severity violations on this date
 * @property total - Sum of all violations across severities
 */
export interface RepoTrendPoint {
  date: string;
  errors: number;
  warnings: number;
  infos: number;
  total: number;
}

/**
 * Per-repo violation trends over time.
 *
 * @property repo - Repository name this trend data belongs to
 * @property trend - Ordered list of trend data points by date
 * @property latest_run_id - Run ID of the most recent validation run for this repo
 */
export interface RepoTrends {
  repo: string;
  trend: RepoTrendPoint[];
  latest_run_id?: string;
}

// ============================================================================
// Type Guards
// ============================================================================

/** Type guard that checks whether an unknown value is a valid ValidationRunStarted event. */
export function isValidationRunStarted(event: unknown): event is ValidationRunStartedEvent {
  return ValidationRunStartedSchema.safeParse(event).success;
}

/** Type guard that checks whether an unknown value is a valid ValidationViolationsBatch event. */
export function isValidationViolationsBatch(
  event: unknown
): event is ValidationViolationsBatchEvent {
  return ValidationViolationsBatchSchema.safeParse(event).success;
}

/** Type guard that checks whether an unknown value is a valid ValidationRunCompleted event. */
export function isValidationRunCompleted(event: unknown): event is ValidationRunCompletedEvent {
  return ValidationRunCompletedSchema.safeParse(event).success;
}
