/**
 * Cross-Repo Validation API Routes
 *
 * REST endpoints for querying cross-repo validation runs, violations, and trends.
 * Data is reconstructed from Kafka validation events consumed by the event consumer.
 *
 * @see OMN-1907 - Cross-Repo Validation Dashboard Integration
 */

import { Router } from 'express';
import type {
  ValidationRun,
  Violation,
  RepoTrends,
  RepoTrendPoint,
  ValidationRunStartedEvent,
  ValidationViolationsBatchEvent,
  ValidationRunCompletedEvent,
} from '@shared/validation-types';

const router = Router();

// ============================================================================
// In-Memory Store (populated by event consumer)
// ============================================================================

/** Map of run_id -> ValidationRun for reconstructing runs from events */
const runs = new Map<string, ValidationRun>();

/** Maximum number of runs to keep in memory */
const MAX_RUNS = 500;

/** Maximum violations per run to prevent unbounded memory growth */
const MAX_VIOLATIONS_PER_RUN = 10_000;

/**
 * Ingest a ValidationRunStarted event.
 * Called by the event consumer when a run.started event is received.
 */
export function handleValidationRunStarted(event: ValidationRunStartedEvent): void {
  // Evict oldest runs if at capacity
  if (runs.size >= MAX_RUNS) {
    const oldest = Array.from(runs.entries())
      .sort(([, a], [, b]) => a.started_at.localeCompare(b.started_at))
      .slice(0, 10);
    for (const [id] of oldest) runs.delete(id);
  }

  runs.set(event.run_id, {
    run_id: event.run_id,
    repos: event.repos,
    validators: event.validators,
    triggered_by: event.triggered_by,
    status: 'running',
    started_at: event.timestamp,
    total_violations: 0,
    violations_by_severity: {},
    violations: [],
  });
}

/**
 * Ingest a ValidationViolationsBatch event.
 * Appends violations to the matching run.
 */
export function handleValidationViolationsBatch(event: ValidationViolationsBatchEvent): void {
  const run = runs.get(event.run_id);
  if (!run) {
    console.warn(`[validation] Received violations for unknown run_id: ${event.run_id}`);
    return;
  }

  const remaining = MAX_VIOLATIONS_PER_RUN - run.violations.length;
  if (remaining <= 0) {
    console.warn(
      `[validation] Run ${event.run_id} reached violation cap (${MAX_VIOLATIONS_PER_RUN}), dropping batch`
    );
    return;
  }

  const toAdd =
    remaining >= event.violations.length ? event.violations : event.violations.slice(0, remaining);
  run.violations.push(...toAdd);
  run.total_violations = run.violations.length;

  // Recompute severity counts
  const bySeverity: Record<string, number> = {};
  for (const v of run.violations) {
    bySeverity[v.severity] = (bySeverity[v.severity] || 0) + 1;
  }
  run.violations_by_severity = bySeverity;
}

/**
 * Ingest a ValidationRunCompleted event.
 * Marks the run as finished with final status.
 */
export function handleValidationRunCompleted(event: ValidationRunCompletedEvent): void {
  const run = runs.get(event.run_id);
  if (!run) {
    console.warn(`[validation] Received completion for unknown run_id: ${event.run_id}`);
    return;
  }

  run.status = event.status;
  run.completed_at = event.timestamp;
  run.duration_ms = event.duration_ms;
  if (event.violations_by_severity) {
    run.violations_by_severity = event.violations_by_severity;
  }
  if (event.total_violations !== undefined) {
    run.total_violations = event.total_violations;
  }
}

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/validation/runs
 * List validation runs with optional filters.
 *
 * Query params:
 *   status - Filter by status (running, passed, failed, error)
 *   repo   - Filter runs that include a specific repo
 *   limit  - Max results (default 50, max 200)
 *   offset - Pagination offset (default 0)
 */
