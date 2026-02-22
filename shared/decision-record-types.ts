/**
 * DecisionRecord Types (OMN-2468, OMN-2469, OMN-2470, OMN-2471)
 *
 * Shared type definitions for the "Why This Happened" panel.
 * These types model the DecisionRecord storage introduced by OMN-2467
 * (DecisionRecord storage + query API in omniintelligence).
 *
 * The panel surfaces causal provenance (Layer 1 — authoritative) alongside
 * agent narrative (Layer 2 — assistive, not authoritative).
 *
 * Trust invariant: Every inferred value must be traceable to a DecisionRecord.
 * No value may appear without structured provenance.
 */

// ============================================================================
// Core DecisionRecord
// ============================================================================

/** Valid decision types produced by the routing/inference system. */
export type DecisionType = 'model_select' | 'tool_select' | 'route_select' | 'default_apply';

/** A single candidate evaluated during a decision. */
export interface CandidateEntry {
  /** Candidate identifier (e.g. "claude-opus-4-6", "agent-api-architect") */
  id: string;
  /** Whether this candidate was eliminated by a constraint (before scoring) */
  eliminated: boolean;
  /** Constraint that eliminated this candidate, if any */
  elimination_reason?: string;
  /** Per-metric score breakdown (0–1 per metric; null/absent if eliminated early) */
  scoring_breakdown?: Record<string, number> | null;
  /** Aggregate score (weighted sum of scoring_breakdown; null/absent if eliminated) */
  total_score?: number | null;
  /** Whether this candidate was the final selection */
  selected: boolean;
}

/**
 * A single DecisionRecord representing one system decision.
 * Layer 1 (authoritative): constraints_applied, candidates_considered,
 * scoring_breakdown, tie_breaker, selected_candidate, decision_type.
 * Layer 2 (assistive): agent_rationale.
 */
export interface DecisionRecord {
  /** Unique ID for this decision */
  decision_id: string;
  /** Session or workflow execution context */
  session_id: string;
  /** ISO-8601 timestamp when this decision was made */
  decided_at: string;
  /** Categorises what kind of decision this was */
  decision_type: DecisionType;
  /** The candidate that was ultimately selected */
  selected_candidate: string;
  /** All candidates that were considered (including eliminated) */
  candidates_considered: CandidateEntry[];
  /** Constraints applied during this decision (Layer 1) */
  constraints_applied: ConstraintEntry[];
  /** Tie-breaker rule applied if scores were equal; null if no tie */
  tie_breaker: string | null;
  /**
   * Agent-generated narrative explanation (Layer 2).
   * This is assistive, not authoritative — it may not perfectly reflect
   * the actual constraint/score data.
   */
  agent_rationale: string | null;
}

/** A constraint that was evaluated during a decision. */
export interface ConstraintEntry {
  /** Human-readable constraint description (e.g. "latency < 500ms") */
  description: string;
  /** IDs of candidates eliminated by this constraint */
  eliminates: string[];
  /** Whether this constraint was satisfied by the selected candidate */
  satisfied_by_selected: boolean;
}

// ============================================================================
// Intent vs Resolved Plan (View 1 — OMN-2468)
// ============================================================================

/** Origin of a resolved value — either explicit user input, system inference, or default policy. */
export type ValueOrigin = 'user_specified' | 'inferred' | 'default';

/** A single field in the intent-vs-plan comparison. */
export interface IntentPlanField {
  /** Display name of the field (e.g. "Model", "Tools", "Context") */
  field_name: string;
  /**
   * User-specified value, or null if not provided.
   * Display as "(not specified)" when null.
   */
  intent_value: string | null;
  /** Value after system resolution */
  resolved_value: string;
  /** How the resolved value was produced */
  origin: ValueOrigin;
  /**
   * ID of the DecisionRecord that produced this value (for inferred/default).
   * Null if origin is 'user_specified'.
   */
  decision_id: string | null;
}

/** Full intent-vs-plan comparison for a workflow execution. */
export interface IntentVsPlanData {
  session_id: string;
  /** ISO-8601 timestamp of the workflow execution */
  executed_at: string;
  /** All fields compared between intent and resolved plan */
  fields: IntentPlanField[];
}

// ============================================================================
// Decision Timeline (View 2 — OMN-2469)
// ============================================================================

/** Lightweight summary row for the timeline (expanded from DecisionRecord). */
export interface DecisionTimelineRow {
  decision_id: string;
  decided_at: string;
  decision_type: DecisionType;
  selected_candidate: string;
  candidates_count: number;
  /** Full record — loaded on expand */
  full_record: DecisionRecord;
}

// ============================================================================
// Candidate Comparison (View 3 — OMN-2470)
// ============================================================================

/** Candidate comparison table data for a single DecisionRecord. */
export interface CandidateComparisonData {
  decision_id: string;
  decision_type: DecisionType;
  decided_at: string;
  /** All metric names found across all candidate scoring_breakdowns */
  metric_columns: string[];
  rows: CandidateComparisonRow[];
  constraints_applied: ConstraintEntry[];
  tie_breaker: string | null;
}

/** A single row in the candidate comparison table. */
export interface CandidateComparisonRow {
  id: string;
  selected: boolean;
  eliminated: boolean;
  elimination_reason?: string;
  /** Per-metric scores; missing metrics represented as null */
  scores: Record<string, number | null>;
  total_score: number | null;
}

// ============================================================================
// Narrative Overlay (View 4 — OMN-2471)
// ============================================================================

/** Mismatch between agent_rationale (Layer 2) and Layer 1 provenance. */
export interface RationaleMismatch {
  /** Specific text fragment in agent_rationale that has no Layer 1 backing */
  conflicting_reference: string;
  /** Human-readable explanation of why this is a mismatch */
  explanation: string;
}

/** Data for the agent narrative overlay component. */
export interface NarrativeOverlayData {
  decision_id: string;
  /** Layer 1 authoritative provenance summary */
  layer1_summary: {
    selected_candidate: string;
    constraints_count: number;
    candidates_count: number;
    top_constraint?: string;
    score: number | null;
  };
  /** Layer 2 agent-generated rationale; null if none provided */
  agent_rationale: string | null;
  /** Mismatches detected between Layer 2 and Layer 1; empty array if clean */
  mismatches: RationaleMismatch[];
}

// ============================================================================
// API Response Envelopes (OMN-2469 server routes)
// ============================================================================

/** Response envelope for GET /api/decisions/timeline */
export interface DecisionTimelineResponse {
  session_id: string;
  total: number;
  rows: DecisionTimelineRow[];
}

/** Response envelope for GET /api/decisions/intent-vs-plan */
export interface IntentVsPlanResponse {
  session_id: string;
  executed_at: string;
  fields: IntentPlanField[];
}
