/**
 * EnforcementProjection — DB-backed projection for the Pattern Enforcement dashboard (OMN-2374)
 *
 * Encapsulates all SQL queries for the enforcement dashboard behind the
 * ProjectionView interface. Routes call ensureFreshForWindow() and access
 * sub-fields instead of importing storage or executing SQL directly.
 *
 * Source table: pattern_enforcement_events (defined by migrations/0002_pattern_enforcement_events.sql)
 *
 * Columns used: correlation_id, pattern_name, outcome, language, domain, created_at
 *
 * Outcomes: hit | violation | corrected | false_positive
 *
 * Per OMN-2325 architectural rule: route files must not import DB accessors
 * directly. All data access goes through this projection.
 */

import { sql } from 'drizzle-orm';
import type {
  EnforcementSummary,
  EnforcementByLanguage,
  EnforcementByDomain,
  ViolatedPattern,
  EnforcementTrendPoint,
} from '@shared/enforcement-types';
import { DbBackedProjectionView } from './db-backed-projection-view';
import { tryGetIntelligenceDb } from '../storage';

// ============================================================================
// Payload type
// ============================================================================

export interface EnforcementPayload {
  summary: EnforcementSummary;
  byLanguage: EnforcementByLanguage[];
  byDomain: EnforcementByDomain[];
  violatedPatterns: ViolatedPattern[];
  trend: EnforcementTrendPoint[];
}

type Db = NonNullable<ReturnType<typeof tryGetIntelligenceDb>>;

/**
 * Convert a window string ('24h' | '7d' | '30d') to a PostgreSQL INTERVAL
 * literal for use in WHERE created_at >= NOW() - INTERVAL '...' queries.
 *
 * Only called from _queryForWindow(), which is itself only reachable via:
 *   - ensureFreshForWindow() — validates against ACCEPTED_WINDOWS before calling
 *   - querySnapshot()        — hardcodes '24h', always a valid value
 *
 * @param window - Time window identifier. Accepted values: '24h', '7d', '30d'.
 * @returns A PostgreSQL INTERVAL string suitable for interpolation into a raw
 *   SQL fragment (e.g. `INTERVAL '24 hours'`).
 * @throws {Error} If `window` is not one of the three accepted values.
 */
function windowToInterval(window: string): string {
  switch (window) {
    case '24h':
      return '24 hours';
    case '7d':
      return '7 days';
    case '30d':
      return '30 days';
    default:
      throw new Error(
        `windowToInterval: unrecognised window "${window}". Accepted values: '24h', '7d', '30d'.`
      );
  }
}

// ============================================================================
// Projection
// ============================================================================

/**
 * The set of time-window values accepted by ensureFreshForWindow.
 *
 * Single source of truth for accepted window values — imported by both
 * enforcement-routes.ts (route-layer guard) and ensureFreshForWindow (secondary
 * safety net). Adding a new window here automatically makes it valid in both
 * layers; no separate constant needs updating.
 */
export const ACCEPTED_WINDOWS = new Set(['24h', '7d', '30d']);

/**
 * Minimum interval (ms) between successive non-coalesced DB query sets for
 * the same window key.
 *
 * Mirrors the pattern established in EnrichmentProjection (OMN-2373).
 * Bounds DB round-trips to at most ceil(1000 / COOLDOWN_MS) sets per second
 * per window regardless of client count, because concurrent calls are also
 * collapsed by the in-flight coalescing Map.
 */
const ENSURE_FRESH_COOLDOWN_MS = 500;

export class EnforcementProjection extends DbBackedProjectionView<EnforcementPayload> {
  readonly viewId = 'enforcement';

  /**
   * Per-window in-flight guard for ensureFreshForWindow().
   * Concurrent calls for the same window are coalesced onto a single DB query set.
   */
  private ensureFreshForWindowInFlight = new Map<string, Promise<EnforcementPayload>>();