router.get('/runs', (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const repo = req.query.repo as string | undefined;
    const limitStr = req.query.limit as string | undefined;
    const offsetStr = req.query.offset as string | undefined;

    const limit = Math.min(Math.max(parseInt(limitStr || '50', 10) || 50, 1), 200);
    const offset = Math.max(parseInt(offsetStr || '0', 10) || 0, 0);

    let allRuns = Array.from(runs.values());

    // Filter by status
    if (status) {
      allRuns = allRuns.filter((r) => r.status === status);
    }

    // Filter by repo
    if (repo) {
      allRuns = allRuns.filter((r) => r.repos.includes(repo));
    }

    // Sort newest first
    allRuns.sort((a, b) => b.started_at.localeCompare(a.started_at));

    const total = allRuns.length;
    const paginated = allRuns.slice(offset, offset + limit);

    // Strip full violations from list view for performance
    const summary = paginated.map(({ violations, ...rest }) => ({
      ...rest,
      violation_count: violations.length,
    }));

    res.json({ runs: summary, total, limit, offset });
  } catch (error) {
    console.error('Error listing validation runs:', error);
    res.status(500).json({
      error: 'Failed to list validation runs',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/validation/runs/:runId
 * Get a single validation run with full violation details.
 */
router.get('/runs/:runId', (req, res) => {
  try {
    const run = runs.get(req.params.runId);
    if (!run) {
      return res.status(404).json({ error: 'Validation run not found' });
    }
    res.json(run);
  } catch (error) {
    console.error('Error getting validation run:', error);
    res.status(500).json({
      error: 'Failed to get validation run',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/validation/repos/:repoId/trends
 * Get violation trends for a specific repo.
 *
 * Query params:
 *   days - Number of days to look back (default 30, max 90)
 */
router.get('/repos/:repoId/trends', (req, res) => {
  try {
    const repoId = req.params.repoId;
    const daysStr = req.query.days as string | undefined;
    const days = Math.min(Math.max(parseInt(daysStr || '30', 10) || 30, 1), 90);

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Find completed runs that include this repo within the time window
    const repoRuns = Array.from(runs.values())
      .filter((r) => r.repos.includes(repoId) && r.status !== 'running' && r.started_at >= cutoff)
      .sort((a, b) => a.started_at.localeCompare(b.started_at));

    // Build trend points from runs
    const trend: RepoTrendPoint[] = repoRuns.map((r) => {
      const repoViolations = r.violations.filter((v) => v.repo === repoId);
      return {
        date: r.started_at.slice(0, 10),
        errors: repoViolations.filter((v) => v.severity === 'error').length,
        warnings: repoViolations.filter((v) => v.severity === 'warning').length,
        infos: repoViolations.filter((v) => v.severity === 'info').length,
        total: repoViolations.length,
      };
    });

    const result: RepoTrends = {
      repo: repoId,
      trend,
      latest_run_id: repoRuns.at(-1)?.run_id,
    };

    res.json(result);
  } catch (error) {
    console.error('Error getting repo trends:', error);
    res.status(500).json({
      error: 'Failed to get repo trends',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/validation/summary
 * Get summary stats across all validation runs.
 */
router.get('/summary', (_req, res) => {
  try {
    const allRuns = Array.from(runs.values());
    const completed = allRuns.filter((r) => r.status !== 'running');
    const running = allRuns.filter((r) => r.status === 'running');

    // Unique repos across all runs
    const repoSet = new Set<string>();
    for (const r of allRuns) {
      for (const repo of r.repos) repoSet.add(repo);
    }

    // Total violations by severity
    const totalBySeverity: Record<string, number> = {};
    for (const r of completed) {
      for (const [sev, count] of Object.entries(r.violations_by_severity)) {
        totalBySeverity[sev] = (totalBySeverity[sev] || 0) + count;
      }
    }

    // Pass rate
    const passed = completed.filter((r) => r.status === 'passed').length;
    const passRate = completed.length > 0 ? passed / completed.length : 0;

    res.json({
      total_runs: allRuns.length,
      completed_runs: completed.length,
      running_runs: running.length,
      unique_repos: repoSet.size,
      repos: Array.from(repoSet),
      pass_rate: passRate,
      total_violations_by_severity: totalBySeverity,
    });
  } catch (error) {
    console.error('Error getting validation summary:', error);
    res.status(500).json({
      error: 'Failed to get validation summary',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
