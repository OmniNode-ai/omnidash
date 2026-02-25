/**
 * Status Dashboard Types (OMN-2658)
 *
 * Shared interfaces and type guards for the three Kafka topics introduced
 * by OMN-2656 (GitHub PR status, git hook events, Linear snapshots).
 *
 * These types are consumed by:
 *   - server/projections/status-projection.ts  (in-memory projection, StatusProjection)
 *   - server/status-routes.ts                   (REST API)
 *   - client/src/pages/StatusDashboard.tsx      (dashboard page)
 */

// ============================================================================
// Triage State Union (8 states)
// ============================================================================

/**
 * Derived triage state for a GitHub PR.
 *
 * States:
 *   open              - PR is open, CI has not yet run (or is not tracked)
 *   ci_running        - CI is in progress
 *   ci_failed         - One or more CI checks failed
 *   approved_pending_ci - At least one approving review + CI running or not yet run
 *   approved          - At least one approving review + all CI checks passed
 *   changes_requested - A reviewer requested changes
 *   merged            - PR was merged
 *   closed            - PR was closed without merge
 */
export type TriageState =
  | 'open'
  | 'ci_running'
  | 'ci_failed'
  | 'approved_pending_ci'
  | 'approved'
  | 'changes_requested'
  | 'merged'
  | 'closed';

// ============================================================================
// GitHub PR Status Event
// ============================================================================

/** Payload shape emitted on onex.evt.github.pr-status.v1 (OMN-2656). */
export interface GitHubPRStatusEvent {
  /** Event schema version. */
  version: string;
  /** Repository slug, e.g. "OmniNode-ai/omniclaude". */
  repo: string;
  /** PR number. */
  pr_number: number;
  /** PR title. */
  title: string;
  /** PR author login. */
  author: string;
  /** PR URL. */
  url: string;
  /** PR state: "open" | "merged" | "closed". */
  state: string;
  /** CI status: "pending" | "running" | "success" | "failure" | "cancelled". */
  ci_status: string;
  /** Number of approving reviews. */
  approvals: number;
  /** Whether any reviewer has requested changes. */
  changes_requested: boolean;
  /** Number of open review threads. */
  open_threads: number;
  /** ISO-8601 timestamp. */
  timestamp: string;
  /** Optional: linked Linear ticket identifier, e.g. "OMN-2658". */
  linked_ticket?: string;
  /** Optional: commit SHA. */
  commit_sha?: string;
}

// ============================================================================
// Git Hook Event
// ============================================================================

/** Result of a single gate evaluated during a git hook (e.g. pre-commit check). */
export interface GateResult {
  /** Gate name, e.g. "ruff", "mypy", "eslint". */
  name: string;
  /** Whether the gate passed. */
  passed: boolean;
  /** Duration in milliseconds. */
  duration_ms: number;
  /** Optional: human-readable message or error summary. */
  message?: string;
}

/** Payload shape emitted on onex.evt.git.hook.v1 (OMN-2656). */
export interface GitHookEvent {
  /** Event schema version. */
  version: string;
  /** Repository slug. */
  repo: string;
  /** Hook name, e.g. "pre-commit", "post-receive", "pre-push". */
  hook: string;
  /** Branch the hook fired on. */
  branch: string;
  /** Author identity string. */
  author: string;
  /** Whether the overall hook succeeded (all gates passed). */
  success: boolean;
  /** Per-gate results. */
  gates: GateResult[];
  /** ISO-8601 timestamp. */
  timestamp: string;
  /** Optional: commit SHA (may be absent on pre-commit). */
  commit_sha?: string;
  /** Optional: total duration of all gates in milliseconds. */
  total_duration_ms?: number;
}

// ============================================================================
// Linear Snapshot Event
// ============================================================================

/** Ticket-level progress summary within a workstream. */
export interface TicketStatus {
  /** Linear ticket identifier, e.g. "OMN-2658". */
  id: string;
  /** Ticket title. */
  title: string;
  /** Current state name, e.g. "In Progress", "Done". */
  state: string;
  /** Assignee name or null. */
  assignee: string | null;
  /** 0-1 completion estimate based on sub-issues (if any). */
  progress?: number;
}

/** Epic-level workstream summary within a Linear snapshot. */
export interface WorkstreamStatus {
  /** Linear epic identifier. */
  id: string;
  /** Epic title. */
  title: string;
  /** Number of tickets completed. */
  completed: number;
  /** Total number of tickets. */
  total: number;
  /** 0-1 progress ratio (completed / total). */
  progress: number;
  /** Child tickets in this workstream. */
  tickets: TicketStatus[];
}

/** Payload shape emitted on onex.evt.linear.snapshot.v1 (OMN-2656). */
export interface LinearSnapshotEvent {
  /** Event schema version. */
  version: string;
  /** ISO-8601 timestamp of the snapshot. */
  timestamp: string;
  /** Workspace name. */
  workspace: string;
  /** Top-level workstreams (typically one per epic). */
  workstreams: WorkstreamStatus[];
  /** Optional: total tickets across all workstreams. */
  total_tickets?: number;
  /** Optional: total completed tickets across all workstreams. */
  completed_tickets?: number;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Returns true if the value is a GitHubPRStatusEvent.
 * Checks the structural fields that distinguish this event type.
 */
export function isGitHubPRStatusEvent(value: unknown): value is GitHubPRStatusEvent {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.repo === 'string' &&
    typeof v.pr_number === 'number' &&
    typeof v.ci_status === 'string' &&
    typeof v.approvals === 'number'
  );
}

/**
 * Returns true if the value is a GitHookEvent.
 * Checks the structural fields that distinguish this event type.
 */
export function isGitHookEvent(value: unknown): value is GitHookEvent {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.hook === 'string' &&
    typeof v.branch === 'string' &&
    typeof v.success === 'boolean' &&
    Array.isArray(v.gates)
  );
}

/**
 * Returns true if the value is a LinearSnapshotEvent.
 * Checks the structural fields that distinguish this event type.
 */
export function isLinearSnapshotEvent(value: unknown): value is LinearSnapshotEvent {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.workspace === 'string' &&
    Array.isArray(v.workstreams) &&
    (v.workstreams.length === 0 ||
      typeof (v.workstreams as Record<string, unknown>[])[0]?.progress === 'number')
  );
}
