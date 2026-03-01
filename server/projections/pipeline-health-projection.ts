/**
 * PipelineHealthProjection — In-memory projection for ticket pipeline runs (OMN-3192)
 *
 * Data source: Pipeline state files polled from ~/.claude/pipelines/{ticket_id}/state.yaml
 * The file watcher (pipeline-health-watcher.ts) calls handle() for each record found.
 *
 * Payload shape served via /api/pipeline-health:
 *   PipelineHealthSummary[]
 *
 * Each PipelineHealthSummary represents one active or recently-completed ticket pipeline.
 *
 * Stuck detection: any pipeline with no update for > 30 minutes and not in a terminal
 * state (done, merged, failed) is marked stuck: true.
 */

// ============================================================================
// Types
// ============================================================================

/** A single pipeline phase transition event (from state.yaml or pipeline log). */
export interface PipelineEvent {
  ticket_id: string;
  repo: string;
  phase: string;
  status: 'running' | 'blocked' | 'done' | 'failed' | 'merged';
  timestamp: string;
  blockedReason?: string;
  cdqaGate?: {
    gate: string;
    result: 'PASS' | 'WARN' | 'BLOCK';
  };
}

/** Aggregated health summary for a single ticket pipeline. */
export interface PipelineHealthSummary {
  ticket_id: string;
  repo: string;
  phase: string;
  status: 'running' | 'blocked' | 'done' | 'failed' | 'merged';
  startedAt: string;
  lastUpdated: string;
  /** True when no update has been received for > 30 minutes and pipeline is not terminal. */
  stuck: boolean;
  /** True when the pipeline is in a blocked state (gate failure or manual hold). */
  blocked: boolean;
  blockedReason?: string;
  /** CDQA gate results recorded on this pipeline, in ingestion order. */
  cdqaGates: Array<{ gate: string; result: 'PASS' | 'WARN' | 'BLOCK' }>;
}

// ============================================================================
// Constants
// ============================================================================

/** Milliseconds with no update after which a non-terminal pipeline is considered stuck. */
const STUCK_THRESHOLD_MS = 30 * 60_000;

/** Terminal statuses — these are never considered stuck. */
const TERMINAL_STATUSES = new Set<PipelineHealthSummary['status']>(['done', 'failed', 'merged']);

// ============================================================================
// Projection
// ============================================================================

/**
 * PipelineHealthProjection — in-memory accumulator for ticket pipeline state.
 *
 * Keyed by ticket_id. Supports:
 *   - handle(event): ingest a new pipeline phase transition
 *   - getPipelineForTicket(ticketId): retrieve summary for a specific ticket
 *   - getAllPipelines(): retrieve all pipeline summaries, sorted by lastUpdated desc
 */
export class PipelineHealthProjection {
  /** Map from ticket_id to accumulated pipeline summary. */
  private readonly pipelines = new Map<string, PipelineHealthSummary>();

  /**
   * Ingest a single pipeline event.
   * Creates or updates the pipeline summary for the given ticket_id.
   */
  handle(event: PipelineEvent): void {
    const existing = this.pipelines.get(event.ticket_id);

    const cdqaGates: PipelineHealthSummary['cdqaGates'] = existing ? [...existing.cdqaGates] : [];

    if (event.cdqaGate) {
      cdqaGates.push(event.cdqaGate);
    }

    const isBlocked = event.status === 'blocked';

    if (!existing) {
      this.pipelines.set(event.ticket_id, {
        ticket_id: event.ticket_id,
        repo: event.repo,
        phase: event.phase,
        status: event.status,
        startedAt: event.timestamp,
        lastUpdated: event.timestamp,
        stuck: false,
        blocked: isBlocked,
        blockedReason: isBlocked ? event.blockedReason : undefined,
        cdqaGates,
      });
      return;
    }

    // Only advance if this event is newer than the last recorded update
    const isNewer = event.timestamp.localeCompare(existing.lastUpdated) >= 0;

    this.pipelines.set(event.ticket_id, {
      ...existing,
      phase: isNewer ? event.phase : existing.phase,
      status: isNewer ? event.status : existing.status,
      lastUpdated: isNewer ? event.timestamp : existing.lastUpdated,
      blocked: isNewer ? isBlocked : existing.blocked,
      blockedReason: isNewer
        ? isBlocked
          ? event.blockedReason
          : undefined
        : existing.blockedReason,
      cdqaGates,
    });
  }

  /**
   * Retrieve the pipeline summary for a specific ticket.
   * Returns null if no events have been ingested for this ticket.
   * Computes stuck dynamically at read time.
   */
  getPipelineForTicket(ticketId: string): PipelineHealthSummary | null {
    const summary = this.pipelines.get(ticketId);
    if (!summary) return null;
    return this.withStuckFlag(summary);
  }

  /**
   * Retrieve all pipeline summaries, sorted by lastUpdated descending
   * (most recently updated first).
   */
  getAllPipelines(): PipelineHealthSummary[] {
    return [...this.pipelines.values()]
      .map((s) => this.withStuckFlag(s))
      .sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated));
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  /**
   * Compute stuck flag dynamically: a pipeline is stuck when:
   * - it is NOT in a terminal status (done/failed/merged), AND
   * - its lastUpdated is more than STUCK_THRESHOLD_MS ago
   */
  private withStuckFlag(summary: PipelineHealthSummary): PipelineHealthSummary {
    if (TERMINAL_STATUSES.has(summary.status)) {
      return { ...summary, stuck: false };
    }
    const ageMs = Date.now() - new Date(summary.lastUpdated).getTime();
    return { ...summary, stuck: ageMs > STUCK_THRESHOLD_MS };
  }
}

/** Singleton projection instance used by the file watcher and API route. */
export const pipelineHealthProjection = new PipelineHealthProjection();
