/**
 * StatusProjection — In-memory projection for the /status dashboard (OMN-2658)
 *
 * Standalone in-memory singleton. NOT registered with ProjectionService
 * (no fanout, no WS invalidation, no ingest pipeline).
 *
 * Manages three maps:
 *   prTriageMap   - keyed `{repo}:{pr_number}` → GitHubPRStatusEvent
 *   hookFeed      - capped ring of GitHookEvent (last 100 entries)
 *   workstreams   - single-snapshot semantics: replaced on every LinearSnapshotEvent
 *
 * Called directly from event-consumer.ts handlers after topic dispatch.
 * Route files (status-routes.ts) access data via the exported singleton.
 *
 * Per OMN-2325 architectural rule: route files must not import DB accessors
 * directly. All data access goes through this projection.
 */

import type {
  GitHubPRStatusEvent,
  GitHookEvent,
  LinearSnapshotEvent,
  WorkstreamStatus,
  TriageState,
} from '@shared/status-types';

// ============================================================================
// Constants
// ============================================================================

const HOOK_FEED_CAP = 100;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Derive the triage state for a PR event.
 * Mirrors the 8-state TriageState union from shared/status-types.ts.
 */
function deriveTriageState(event: GitHubPRStatusEvent): TriageState {
  if (event.state === 'merged') return 'merged';
  if (event.state === 'closed') return 'closed';
  if (event.changes_requested) return 'changes_requested';

  const ciStatus = event.ci_status;
  const hasApproval = event.approvals > 0;

  if (ciStatus === 'failure' || ciStatus === 'cancelled') return 'ci_failed';
  if (ciStatus === 'running' || ciStatus === 'pending') {
    return hasApproval ? 'approved_pending_ci' : 'ci_running';
  }
  if (ciStatus === 'success' && hasApproval) return 'approved';
  return 'open';
}

// ============================================================================
// Projection class
// ============================================================================

export class StatusProjection {
  /** PR triage map: keyed `{repo}:{pr_number}`. */
  readonly prTriageMap = new Map<string, GitHubPRStatusEvent & { triage_state: TriageState }>();

  /** Git hook feed (capped at HOOK_FEED_CAP). Prepended on new events. */
  readonly hookFeed: GitHookEvent[] = [];

  /** Linear workstreams — single-snapshot semantics. */
  workstreams: WorkstreamStatus[] = [];

  /** ISO-8601 timestamp of the last Linear snapshot. */
  lastLinearSnapshotAt: string | null = null;

  // --------------------------------------------------------------------------
  // Mutation handlers (called by event-consumer.ts)
  // --------------------------------------------------------------------------

  /**
   * Upsert a PR event into prTriageMap and broadcast invalidation.
   * Called after receiving onex.evt.github.pr-status.v1.
   */
  upsertPR(event: GitHubPRStatusEvent): void {
    const key = `${event.repo}:${event.pr_number}`;
    const triage_state = deriveTriageState(event);
    this.prTriageMap.set(key, { ...event, triage_state });
  }

  /**
   * Prepend a hook event to hookFeed (capped at HOOK_FEED_CAP).
   * Called after receiving onex.evt.git.hook.v1.
   */
  appendHook(event: GitHookEvent): void {
    this.hookFeed.unshift(event);
    if (this.hookFeed.length > HOOK_FEED_CAP) {
      this.hookFeed.length = HOOK_FEED_CAP;
    }
  }

  /**
   * Replace workstreams with the new Linear snapshot (single-snapshot semantics).
   * Called after receiving onex.evt.linear.snapshot.v1.
   */
  replaceWorkstreams(event: LinearSnapshotEvent): void {
    this.workstreams = event.workstreams;
    this.lastLinearSnapshotAt = event.timestamp;
  }

  // --------------------------------------------------------------------------
  // Query methods (called by status-routes.ts)
  // --------------------------------------------------------------------------

  /** Return open PRs grouped by triage_state. */
  getPRsByTriageState(): Record<
    TriageState,
    Array<GitHubPRStatusEvent & { triage_state: TriageState }>
  > {
    const result: Record<string, Array<GitHubPRStatusEvent & { triage_state: TriageState }>> = {
      open: [],
      ci_running: [],
      ci_failed: [],
      approved_pending_ci: [],
      approved: [],
      changes_requested: [],
      merged: [],
      closed: [],
    };
    for (const pr of this.prTriageMap.values()) {
      const bucket = result[pr.triage_state];
      if (bucket) bucket.push(pr);
    }
    return result as Record<
      TriageState,
      Array<GitHubPRStatusEvent & { triage_state: TriageState }>
    >;
  }

  /** Return PRs for a specific repo. */
  getPRsByRepo(repo: string): Array<GitHubPRStatusEvent & { triage_state: TriageState }> {
    const result: Array<GitHubPRStatusEvent & { triage_state: TriageState }> = [];
    for (const pr of this.prTriageMap.values()) {
      if (pr.repo === repo) result.push(pr);
    }
    return result;
  }

  /** Return recent hook events (last `limit` entries). */
  getHooks(limit = 50): GitHookEvent[] {
    return this.hookFeed.slice(0, limit);
  }

  /** Return triage_state counts + repos with CI failures. */
  getSummary(): {
    triage_counts: Record<TriageState, number>;
    ci_failure_repos: string[];
    total_prs: number;
    workstream_count: number;
  } {
    const counts: Record<string, number> = {
      open: 0,
      ci_running: 0,
      ci_failed: 0,
      approved_pending_ci: 0,
      approved: 0,
      changes_requested: 0,
      merged: 0,
      closed: 0,
    };
    const ciFailureReposSet = new Set<string>();
    for (const pr of this.prTriageMap.values()) {
      counts[pr.triage_state] = (counts[pr.triage_state] ?? 0) + 1;
      if (pr.triage_state === 'ci_failed') ciFailureReposSet.add(pr.repo);
    }
    return {
      triage_counts: counts as Record<TriageState, number>,
      ci_failure_repos: Array.from(ciFailureReposSet),
      total_prs: this.prTriageMap.size,
      workstream_count: this.workstreams.length,
    };
  }

  /** Return current workstreams. */
  getWorkstreams(): { workstreams: WorkstreamStatus[]; snapshot_at: string | null } {
    return { workstreams: this.workstreams, snapshot_at: this.lastLinearSnapshotAt };
  }

  /** Reset all in-memory state (used in tests). */
  reset(): void {
    this.prTriageMap.clear();
    this.hookFeed.length = 0;
    this.workstreams = [];
    this.lastLinearSnapshotAt = null;
  }
}

// ============================================================================
// Singleton export
// ============================================================================

export const statusProjection = new StatusProjection();
