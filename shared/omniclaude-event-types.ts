/**
 * OmniClaude Kafka Event Payload Types (OMN-4298)
 *
 * Canonical TypeScript interfaces for omniclaude Pydantic event models.
 * These types match the JSON Schema produced by scripts/export-event-schemas.py
 * and are verified on every PR by the schema-parity CI job.
 *
 * Source Kafka topics and corresponding Pydantic models:
 *
 *   onex.evt.omniclaude.epic-run-updated.v1        → ModelEpicRunUpdatedEvent
 *   onex.evt.omniclaude.pr-watch-updated.v1        → ModelPrWatchUpdatedEvent
 *   onex.evt.omniclaude.gate-decision.v1           → ModelGateDecisionEvent
 *   onex.evt.omniclaude.budget-cap-hit.v1          → ModelBudgetCapHitEvent
 *   onex.evt.omniclaude.circuit-breaker-tripped.v1 → ModelCircuitBreakerTrippedEvent
 *   onex.evt.omniclaude.skill-started.v1           → ModelSkillStartedEvent
 *   onex.evt.omniclaude.skill-completed.v1         → ModelSkillCompletedEvent
 *
 * IMPORTANT: Keep in sync with omniclaude/src/omniclaude/shared/models/.
 * The schema-parity CI job (omninode_infra/.github/workflows/schema-parity.yml)
 * will fail if required fields are removed or renamed here without updating
 * the corresponding Pydantic model.
 */

// ============================================================================
// Shared
// ============================================================================

/** ISO-8601 datetime string (UTC). */
type IsoDatetime = string;

/** UUID string. */
type UuidString = string;

// ============================================================================
// ModelEpicRunUpdatedEvent
// ============================================================================

export type EpicRunStatus = 'running' | 'completed' | 'failed' | 'partial' | 'cancelled';

/**
 * State update for an in-flight epic run.
 * Emitted at each phase transition by the epic-team orchestrator.
 * Matches ModelEpicRunUpdatedEvent in omniclaude.
 */
export interface OmniclaudeEpicRunUpdatedEvent {
  /** Unique ID for this event. */
  event_id: UuidString;
  /** Epic run identifier -- upsert key for epic_run_lease. */
  run_id: UuidString;
  /** Linear epic identifier (e.g. "OMN-2920"). Required by Pydantic model. */
  epic_id: string;
  /** Current run status. */
  status: EpicRunStatus;
  /** Current pipeline phase name (optional). */
  phase?: string | null;
  /** Total tickets in this epic run. */
  tickets_total?: number;
  /** Number of tickets completed so far. */
  tickets_completed?: number;
  /** Number of tickets that failed. */
  tickets_failed?: number;
  /** End-to-end correlation identifier. */
  correlation_id: UuidString;
  /** UTC timestamp when the event was emitted. */
  emitted_at: IsoDatetime;
  /** Optional Claude Code session identifier. */
  session_id?: string | null;
}

// ============================================================================
// ModelPrWatchUpdatedEvent
// ============================================================================

export type PrWatchStatus = 'watching' | 'approved' | 'capped' | 'timeout' | 'failed';

/**
 * State update for an in-flight pr-watch session.
 * Emitted at each poll cycle or terminal outcome by the pr-watch orchestrator.
 * Matches ModelPrWatchUpdatedEvent in omniclaude.
 */
export interface OmniclaudePrWatchUpdatedEvent {
  /** Unique ID for this event. */
  event_id: UuidString;
  /** PR watch run identifier -- upsert key for pr_watch_state. */
  run_id: UuidString;
  /** GitHub PR number. */
  pr_number: number;
  /** Repository slug (e.g. "OmniNode-ai/omniclaude"). */
  repo: string;
  /** Linear ticket identifier (e.g. "OMN-2922"). */
  ticket_id: string;
  /** Current watch status. */
  status: PrWatchStatus;
  /** Number of pr-review-dev fix cycles consumed. */
  review_cycles_used?: number;
  /** Wall-clock hours elapsed since watch started. */
  watch_duration_hours?: number;
  /** End-to-end correlation identifier. */
  correlation_id: UuidString;
  /** UTC timestamp when the event was emitted. */
  emitted_at: IsoDatetime;
  /** Optional Claude Code session identifier. */
  session_id?: string | null;
}

// ============================================================================
// ModelGateDecisionEvent
// ============================================================================

export type GateDecision = 'ACCEPTED' | 'REJECTED' | 'TIMEOUT';
export type GateType = 'HIGH_RISK' | 'MEDIUM_RISK';

/**
 * Gate outcome emitted by the slack-gate skill.
 * Emitted exactly once per gate invocation at each terminal outcome.
 * Matches ModelGateDecisionEvent in omniclaude.
 */
export interface OmniclaudeGateDecisionEvent {
  /** Unique ID for this event. */
  event_id: UuidString;
  /** Unique identifier for the gate invocation. Required by Pydantic model. */
  gate_id: string;
  /** Gate outcome. */
  decision: GateDecision;
  /** Linear ticket identifier for which the gate was raised. */
  ticket_id: string;
  /** Gate risk level. */
  gate_type?: GateType;
  /** Wall-clock seconds from gate posting to decision. */
  wait_seconds?: number;
  /** Slack user who responded (null on TIMEOUT). */
  responder?: string | null;
  /** End-to-end correlation identifier. */
  correlation_id: UuidString;
  /** UTC timestamp when the event was emitted. */
  emitted_at: IsoDatetime;
  /** Optional Claude Code session identifier. */
  session_id?: string | null;
}

