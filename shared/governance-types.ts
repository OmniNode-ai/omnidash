/**
 * Governance Dashboard types (OMN-5291)
 *
 * Shared Zod schemas and TypeScript types for governance events projected
 * from the three onex-change-control topics:
 *
 *   onex.evt.onex-change-control.governance-check-completed.v1  → governance_checks
 *   onex.evt.onex-change-control.drift-detected.v1             → governance_drifts
 *   onex.evt.onex-change-control.cosmetic-compliance-scored.v1 → governance_cosmetic_scores
 */

import { z } from 'zod';

// ============================================================================
// governance_checks row
// ============================================================================

export const governanceCheckRowSchema = z.object({
  id: z.string(),
  check_type: z.string(),
  target: z.string(),
  passed: z.boolean(),
  violation_count: z.number(),
  details: z.unknown().nullable(),
  created_at: z.string(),
});

export type GovernanceCheckRow = z.infer<typeof governanceCheckRowSchema>;

// ============================================================================
// governance_drifts row
// ============================================================================

export const governanceDriftRowSchema = z.object({
  id: z.string(),
  ticket_id: z.string(),
  drift_kind: z.string(),
  description: z.string(),
  severity: z.string(),
  created_at: z.string(),
});

export type GovernanceDriftRow = z.infer<typeof governanceDriftRowSchema>;

// ============================================================================
// governance_cosmetic_scores row
// ============================================================================

export const governanceCosmeticRowSchema = z.object({
  id: z.string(),
  target: z.string(),
  score: z.number(),
  total_checks: z.number(),
  passed_checks: z.number(),
  failed_checks: z.number(),
  created_at: z.string(),
});

export type GovernanceCosmeticRow = z.infer<typeof governanceCosmeticRowSchema>;

// ============================================================================
// Summary
// ============================================================================

export const governanceSummarySchema = z.object({
  total_checks_7d: z.number(),
  passed_checks_7d: z.number(),
  failed_checks_7d: z.number(),
  drift_events_7d: z.number(),
  avg_cosmetic_score: z.number(),
});

export type GovernanceSummary = z.infer<typeof governanceSummarySchema>;

// ============================================================================
// Payload (full snapshot)
// ============================================================================

export const governancePayloadSchema = z.object({
  summary: governanceSummarySchema,
  recent_checks: z.array(governanceCheckRowSchema),
  recent_drifts: z.array(governanceDriftRowSchema),
  recent_cosmetic: z.array(governanceCosmeticRowSchema),
});

export type GovernancePayload = z.infer<typeof governancePayloadSchema>;
