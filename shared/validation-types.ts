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

// ============================================================================
// Topic Constants (ONEX canonical naming)
// ============================================================================

/** Kafka topic for validation run started events */
export const VALIDATION_RUN_STARTED_TOPIC = 'onex.validation.cross_repo.run.started.v1';

/** Kafka topic for validation violations batch events */
export const VALIDATION_VIOLATIONS_BATCH_TOPIC = 'onex.validation.cross_repo.violations.batch.v1';

/** Kafka topic for validation run completed events */
export const VALIDATION_RUN_COMPLETED_TOPIC = 'onex.validation.cross_repo.run.completed.v1';

/** WebSocket channel for validation events */
export const WS_CHANNEL_VALIDATION = 'validation';

// ============================================================================
// Violation Severity
// ============================================================================

export const VIOLATION_SEVERITIES = ['error', 'warning', 'info'] as const;
export type ViolationSeverity = (typeof VIOLATION_SEVERITIES)[number];

// ============================================================================
// Zod Schemas
// ============================================================================

export const ValidationRunStartedSchema = z.object({
  event_type: z.literal('ValidationRunStarted'),
  run_id: z.string(),
  repos: z.array(z.string()),
  validators: z.array(z.string()),
  triggered_by: z.string().optional(),
  timestamp: z.string(),
});

export const ViolationSchema = z.object({
  rule_id: z.string(),
  severity: z.enum(VIOLATION_SEVERITIES),
  message: z.string(),
  repo: z.string(),
  file_path: z.string().optional(),
  line: z.number().optional(),
  validator: z.string(),
});

export const ValidationViolationsBatchSchema = z.object({
  event_type: z.literal('ValidationViolationsBatch'),
  run_id: z.string(),
  violations: z.array(ViolationSchema),
  batch_index: z.number(),
  timestamp: z.string(),
});

export const ValidationRunCompletedSchema = z.object({
  event_type: z.literal('ValidationRunCompleted'),
  run_id: z.string(),
  status: z.enum(['passed', 'failed', 'error']),
  total_violations: z.number(),
  violations_by_severity: z.record(z.number()).optional(),
  duration_ms: z.number(),
  timestamp: z.string(),
});

// ============================================================================
// TypeScript Interfaces
// ============================================================================

export type ValidationRunStartedEvent = z.infer<typeof ValidationRunStartedSchema>;
export type Violation = z.infer<typeof ViolationSchema>;
export type ValidationViolationsBatchEvent = z.infer<typeof ValidationViolationsBatchSchema>;
export type ValidationRunCompletedEvent = z.infer<typeof ValidationRunCompletedSchema>;

/** Reconstructed validation run from events */
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

/** Per-repo violation trend data point */
export interface RepoTrendPoint {
  date: string;
  errors: number;
  warnings: number;
  infos: number;
  total: number;
}

/** Per-repo violation trends */
export interface RepoTrends {
  repo: string;
  trend: RepoTrendPoint[];
  latest_run_id?: string;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isValidationRunStarted(event: unknown): event is ValidationRunStartedEvent {
  return ValidationRunStartedSchema.safeParse(event).success;
}

export function isValidationViolationsBatch(
  event: unknown
): event is ValidationViolationsBatchEvent {
  return ValidationViolationsBatchSchema.safeParse(event).success;
}

export function isValidationRunCompleted(event: unknown): event is ValidationRunCompletedEvent {
  return ValidationRunCompletedSchema.safeParse(event).success;
}
