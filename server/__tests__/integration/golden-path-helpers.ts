/**
 * Golden path verification helpers.
 *
 * Utilities for verifying that pattern and effectiveness data has arrived
 * in the database after pipeline processing. Supports two lookup modes:
 *
 * - "session": Exact match via session ID (deterministic)
 * - "since": Time-window heuristic (for cases without session tracking)
 *
 * Used by golden path integration tests to verify end-to-end data flow.
 *
 * NOTE: `verifyPatternArrival` and `verifyEffectivenessArrival` are not yet
 * consumed by any test in this repository. They are test infrastructure
 * intended for future golden-path integration tests that will verify
 * event arrival via the Kafka pipeline (e.g., publishing an agent event
 * and asserting it materialises in the intelligence database). Retained
 * here so follow-up PRs can import them without reimplementation.
 */

import { sql } from 'drizzle-orm';
import { getTestDb } from './helpers';
import { learnedPatterns, injectionEffectiveness } from '@shared/intelligence-schema';

export interface ArrivalResult {
  found: boolean;
  count: number;
  heuristic: boolean;
  data: Record<string, unknown>[];
}

/**
 * Verify pattern arrival.
 * mode="session": checks source_session_ids array contains the given sessionId.
 * mode="since": checks rows created after the given timestamp (heuristic).
 */
export async function verifyPatternArrival(
  options: { sessionId: string; mode: 'session' } | { since: Date; mode: 'since' }
): Promise<ArrivalResult> {
  const db = getTestDb();

  if (options.mode === 'session') {
    // Use PostgreSQL array containment: source_session_ids @> ARRAY[sessionId]
    const rows = await db
      .select()
      .from(learnedPatterns)
      .where(sql`${learnedPatterns.sourceSessionIds} @> ARRAY[${options.sessionId}]::uuid[]`);

    return {
      found: rows.length > 0,
      count: rows.length,
      heuristic: false,
      data: rows as Record<string, unknown>[],
    };
  } else {
    // mode="since" -- time window heuristic
    const maxWindow = 10 * 60 * 1000; // 10 minutes
    const now = new Date();
    if (now.getTime() - options.since.getTime() > maxWindow) {
      throw new Error('Time window exceeds maximum of 10 minutes');
    }

    const rows = await db
      .select()
      .from(learnedPatterns)
      .where(sql`${learnedPatterns.createdAt} >= ${options.since.toISOString()}`)
      .orderBy(sql`${learnedPatterns.createdAt} DESC`);

    return {
      found: rows.length > 0,
      count: rows.length,
      heuristic: true,
      data: rows as Record<string, unknown>[],
    };
  }
}

/**
 * Verify effectiveness data arrival.
 * mode="session": checks injection_effectiveness by session_id.
 * mode="since": checks rows created after the given timestamp (heuristic).
 */
export async function verifyEffectivenessArrival(
  options: { sessionId: string; mode: 'session' } | { since: Date; mode: 'since' }
): Promise<ArrivalResult> {
  const db = getTestDb();

  if (options.mode === 'session') {
    const rows = await db
      .select()
      .from(injectionEffectiveness)
      .where(sql`${injectionEffectiveness.sessionId} = ${options.sessionId}`);

    return {
      found: rows.length > 0,
      count: rows.length,
      heuristic: false,
      data: rows as Record<string, unknown>[],
    };
  } else {
    const maxWindow = 10 * 60 * 1000;
    const now = new Date();
    if (now.getTime() - options.since.getTime() > maxWindow) {
      throw new Error('Time window exceeds maximum of 10 minutes');
    }

    const rows = await db
      .select()
      .from(injectionEffectiveness)
      .where(sql`${injectionEffectiveness.createdAt} >= ${options.since.toISOString()}`)
      .orderBy(sql`${injectionEffectiveness.createdAt} DESC`);

    return {
      found: rows.length > 0,
      count: rows.length,
      heuristic: true,
      data: rows as Record<string, unknown>[],
    };
  }
}
