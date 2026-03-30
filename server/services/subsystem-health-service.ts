/**
 * Subsystem Health Service (OMN-7007)
 *
 * Encapsulates DB access for subsystem health verification results.
 * Routes call this service instead of accessing the database directly
 * (per OMN-2325 architectural rule).
 *
 * @see OMN-7007 Subsystem health dashboard
 * @see OMN-2325 No direct DB access in routes
 */

import { tryGetIntelligenceDb } from '../storage';
import { sql } from 'drizzle-orm';

// Staleness thresholds (hours)
const WARN_HOURS = 8;
const STALE_HOURS = 24;

export interface SubsystemHealthRow {
  subsystem: string;
  status: string;
  test_count: number;
  pass_count: number;
  fail_count: number;
  run_id: string;
  verified_at: string;
  details: Record<string, unknown>;
}

export interface SubsystemHealthEntry {
  subsystem: string;
  status: string;
  originalStatus: string;
  testCount: number;
  passCount: number;
  failCount: number;
  passRate: number;
  lastVerified: string;
  runId: string;
  details: Record<string, unknown>;
}

export interface SubsystemHealthResult {
  subsystems: SubsystemHealthEntry[];
  checkedAt: string;
  _demo?: boolean;
  _message?: string;
}

/**
 * Compute effective status considering staleness degradation.
 * - If last verification > STALE_HOURS ago: STALE
 * - If last verification > WARN_HOURS ago: WARN (unless already FAIL)
 * - Otherwise: use the recorded status
 */
function degradeStatus(status: string, verifiedAt: string): string {
  const ageMs = Date.now() - new Date(verifiedAt).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);

  if (ageHours > STALE_HOURS) return 'STALE';
  if (ageHours > WARN_HOURS && status === 'PASS') return 'WARN';
  return status;
}

/**
 * Fetch latest verification status for each subsystem.
 * Returns demo response if DB is not configured.
 */
export async function getSubsystemHealth(): Promise<SubsystemHealthResult> {
  const db = tryGetIntelligenceDb();
  if (!db) {
    return {
      subsystems: [],
      checkedAt: new Date().toISOString(),
      _demo: true,
      _message: 'Database not configured. Running in demo-only mode.',
    };
  }

  const results = await db.execute(sql`
    SELECT DISTINCT ON (subsystem)
      subsystem,
      status,
      test_count,
      pass_count,
      fail_count,
      run_id,
      verified_at,
      details
    FROM subsystem_health_results
    ORDER BY subsystem, verified_at DESC
  `);

  const subsystems = (results.rows as unknown as SubsystemHealthRow[]).map((row) => ({
    subsystem: row.subsystem,
    status: degradeStatus(row.status, row.verified_at),
    originalStatus: row.status,
    testCount: row.test_count,
    passCount: row.pass_count,
    failCount: row.fail_count,
    passRate: row.test_count > 0
      ? Math.round((row.pass_count / row.test_count) * 100)
      : 0,
    lastVerified: row.verified_at,
    runId: row.run_id,
    details: row.details,
  }));

  return {
    subsystems,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Record a verification result from cron-closeout Phase E.
 * Returns null on success, or an error string.
 */
export async function recordSubsystemResult(params: {
  subsystem: string;
  status: string;
  testCount?: number;
  passCount?: number;
  failCount?: number;
  runId: string;
  details?: Record<string, unknown>;
}): Promise<string | null> {
  const db = tryGetIntelligenceDb();
  if (!db) {
    return 'Database not configured';
  }

  const { subsystem, status, testCount, passCount, failCount, runId, details } = params;

  if (!subsystem || !status || !runId) {
    return 'Missing required fields: subsystem, status, runId';
  }

  await db.execute(sql`
    INSERT INTO subsystem_health_results
      (subsystem, status, test_count, pass_count, fail_count, run_id, details)
    VALUES
      (${subsystem}, ${status}, ${testCount ?? 0}, ${passCount ?? 0}, ${failCount ?? 0}, ${runId}, ${JSON.stringify(details ?? {})}::jsonb)
  `);

  return null;
}
