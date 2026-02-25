/**
 * OmniClaude State Event Drizzle Schemas (OMN-2602)
 *
 * Defines Drizzle pgTable objects for the 5 Wave 2 read-model tables created by
 * read-model-consumer.ts when it projects omniclaude state-change events.
 *
 * These schemas are the single source of truth for:
 *   - TypeScript row types (via Drizzle's InferSelectModel)
 *   - Zod validation schemas (via drizzle-zod createSelectSchema)
 *
 * Tables are populated by read-model-consumer.ts; Drizzle is used here for
 * type inference and validation only (queries use raw sql`` for flexibility).
 *
 * Source Kafka topics:
 *   onex.evt.omniclaude.gate-decision.v1          → gateDecisions (gate_decisions)
 *   onex.evt.omniclaude.epic-run-updated.v1        → epicRunEvents (epic_run_events)
 *                                                  → epicRunLease  (epic_run_lease)
 *   onex.evt.omniclaude.pr-watch-updated.v1        → prWatchState  (pr_watch_state)
 *   onex.evt.omniclaude.budget-cap-hit.v1          → pipelineBudgetState (pipeline_budget_state)
 *   onex.evt.omniclaude.circuit-breaker-tripped.v1 → debugEscalationCounts (debug_escalation_counts)
 */