  /**
   * Per-window cooldown timestamp for ensureFreshForWindow().
   * Records when the most recent non-coalesced DB query set was dispatched.
   */
  private ensureFreshForWindowLastDispatched = new Map<string, number>();

  /**
   * Per-window snapshot cache populated by the cooldown guard.
   * Stores the last successfully resolved EnforcementPayload for each window.
   */
  private ensureFreshForWindowLastSnapshot = new Map<string, EnforcementPayload>();

  /**
   * Return a zero-value `EnforcementPayload` used as a safe fallback when the
   * database is unavailable or a query returns no rows.
   */
  protected emptyPayload(): EnforcementPayload {
    return {
      summary: {
        total_evaluations: 0,
        hit_rate: 0,
        correction_rate: 0,
        false_positive_rate: 0,
        violated_pattern_count: 0,
        counts: { hits: 0, violations: 0, corrected: 0, false_positives: 0 },
        correction_rate_trend: [],
      },
      byLanguage: [],
      byDomain: [],
      violatedPatterns: [],
      trend: [],
    };
  }

  /**
   * Build the default cached snapshot using the '24h' time window.
   * Called by the DbBackedProjectionView base class when the cache is stale.
   */
  protected async querySnapshot(db: Db): Promise<EnforcementPayload> {
    return this._queryForWindow(db, '24h');
  }

  /**
   * Reset all cached state, including per-window cooldown Maps.
   * Overrides the base-class reset() to also clear the per-window Maps.
   */
  override reset(): void {
    super.reset();
    this.ensureFreshForWindowLastDispatched.clear();
    this.ensureFreshForWindowLastSnapshot.clear();
    this.ensureFreshForWindowInFlight.clear();
  }

  // --------------------------------------------------------------------------
  // Public API used by route handlers
  // --------------------------------------------------------------------------

