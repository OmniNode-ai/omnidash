/**
 * CdqaGateProjection — In-memory projection for CDQA gate evaluations (OMN-3190)
 *
 * Data source (short term): File-poll from ~/.claude/skill-results/*\/cdqa-gate-log.json
 * The file watcher (cdqa-gate-watcher.ts) calls handle() for each record found.
 *
 * Kafka-backed projection is a follow-up ticket.
 *
 * Payload shape served via /api/cdqa-gates:
 *   PrGateSummary[]
 *
 * Each PrGateSummary groups all gate evaluations for a given (repo, pr_number) pair
 * and computes an overallResult: PASS | WARN | BLOCK.
 *
 * Priority rules:
 *   - BLOCK if any gate result is BLOCK
 *   - WARN if any gate result is WARN (and none are BLOCK)
 *   - PASS if all gate results are PASS
 */

// ============================================================================
// Types
// ============================================================================

/** A single CDQA gate evaluation record (from cdqa-gate-log.json). */
export interface CdqaGateRecord {
  gate: string;
  pr_number: number;
  repo: string;
  result: 'PASS' | 'WARN' | 'BLOCK';
  timestamp: string;
}

/** Aggregated CDQA gate result for a single (repo, pr_number) pair. */
export interface PrGateSummary {
  repo: string;
  pr_number: number;
  /** All individual gate evaluations for this PR, in ingestion order. */
  gates: CdqaGateRecord[];
  /** Computed overall result: BLOCK > WARN > PASS. */
  overallResult: 'PASS' | 'WARN' | 'BLOCK';
  /** True when overallResult is BLOCK. */
  blocked: boolean;
  /** ISO timestamp of the most recently evaluated gate. */
  lastEvaluated: string;
}

// ============================================================================
// Projection
// ============================================================================

/**
 * CdqaGateProjection — in-memory accumulator for CDQA gate evaluations.
 *
 * Keyed by `${repo}::${pr_number}`. Supports:
 *   - handle(record): ingest a new gate evaluation
 *   - getSummaryForPr(repo, prNumber): retrieve summary for a specific PR
 *   - getAllSummaries(): retrieve all PR summaries
 */
export class CdqaGateProjection {
  /** Map from composite key (`${repo}::${pr_number}`) to accumulated summary. */
  private readonly summaries = new Map<string, PrGateSummary>();

  private static key(repo: string, prNumber: number): string {
    return `${repo}::${prNumber}`;
  }

  /**
   * Ingest a single gate evaluation record.
   * Updates the running aggregate for the (repo, pr_number) pair.
   */
  handle(record: CdqaGateRecord): void {
    const k = CdqaGateProjection.key(record.repo, record.pr_number);
    const existing = this.summaries.get(k);

    if (!existing) {
      const overallResult = record.result;
      this.summaries.set(k, {
        repo: record.repo,
        pr_number: record.pr_number,
        gates: [record],
        overallResult,
        blocked: overallResult === 'BLOCK',
        lastEvaluated: record.timestamp,
      });
      return;
    }

    // Append gate and recompute aggregate
    const gates = [...existing.gates, record];
    const overallResult = CdqaGateProjection.computeOverall(gates);
    const lastEvaluated = CdqaGateProjection.latestTimestamp(
      existing.lastEvaluated,
      record.timestamp
    );

    this.summaries.set(k, {
      ...existing,
      gates,
      overallResult,
      blocked: overallResult === 'BLOCK',
      lastEvaluated,
    });
  }

  /**
   * Retrieve the aggregated summary for a specific PR.
   * Returns null if no gate evaluations have been ingested for this PR.
   */
  getSummaryForPr(repo: string, prNumber: number): PrGateSummary | null {
    return this.summaries.get(CdqaGateProjection.key(repo, prNumber)) ?? null;
  }

  /**
   * Retrieve all PR gate summaries, sorted by lastEvaluated descending
   * (most recently evaluated PR first).
   */
  getAllSummaries(): PrGateSummary[] {
    return [...this.summaries.values()].sort((a, b) =>
      b.lastEvaluated.localeCompare(a.lastEvaluated)
    );
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  /**
   * Compute overall result with BLOCK > WARN > PASS priority.
   */
  private static computeOverall(gates: CdqaGateRecord[]): 'PASS' | 'WARN' | 'BLOCK' {
    let hasWarn = false;
    for (const g of gates) {
      if (g.result === 'BLOCK') return 'BLOCK';
      if (g.result === 'WARN') hasWarn = true;
    }
    return hasWarn ? 'WARN' : 'PASS';
  }

  /**
   * Return the lexicographically later of two ISO timestamps.
   * ISO-8601 strings sort correctly as strings when in the same timezone format.
   */
  private static latestTimestamp(a: string, b: string): string {
    return a.localeCompare(b) >= 0 ? a : b;
  }
}

/** Singleton projection instance used by the file watcher and API route. */
export const cdqaGateProjection = new CdqaGateProjection();