import { pgTable, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core';
import type { InferSelectModel } from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

// ============================================================================
// Gate Decisions
// ============================================================================

export const gateDecisions = pgTable('gate_decisions', {
  correlation_id: text('correlation_id').primaryKey(),
  pr_number: integer('pr_number'),
  repo: text('repo'),
  gate_name: text('gate_name').notNull(),
  outcome: text('outcome').notNull(),
  blocking: boolean('blocking').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull(),
});

export const gateDecisionRowSchema = createSelectSchema(gateDecisions, {
  // created_at is returned as text from the SQL query (::text cast)
  created_at: z.coerce.string(),
});
export type GateDecisionRow = Omit<InferSelectModel<typeof gateDecisions>, 'created_at'> & {
  created_at: string;
};

export const gateDecisionSummarySchema = z.object({
  total: z.number(),
  passed: z.number(),
  failed: z.number(),
  blocked: z.number(),
  pass_rate: z.number(),
});
export type GateDecisionSummary = z.infer<typeof gateDecisionSummarySchema>;

export const gateDecisionsPayloadSchema = z.object({
  recent: z.array(gateDecisionRowSchema),
  summary: gateDecisionSummarySchema,
});
export type GateDecisionsPayload = z.infer<typeof gateDecisionsPayloadSchema>;

// ============================================================================
// Epic Run Events
// ============================================================================

export const epicRunEvents = pgTable('epic_run_events', {
  correlation_id: text('correlation_id').primaryKey(),
  epic_run_id: text('epic_run_id').notNull(),
  event_type: text('event_type').notNull(),
  ticket_id: text('ticket_id'),
  repo: text('repo'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull(),
});

export const epicRunLease = pgTable('epic_run_lease', {
  epic_run_id: text('epic_run_id').primaryKey(),
  lease_holder: text('lease_holder').notNull(),
  lease_expires_at: timestamp('lease_expires_at', { withTimezone: true }),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull(),
});

export const epicRunEventRowSchema = createSelectSchema(epicRunEvents, {
  created_at: z.coerce.string(),
});
export type EpicRunEventRow = Omit<InferSelectModel<typeof epicRunEvents>, 'created_at'> & {
  created_at: string;
};

export const epicRunLeaseRowSchema = createSelectSchema(epicRunLease, {
  lease_expires_at: z.coerce.string().nullable(),
  updated_at: z.coerce.string(),
});
export type EpicRunLeaseRow = Omit<
  InferSelectModel<typeof epicRunLease>,
  'lease_expires_at' | 'updated_at'
> & {
  lease_expires_at: string | null;
  updated_at: string;
};

export const epicRunSummarySchema = z.object({
  active_runs: z.number(),
  total_events: z.number(),
  recent_event_types: z.array(z.string()),
});
export type EpicRunSummary = z.infer<typeof epicRunSummarySchema>;

export const epicRunPayloadSchema = z.object({
  events: z.array(epicRunEventRowSchema),
  leases: z.array(epicRunLeaseRowSchema),
  summary: epicRunSummarySchema,
});
export type EpicRunPayload = z.infer<typeof epicRunPayloadSchema>;

// ============================================================================
// PR Watch State
// ============================================================================

export const prWatchState = pgTable('pr_watch_state', {
  correlation_id: text('correlation_id').primaryKey(),
  pr_number: integer('pr_number'),
  repo: text('repo'),
  state: text('state').notNull(),
  checks_status: text('checks_status'),
  review_status: text('review_status'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull(),
});

export const prWatchRowSchema = createSelectSchema(prWatchState, {
  created_at: z.coerce.string(),
});
export type PrWatchRow = Omit<InferSelectModel<typeof prWatchState>, 'created_at'> & {
  created_at: string;
};

export const prWatchSummarySchema = z.object({
  total: z.number(),
  open: z.number(),
  merged: z.number(),
  closed: z.number(),
  checks_passing: z.number(),
});
export type PrWatchSummary = z.infer<typeof prWatchSummarySchema>;

export const prWatchPayloadSchema = z.object({
  recent: z.array(prWatchRowSchema),
  summary: prWatchSummarySchema,
});
export type PrWatchPayload = z.infer<typeof prWatchPayloadSchema>;

// ============================================================================
// Pipeline Budget State
// ============================================================================

export const pipelineBudgetState = pgTable('pipeline_budget_state', {
  correlation_id: text('correlation_id').primaryKey(),
  pipeline_id: text('pipeline_id').notNull(),
  budget_type: text('budget_type').notNull(),
  cap_value: integer('cap_value'),
  current_value: integer('current_value'),
  cap_hit: boolean('cap_hit').notNull(),
  repo: text('repo'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull(),
});

export const pipelineBudgetRowSchema = createSelectSchema(pipelineBudgetState, {
  created_at: z.coerce.string(),
});
export type PipelineBudgetRow = Omit<InferSelectModel<typeof pipelineBudgetState>, 'created_at'> & {
  created_at: string;
};

export const pipelineBudgetSummarySchema = z.object({
  total_cap_hits: z.number(),
  affected_pipelines: z.number(),
  token_cap_hits: z.number(),
  cost_cap_hits: z.number(),
});
export type PipelineBudgetSummary = z.infer<typeof pipelineBudgetSummarySchema>;

export const pipelineBudgetPayloadSchema = z.object({
  recent: z.array(pipelineBudgetRowSchema),
  summary: pipelineBudgetSummarySchema,
});
export type PipelineBudgetPayload = z.infer<typeof pipelineBudgetPayloadSchema>;

// ============================================================================
// Debug Escalation Counts
// ============================================================================

export const debugEscalationCounts = pgTable('debug_escalation_counts', {
  correlation_id: text('correlation_id').primaryKey(),
  session_id: text('session_id'),
  agent_name: text('agent_name').notNull(),
  escalation_count: integer('escalation_count').notNull(),
  tripped: boolean('tripped').notNull(),
  repo: text('repo'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull(),
});

export const debugEscalationRowSchema = createSelectSchema(debugEscalationCounts, {
  created_at: z.coerce.string(),
});
export type DebugEscalationRow = Omit<
  InferSelectModel<typeof debugEscalationCounts>,
  'created_at'
> & {
  created_at: string;
};

export const debugEscalationSummarySchema = z.object({
  total_trips: z.number(),
  affected_agents: z.number(),
  affected_sessions: z.number(),
  top_agent: z.string().nullable(),
});
export type DebugEscalationSummary = z.infer<typeof debugEscalationSummarySchema>;

export const debugEscalationPayloadSchema = z.object({
  recent: z.array(debugEscalationRowSchema),
  summary: debugEscalationSummarySchema,
});
export type DebugEscalationPayload = z.infer<typeof debugEscalationPayloadSchema>;