  /**
   * Return the count of enforcement events in the last hour for use by
   * the health probe endpoint. Queries the DB directly to reflect the most
   * recent data without going through the per-window snapshot cache.
   *
   * Returns null when the DB is unavailable (health probe will report 'error').
   */
  async probeRecentCount(): Promise<number | null> {
    const db = tryGetIntelligenceDb();
    if (!db) return null;
    try {
      const result = await db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM pattern_enforcement_events
        WHERE created_at >= NOW() - INTERVAL '1 hour'
      `);
      const row = ((result.rows ?? result)[0] ?? {}) as Record<string, unknown>;
      return Number(row.count ?? 0);
    } catch (err) {
      console.error('[EnforcementProjection] probeRecentCount failed:', err);
      return null;
    }
  }

  /**
   * Return a fresh snapshot scoped to the given time window.
   *
   * Routes should use this method rather than the inherited ensureFresh() /
   * getSnapshot() path because the base-class cache is a single 24h snapshot.
   *
   * @param window - Time window identifier. Must be one of '24h', '7d', '30d'.
   * @returns A fully-populated EnforcementPayload, or an empty payload when
   *   the DB is unreachable.
   * @throws {Error} If `window` is not one of the accepted values.
   */
  async ensureFreshForWindow(window: string): Promise<EnforcementPayload> {
    if (!ACCEPTED_WINDOWS.has(window)) {
      throw new Error(
        `ensureFreshForWindow: invalid window "${window}". ` +
          `Accepted values are: ${[...ACCEPTED_WINDOWS].join(', ')}.`
      );
    }

    // Coalesce concurrent calls for the same window onto a single DB query set.
    // Node.js is single-threaded — between Map.get() and Map.set() there is no
    // await, so the first call sets the in-flight entry before any concurrent
    // call can reach this check.
    const inflight = this.ensureFreshForWindowInFlight.get(window);
    if (inflight !== undefined) return inflight;

    // Cooldown guard: serve the last snapshot if a query was dispatched within
    // the last ENSURE_FRESH_COOLDOWN_MS to prevent DB hammering under rapid polling.
    const lastDispatched = this.ensureFreshForWindowLastDispatched.get(window) ?? 0;
    if (Date.now() - lastDispatched < ENSURE_FRESH_COOLDOWN_MS) {
      const cached = this.ensureFreshForWindowLastSnapshot.get(window);
      if (cached !== undefined) return cached;
      // No snapshot yet — fall through to dispatch a fresh query.
    }

    const db = tryGetIntelligenceDb();
    // Return empty payload immediately if DB is unavailable.
    if (!db) return this.emptyPayload();

    const promise = this._queryForWindow(db, window)
      .then((payload) => {
        this.ensureFreshForWindowLastSnapshot.set(window, payload);
        return payload;
      })
      .finally(() => {
        this.ensureFreshForWindowInFlight.delete(window);
      });

    // Record dispatch timestamp AFTER the promise is created so that a
    // synchronous throw from _queryForWindow() doesn't stamp lastDispatched
    // without a corresponding in-flight entry.
    this.ensureFreshForWindowLastDispatched.set(window, Date.now());
    this.ensureFreshForWindowInFlight.set(window, promise);
    return promise;
  }

  // --------------------------------------------------------------------------
  // Private query methods
  // --------------------------------------------------------------------------

  /**
   * Fan out all five enforcement sub-queries in parallel for the given window
   * and assemble the results into a single EnforcementPayload.
   */
  private async _queryForWindow(db: Db, window: string): Promise<EnforcementPayload> {
    const interval = windowToInterval(window);

    const [summary, byLanguage, byDomain, violatedPatterns, trend] = await Promise.all([
      this._querySummary(db, interval, window),
      this._queryByLanguage(db, interval),
      this._queryByDomain(db, interval),
      this._queryViolatedPatterns(db, interval),
      this._queryTrend(db, interval, window),
    ]);

    return { summary, byLanguage, byDomain, violatedPatterns, trend };
  }

  /**
   * Query aggregate summary statistics for the enforcement dashboard header row.
   *
   * Computes hit rate, correction rate, false positive rate, outcome counts,
   * and violated pattern count — all filtered to the supplied time window.
   * Also computes a correction rate trend series bucketed by hour or day.
   *
   * @param db - Active Drizzle database instance.
   * @param interval - PostgreSQL INTERVAL string produced by windowToInterval.
   * @param window - Raw window label ('24h' | '7d' | '30d') for trend bucketing.
   * @returns An EnforcementSummary containing rolled-up metrics for the window.
   */
  private async _querySummary(
    db: Db,
    interval: string,
    window: string
  ): Promise<EnforcementSummary> {
    const [summaryRows, trendRows, violatedCountRows] = await Promise.all([
      // Main summary aggregation
      db.execute(sql`
        SELECT
          COUNT(*)::int                                                                          AS total_evaluations,
          ROUND(AVG(CASE WHEN outcome = 'hit'            THEN 1.0 ELSE 0.0 END)::numeric, 4)    AS hit_rate,
          ROUND(
            CASE
              WHEN COUNT(*) FILTER (WHERE outcome IN ('violation','corrected')) = 0 THEN 0.0
              ELSE COUNT(*) FILTER (WHERE outcome = 'corrected')::numeric
                   / COUNT(*) FILTER (WHERE outcome IN ('violation','corrected'))
            END, 4
          )                                                                                     AS correction_rate,
          ROUND(AVG(CASE WHEN outcome = 'false_positive' THEN 1.0 ELSE 0.0 END)::numeric, 4)    AS false_positive_rate,
          COUNT(*) FILTER (WHERE outcome = 'hit')::int                                          AS hits,
          COUNT(*) FILTER (WHERE outcome = 'violation')::int                                    AS violations,
          COUNT(*) FILTER (WHERE outcome = 'corrected')::int                                    AS corrected,
          COUNT(*) FILTER (WHERE outcome = 'false_positive')::int                               AS false_positives
        FROM pattern_enforcement_events
        -- NOTE: The interval string is produced only by windowToInterval(), which maps
        -- pre-validated window values to hardcoded literals. No user input reaches
        -- sql.raw() — the two-layer ACCEPTED_WINDOWS guard and route 400 ensure this.
        WHERE created_at >= NOW() - INTERVAL ${sql.raw(`'${interval}'`)}
      `),
      // Correction rate trend bucketed by hour or day
      db.execute(sql`
        SELECT
          DATE_TRUNC(${sql.raw(`'${window === '24h' ? 'hour' : 'day'}'`)}, created_at) AT TIME ZONE 'UTC' AS bucket,
          ROUND(
            CASE
              WHEN COUNT(*) FILTER (WHERE outcome IN ('violation','corrected')) = 0 THEN 0.0
              ELSE COUNT(*) FILTER (WHERE outcome = 'corrected')::numeric
                   / COUNT(*) FILTER (WHERE outcome IN ('violation','corrected'))
            END, 4
          ) AS correction_rate
        FROM pattern_enforcement_events
        WHERE created_at >= NOW() - INTERVAL ${sql.raw(`'${interval}'`)}
        GROUP BY bucket
        ORDER BY bucket ASC
      `),
      // Count distinct violated pattern names
      db.execute(sql`
        SELECT COUNT(DISTINCT pattern_name)::int AS violated_pattern_count
        FROM pattern_enforcement_events
        WHERE outcome = 'violation'
          AND created_at >= NOW() - INTERVAL ${sql.raw(`'${interval}'`)}
      `),
    ]);

    const r = ((summaryRows.rows ?? summaryRows)[0] ?? {}) as Record<string, unknown>;
    const vc = ((violatedCountRows.rows ?? violatedCountRows)[0] ?? {}) as Record<string, unknown>;

    const trendResultRows = (trendRows.rows ?? trendRows) as Record<string, unknown>[];
    const correction_rate_trend = trendResultRows.map((row) => {
      const bucket = row.bucket;
      return {
        date: bucket instanceof Date ? bucket.toISOString() : String(bucket ?? ''),
        value: Number(row.correction_rate ?? 0),
      };
    });

    return {
      total_evaluations: Number(r.total_evaluations ?? 0),
      hit_rate: Number(r.hit_rate ?? 0),
      correction_rate: Number(r.correction_rate ?? 0),
      false_positive_rate: Number(r.false_positive_rate ?? 0),
      violated_pattern_count: Number(vc.violated_pattern_count ?? 0),
      counts: {
        hits: Number(r.hits ?? 0),
        violations: Number(r.violations ?? 0),
        corrected: Number(r.corrected ?? 0),
        false_positives: Number(r.false_positives ?? 0),
      },
      correction_rate_trend,
    };
  }

  /**
   * Query enforcement metrics broken down by language.
   *
   * @param db - Active Drizzle database instance.
   * @param interval - PostgreSQL INTERVAL string.
   * @returns An array of EnforcementByLanguage records ordered by evaluations desc.
   */
  private async _queryByLanguage(db: Db, interval: string): Promise<EnforcementByLanguage[]> {
    const rows = await db.execute(sql`
      SELECT
        language,
        COUNT(*)::int                                                                        AS evaluations,
        COUNT(*) FILTER (WHERE outcome = 'hit')::int                                        AS hits,
        COUNT(*) FILTER (WHERE outcome = 'violation')::int                                  AS violations,
        COUNT(*) FILTER (WHERE outcome = 'corrected')::int                                  AS corrected,
        COUNT(*) FILTER (WHERE outcome = 'false_positive')::int                             AS false_positives,
        ROUND(AVG(CASE WHEN outcome = 'hit' THEN 1.0 ELSE 0.0 END)::numeric, 4)            AS hit_rate
      FROM pattern_enforcement_events
      -- see windowToInterval() NOTE above for sql.raw() interval safety rationale
      WHERE created_at >= NOW() - INTERVAL ${sql.raw(`'${interval}'`)}
      GROUP BY language
      ORDER BY evaluations DESC
    `);

    const resultRows = (rows.rows ?? rows) as Record<string, unknown>[];
    return resultRows.map((r) => ({
      language: String(r.language ?? ''),
      evaluations: Number(r.evaluations ?? 0),
      hits: Number(r.hits ?? 0),
      violations: Number(r.violations ?? 0),
      corrected: Number(r.corrected ?? 0),
      false_positives: Number(r.false_positives ?? 0),
      hit_rate: Number(r.hit_rate ?? 0),
    }));
  }

  /**
   * Query enforcement metrics broken down by domain.
   *
   * @param db - Active Drizzle database instance.
   * @param interval - PostgreSQL INTERVAL string.
   * @returns An array of EnforcementByDomain records ordered by evaluations desc.
   */
  private async _queryByDomain(db: Db, interval: string): Promise<EnforcementByDomain[]> {
    const rows = await db.execute(sql`
      SELECT
        domain,
        COUNT(*)::int                                                                        AS evaluations,
        COUNT(*) FILTER (WHERE outcome = 'hit')::int                                        AS hits,
        COUNT(*) FILTER (WHERE outcome = 'violation')::int                                  AS violations,
        COUNT(*) FILTER (WHERE outcome = 'corrected')::int                                  AS corrected,
        COUNT(*) FILTER (WHERE outcome = 'false_positive')::int                             AS false_positives,
        ROUND(AVG(CASE WHEN outcome = 'hit' THEN 1.0 ELSE 0.0 END)::numeric, 4)            AS hit_rate
      FROM pattern_enforcement_events
      -- see windowToInterval() NOTE above for sql.raw() interval safety rationale
      WHERE created_at >= NOW() - INTERVAL ${sql.raw(`'${interval}'`)}
      GROUP BY domain
      ORDER BY evaluations DESC
    `);

    const resultRows = (rows.rows ?? rows) as Record<string, unknown>[];
    return resultRows.map((r) => ({
      domain: String(r.domain ?? ''),
      evaluations: Number(r.evaluations ?? 0),
      hits: Number(r.hits ?? 0),
      violations: Number(r.violations ?? 0),
      corrected: Number(r.corrected ?? 0),
      false_positives: Number(r.false_positives ?? 0),
      hit_rate: Number(r.hit_rate ?? 0),
    }));
  }

  /**
   * Query the top violated patterns in the given window.
   *
   * Returns up to 50 patterns with the most violations, ordered by violation
   * count descending. Includes the most recent violation timestamp and the
   * per-pattern correction rate.
   *
   * @param db - Active Drizzle database instance.
   * @param interval - PostgreSQL INTERVAL string.
   * @returns An array of up to 50 ViolatedPattern records.
   */
  private async _queryViolatedPatterns(db: Db, interval: string): Promise<ViolatedPattern[]> {
    const rows = await db.execute(sql`
      SELECT
        pattern_name,
        COUNT(*) FILTER (WHERE outcome = 'violation')::int                                   AS violation_count,
        COUNT(*) FILTER (WHERE outcome = 'corrected')::int                                   AS corrected_count,
        ROUND(
          CASE
            WHEN COUNT(*) FILTER (WHERE outcome IN ('violation','corrected')) = 0 THEN 0.0
            ELSE COUNT(*) FILTER (WHERE outcome = 'corrected')::numeric
                 / COUNT(*) FILTER (WHERE outcome IN ('violation','corrected'))
          END, 4
        )                                                                                     AS correction_rate,
        MAX(created_at) FILTER (WHERE outcome = 'violation')                                  AS last_violation_at,
        -- Return the most common language and domain for this pattern (mode approximation)
        MODE() WITHIN GROUP (ORDER BY language)                                               AS language,
        MODE() WITHIN GROUP (ORDER BY domain)                                                 AS domain
      FROM pattern_enforcement_events
      -- see windowToInterval() NOTE above for sql.raw() interval safety rationale
      WHERE created_at >= NOW() - INTERVAL ${sql.raw(`'${interval}'`)}
      GROUP BY pattern_name
      HAVING COUNT(*) FILTER (WHERE outcome = 'violation') > 0
      ORDER BY violation_count DESC
      LIMIT 50
    `);

    const resultRows = (rows.rows ?? rows) as Record<string, unknown>[];
    return resultRows.map((r) => {
      const lastViolationAt = r.last_violation_at;
      return {
        pattern_name: String(r.pattern_name ?? ''),
        violation_count: Number(r.violation_count ?? 0),
        corrected_count: Number(r.corrected_count ?? 0),
        correction_rate: Number(r.correction_rate ?? 0),
        last_violation_at:
          lastViolationAt instanceof Date
            ? lastViolationAt.toISOString()
            : String(lastViolationAt ?? ''),
        language: r.language != null ? String(r.language) : undefined,
        domain: r.domain != null ? String(r.domain) : undefined,
      };
    });
  }

  /**
   * Query time-bucketed enforcement trend data for the given window.
   *
   * Groups events into hour (24h) or day (7d/30d) buckets and computes
   * per-bucket hit rate, correction rate, false positive rate, and total
   * evaluations.
   *
   * @param db - Active Drizzle database instance.
   * @param interval - PostgreSQL INTERVAL string.
   * @param window - Raw window label ('24h' | '7d' | '30d').
   * @returns An array of EnforcementTrendPoint records ordered by bucket asc.
   */
  private async _queryTrend(
    db: Db,
    interval: string,
    window: string
  ): Promise<EnforcementTrendPoint[]> {
    const truncUnit = window === '24h' ? 'hour' : 'day';

    // Explicit allowlist guard before sql.raw() interpolation.
    // The ternary above already constrains truncUnit to 'hour' | 'day'.
    if (truncUnit !== 'hour' && truncUnit !== 'day') {
      throw new Error(
        `_queryTrend: invalid truncation unit '${truncUnit as string}' — must be 'hour' or 'day'`
      );
    }

    // sql.raw() is safe: truncUnit is produced by the ternary above, never from user input
    const rows = await db.execute(sql`
      SELECT
        DATE_TRUNC(${sql.raw(`'${truncUnit}'`)}, created_at) AT TIME ZONE 'UTC'               AS bucket,
        ROUND(AVG(CASE WHEN outcome = 'hit'            THEN 1.0 ELSE 0.0 END)::numeric, 4)    AS hit_rate,
        ROUND(
          CASE
            WHEN COUNT(*) FILTER (WHERE outcome IN ('violation','corrected')) = 0 THEN 0.0
            ELSE COUNT(*) FILTER (WHERE outcome = 'corrected')::numeric
                 / COUNT(*) FILTER (WHERE outcome IN ('violation','corrected'))
          END, 4
        )                                                                                     AS correction_rate,
        ROUND(AVG(CASE WHEN outcome = 'false_positive' THEN 1.0 ELSE 0.0 END)::numeric, 4)    AS false_positive_rate,
        COUNT(*)::int                                                                          AS total_evaluations
      FROM pattern_enforcement_events
      -- see windowToInterval() NOTE above for sql.raw() interval safety rationale
      WHERE created_at >= NOW() - INTERVAL ${sql.raw(`'${interval}'`)}
      GROUP BY bucket
      ORDER BY bucket ASC
    `);

    const resultRows = (rows.rows ?? rows) as Record<string, unknown>[];
    return resultRows.map((r) => {
      const bucket = r.bucket;
      const date = bucket instanceof Date ? bucket.toISOString() : String(bucket ?? '');
      return {
        date,
        hit_rate: Number(r.hit_rate ?? 0),
        correction_rate: Number(r.correction_rate ?? 0),
        false_positive_rate: Number(r.false_positive_rate ?? 0),
        total_evaluations: Number(r.total_evaluations ?? 0),
      };
    });
  }
}