// ============================================================================
// ModelBudgetCapHitEvent
// ============================================================================

/**
 * Emitted when the token budget threshold is exceeded during context injection.
 * Consumers upsert into pipeline_budget_state keyed by run_id.
 * Matches ModelBudgetCapHitEvent in omniclaude.
 */
export interface OmniclaudeBudgetCapHitEvent {
  /** Unique ID for this event. */
  event_id: UuidString;
  /** Pipeline run identifier -- upsert key for pipeline_budget_state. */
  run_id: UuidString;
  /** Actual tokens used at the time of cap. */
  tokens_used: number;
  /** Configured token budget limit. Required by Pydantic model. */
  tokens_budget: number;
  /** Human-readable reason for the cap. */
  cap_reason?: string;
  /** End-to-end correlation identifier. */
  correlation_id: UuidString;
  /** UTC timestamp when the event was emitted. */
  emitted_at: IsoDatetime;
  /** Optional Claude Code session identifier. */
  session_id?: string | null;
}

// ============================================================================
// ModelCircuitBreakerTrippedEvent
// ============================================================================

/**
 * Emitted when the Kafka circuit breaker transitions to OPEN state.
 * Provides visibility into Kafka connectivity issues during Claude Code sessions.
 * Matches ModelCircuitBreakerTrippedEvent in omniclaude.
 */
export interface OmniclaudeCircuitBreakerTrippedEvent {
  /** Unique ID for this event. */
  event_id: UuidString;
  /** Claude Code session identifier. */
  session_id: string;
  /** Number of consecutive failures that triggered the trip. */
  failure_count: number;
  /** Configured failure threshold. */
  threshold: number;
  /** Seconds until the breaker will attempt HALF_OPEN. Required by Pydantic model. */
  reset_timeout_seconds: number;
  /** String representation of the last error (if available). */
  last_error?: string | null;
  /** End-to-end correlation identifier. */
  correlation_id: UuidString;
  /** UTC timestamp when the event was emitted. */
  emitted_at: IsoDatetime;
}

// ============================================================================
// ModelSkillStartedEvent
// ============================================================================

/**
 * Emitted before task_dispatcher() is called for a skill invocation.
 * Matches ModelSkillStartedEvent in omniclaude.
 */
export interface OmniclaudeSkillStartedEvent {
  /** Unique ID for this event (handler is authoritative). */
  event_id: UuidString;
  /** Shared with the corresponding completed event -- join key. */
  run_id: UuidString;
  /** Human-readable skill identifier (e.g. "pr-review"). Required by Pydantic model. */
  skill_name: string;
  /** Repo-relative skill path (e.g. "plugins/onex/skills/pipeline-metrics"). Required. */
  skill_id: string;
  /** Repository identifier (e.g. "omniclaude") -- prevents cross-repo collisions. */
  repo_id: string;
  /** End-to-end correlation ID from the originating request. */
  correlation_id: UuidString;
  /** Count of args provided (not values -- privacy). Required by Pydantic model. */
  args_count: number;
  /** UTC timestamp when the event was emitted. */
  emitted_at: IsoDatetime;
  /** Optional Claude Code session identifier. */
  session_id?: string | null;
}

// ============================================================================
// ModelSkillCompletedEvent (from model_skill_lifecycle_events.py)
// ============================================================================

export type SkillRunStatus = 'success' | 'failed' | 'partial';

/**
 * Emitted after task_dispatcher() returns for a skill invocation.
 * Matches ModelSkillCompletedEvent in omniclaude.
 */
export interface OmniclaudeSkillCompletedEvent {
  /** Unique ID for this event. */
  event_id: UuidString;
  /** Shared with the corresponding started event -- join key. */
  run_id: UuidString;
  /** Human-readable skill identifier (e.g. "pr-review"). Required by Pydantic model. */
  skill_name: string;
  /** Repo-relative skill path. Required by Pydantic model. */
  skill_id: string;
  /** Repository identifier. */
  repo_id: string;
  /** Final invocation outcome. */
  status: SkillRunStatus;
  /** End-to-end correlation ID. */
  correlation_id: UuidString;
  /** UTC timestamp when the event was emitted. */
  emitted_at: IsoDatetime;
  /** Optional Claude Code session identifier. */
  session_id?: string | null;
  /** Optional error message on failure. */
  error_message?: string | null;
}

// ============================================================================
// Union type for all omniclaude events
// ============================================================================

export type OmniclaudeEvent =
  | OmniclaudeEpicRunUpdatedEvent
  | OmniclaudePrWatchUpdatedEvent
  | OmniclaudeGateDecisionEvent
  | OmniclaudeBudgetCapHitEvent
  | OmniclaudeCircuitBreakerTrippedEvent
  | OmniclaudeSkillStartedEvent
  | OmniclaudeSkillCompletedEvent;
