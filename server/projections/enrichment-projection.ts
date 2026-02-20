/**
 * EnrichmentProjection — DB-backed projection for the Context Enrichment dashboard (OMN-2373)
 *
 * Encapsulates all SQL queries for the enrichment dashboard behind the
 * ProjectionView interface. Routes call ensureFresh() and access sub-fields
 * instead of importing storage or executing SQL directly.
 *
 * Source table: context_enrichment_events (defined by migrations/0005_context_enrichment_events.sql)
 *
 * Columns used: correlation_id, channel, model_name, cache_hit, outcome,
 *   latency_ms, tokens_before, tokens_after, net_tokens_saved,
 *   similarity_score, quality_score, repo, agent_name, created_at
 *
 * Per OMN-2325 architectural rule: route files must not import DB accessors
 * directly. All data access goes through this projection.
 */

import { sql } from 'drizzle-orm';
import type {
  EnrichmentSummary,
  EnrichmentByChannel,
  LatencyDistributionPoint,
  TokenSavingsTrendPoint,
  SimilarityQualityPoint,
  InflationAlert,
} from '@shared/enrichment-types';
import { DbBackedProjectionView } from './db-backed-projection-view';
import { tryGetIntelligenceDb } from '../storage';

// ============================================================================
// Payload type
// ============================================================================

export interface EnrichmentPayload {
  summary: EnrichmentSummary;
  byChannel: EnrichmentByChannel[];
  latencyDistribution: LatencyDistributionPoint[];
  tokenSavingsTrend: TokenSavingsTrendPoint[];
  similarityQuality: SimilarityQualityPoint[];
  inflationAlerts: InflationAlert[];
}

type Db = NonNullable<ReturnType<typeof tryGetIntelligenceDb>>;

/**
 * Convert a window string ('24h' | '7d' | '30d') to a PostgreSQL INTERVAL
 * literal for use in WHERE created_at >= NOW() - INTERVAL '...' queries.
 *
 * @param window - Time window identifier. Accepted values: '24h', '7d', '30d'.
 *   Any unrecognised value falls back to '7 days'.
 * @returns A PostgreSQL INTERVAL string suitable for interpolation into a raw
 *   SQL fragment (e.g. `INTERVAL '24 hours'`).
 */
function windowToInterval(window: string): string {
  switch (window) {
    case '24h':
      return '24 hours';
    case '30d':
      return '30 days';
    case '7d':
    default:
      return '7 days';
  }
}

// ============================================================================
// Projection
// ============================================================================

/**
 * The set of time-window values accepted by ensureFreshForWindow.
 *
 * This is a secondary safety net. The primary validation is performed by the
 * route layer (enrichment-routes.ts VALID_WINDOWS guard) before this method is
 * called. Both sets must be kept in sync: if a new window value is added to one,
 * it must be added to the other, or the route will accept windows that the
 * projection rejects (or vice-versa).
 */
const ACCEPTED_WINDOWS = new Set(['24h', '7d', '30d']);

export class EnrichmentProjection extends DbBackedProjectionView<EnrichmentPayload> {
  readonly viewId = 'enrichment';

  /**
   * Per-window in-flight guard for ensureFreshForWindow().
   *
   * Concurrent calls for the same window string are coalesced onto a single
   * set of DB queries rather than each issuing their own six parallel queries.
   * The Map is keyed by the window string ('24h', '7d', '30d') and the stored
   * Promise is removed in a .finally() handler so the next call after the
   * current one resolves starts a fresh query.
   */
  private ensureFreshForWindowInFlight = new Map<string, Promise<EnrichmentPayload>>();

  /**
   * Return a zero-value `EnrichmentPayload` used as a safe fallback when the
   * database is unavailable or a query returns no rows.
   *
   * All numeric fields are initialised to `0`, all array fields to `[]`, and
   * the nested `counts` object within `summary` mirrors those defaults.
   *
   * @returns A fully-typed `EnrichmentPayload` with every field set to its
   *   empty/zero equivalent.
   */
  protected emptyPayload(): EnrichmentPayload {
    return {
      summary: {
        total_enrichments: 0,
        hit_rate: 0,
        net_tokens_saved: 0,
        p50_latency_ms: 0,
        p95_latency_ms: 0,
        avg_similarity_score: 0,
        inflation_alert_count: 0,
        error_rate: 0,
        counts: { hits: 0, misses: 0, errors: 0, inflated: 0 },
      },
      byChannel: [],
      latencyDistribution: [],
      tokenSavingsTrend: [],
      similarityQuality: [],
      inflationAlerts: [],
    };
  }

  /**
   * Build the default cached snapshot using the '24h' time window.
   *
   * This method is called by the `DbBackedProjectionView` base class whenever
   * the in-memory cache is stale or absent. It delegates to `_queryForWindow`
   * with the '24h' window, which fans out all six sub-queries in parallel via
   * `Promise.all`.
   *
   * @param db - An active Drizzle database instance obtained from
   *   `tryGetIntelligenceDb`.
   * @returns A fully-populated `EnrichmentPayload` scoped to the last 24 hours.
   */
  protected async querySnapshot(db: Db): Promise<EnrichmentPayload> {
    return this._queryForWindow(db, '24h');
  }

  // --------------------------------------------------------------------------
  // Public API used by route handlers
  // --------------------------------------------------------------------------

  /**
   * Return a fresh snapshot scoped to the given time window.
   *
   * The base `getSnapshot()` / `ensureFresh()` caches only the '24h' window.
   * Callers that need '7d' or '30d' snapshots call this method directly, which
   * always bypasses the cache and issues live queries. Routes should prefer
   * this over `ensureFresh()` whenever the window parameter is user-supplied.
   *
   * If the database is unavailable (`tryGetIntelligenceDb` returns `null`),
   * an `emptyPayload()` is returned immediately without throwing.
   *
   * @param window - Time window identifier. Must be one of '24h', '7d', '30d'.
   *   An unrecognised value throws immediately so callers receive an explicit
   *   error rather than silently incorrect 7-day data. Note: the route layer
   *   (enrichment-routes.ts VALID_WINDOWS) is the primary guard; this check is
   *   a secondary safety net. Both must be kept in sync.
   * @returns A fully-populated `EnrichmentPayload` scoped to the requested
   *   window, or an empty payload when the DB is unreachable.
   * @throws {Error} If `window` is not one of the accepted values.
   *
   * @remarks
   * **Cache bypass**: This method intentionally skips the base-class projection
   * cache. Time-window variants (24h, 7d, 30d) cannot share a single cached
   * snapshot because each window requires a different aggregation range — the
   * cached snapshot produced by `querySnapshot()` always covers exactly 24 hours
   * and would return stale or incorrect data if reused for a 7-day or 30-day
   * request. Each call therefore executes a fresh set of DB queries via
   * `_queryForWindow`. If query volume becomes a concern, consider adding a
   * per-window TTL cache keyed on the window string.
   *
   * **In-flight coalescing**: Concurrent calls for the same window string share
   * one set of DB queries via `ensureFreshForWindowInFlight`. The in-flight
   * promise is removed after it settles, so the next call after the current one
   * completes starts a fresh query rather than waiting on a stale promise.
   *
   * **Known limitation**: There is currently no per-window TTL cache. Every
   * call to this method that is not coalesced with an in-flight request issues
   * a full set of live DB queries. Under high request rates or slow DB responses
   * this can create noticeable load. A future improvement should introduce a
   * short-lived (e.g. 60 s) in-memory cache keyed on the window string,
   * consistent with how the base-class 24 h snapshot is cached.
   */
  async ensureFreshForWindow(window: string): Promise<EnrichmentPayload> {
    if (!ACCEPTED_WINDOWS.has(window)) {
      throw new Error(
        `ensureFreshForWindow: invalid window "${window}". ` +
          `Accepted values are: ${[...ACCEPTED_WINDOWS].join(', ')}.`
      );
    }

    // Coalesce concurrent calls for the same window onto a single DB query set.
    const inflight = this.ensureFreshForWindowInFlight.get(window);
    if (inflight !== undefined) return inflight;

    const db = tryGetIntelligenceDb();
    if (!db) return this.emptyPayload();

    const promise = this._queryForWindow(db, window).finally(() => {
      this.ensureFreshForWindowInFlight.delete(window);
    });

    this.ensureFreshForWindowInFlight.set(window, promise);
    return promise;
  }

  // --------------------------------------------------------------------------
  // Private query methods
  // --------------------------------------------------------------------------

  /**
   * Fan out all six enrichment sub-queries in parallel for the given window
   * and assemble the results into a single `EnrichmentPayload`.
   *
   * Converts `window` to a PostgreSQL INTERVAL string via `windowToInterval`,
   * then runs `Promise.all` over all sub-queries so that each executes
   * concurrently against the `context_enrichment_events` table.
   *
   * @param db - Active Drizzle database instance.
   * @param window - Time window identifier ('24h' | '7d' | '30d'). Passed
   *   through to sub-queries that need both the raw window label (for
   *   DATE_TRUNC granularity) and the derived INTERVAL string.
   * @returns A fully-populated `EnrichmentPayload` assembled from the
   *   parallel sub-query results.
   */
  private async _queryForWindow(db: Db, window: string): Promise<EnrichmentPayload> {
    const interval = windowToInterval(window);

    const [
      summary,
      byChannel,
      latencyDistribution,
      tokenSavingsTrend,
      similarityQuality,
      inflationAlerts,
    ] = await Promise.all([
      this._querySummary(db, interval),
      this._queryByChannel(db, interval),
      this._queryLatencyDistribution(db, interval),
      this._queryTokenSavingsTrend(db, interval, window),
      this._querySimilarityQuality(db, interval, window),
      this._queryInflationAlerts(db, interval),
    ]);

    return {
      summary,
      byChannel,
      latencyDistribution,
      tokenSavingsTrend,
      similarityQuality,
      inflationAlerts,
    };
  }

  /**
   * Query aggregate summary statistics for the enrichment dashboard header row.
   *
   * Executes a single SQL statement against `context_enrichment_events` that
   * computes hit rate, cumulative net tokens saved, latency percentiles (p50,
   * p95), average similarity score, inflation alert count, error rate, and
   * per-outcome counts — all filtered to the supplied time window.
   *
   * Returns `emptyPayload().summary` when the query produces no rows (e.g. an
   * empty table).
   *
   * @param db - Active Drizzle database instance.
   * @param interval - PostgreSQL INTERVAL string produced by `windowToInterval`
   *   (e.g. `'24 hours'`, `'7 days'`).
   * @returns An `EnrichmentSummary` containing rolled-up metrics for the window.
   */
  private async _querySummary(db: Db, interval: string): Promise<EnrichmentSummary> {
    const rows = await db.execute(sql`
      SELECT
        COUNT(*)::int                                                                AS total_enrichments,
        ROUND(AVG(CASE WHEN outcome = 'hit' THEN 1.0 ELSE 0.0 END)::numeric, 4)    AS hit_rate,
        COALESCE(SUM(net_tokens_saved), 0)::int                                     AS net_tokens_saved,
        COALESCE(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY latency_ms), 0)::int AS p50_latency_ms,
        COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms), 0)::int AS p95_latency_ms,
        COALESCE(ROUND(AVG(similarity_score)::numeric, 4), 0)                      AS avg_similarity_score,
        COUNT(*) FILTER (WHERE outcome = 'inflated')::int                           AS inflation_alert_count,
        ROUND(AVG(CASE WHEN outcome = 'error' THEN 1.0 ELSE 0.0 END)::numeric, 4)  AS error_rate,
        COUNT(*) FILTER (WHERE outcome = 'hit')::int                                AS hits,
        COUNT(*) FILTER (WHERE outcome = 'miss')::int                               AS misses,
        COUNT(*) FILTER (WHERE outcome = 'error')::int                              AS errors,
        COUNT(*) FILTER (WHERE outcome = 'inflated')::int                           AS inflated
      FROM context_enrichment_events
      WHERE created_at >= NOW() - INTERVAL ${sql.raw(`'${interval}'`)}
    `);

    const r = (rows.rows ?? rows)[0] as Record<string, unknown> | undefined;
    if (!r) return this.emptyPayload().summary;

    return {
      total_enrichments: Number(r.total_enrichments ?? 0),
      hit_rate: Number(r.hit_rate ?? 0),
      net_tokens_saved: Number(r.net_tokens_saved ?? 0),
      p50_latency_ms: Number(r.p50_latency_ms ?? 0),
      p95_latency_ms: Number(r.p95_latency_ms ?? 0),
      avg_similarity_score: Number(r.avg_similarity_score ?? 0),
      inflation_alert_count: Number(r.inflation_alert_count ?? 0),
      error_rate: Number(r.error_rate ?? 0),
      counts: {
        hits: Number(r.hits ?? 0),
        misses: Number(r.misses ?? 0),
        errors: Number(r.errors ?? 0),
        inflated: Number(r.inflated ?? 0),
      },
    };
  }

  /**
   * Query per-channel breakdown of enrichment outcomes for the given window.
   *
   * Groups `context_enrichment_events` by `channel`, computing per-channel
   * hit/miss/error/inflated counts, hit rate, average latency, and average net
   * tokens saved. Results are ordered by total event count descending so the
   * most active channels appear first.
   *
   * @param db - Active Drizzle database instance.
   * @param interval - PostgreSQL INTERVAL string produced by `windowToInterval`
   *   (e.g. `'24 hours'`, `'7 days'`).
   * @returns An array of `EnrichmentByChannel` records, one per distinct
   *   channel, ordered by total descending. Returns an empty array when no
   *   rows match the interval.
   */
  private async _queryByChannel(db: Db, interval: string): Promise<EnrichmentByChannel[]> {
    const rows = await db.execute(sql`
      SELECT
        channel,
        COUNT(*)::int                                                                AS total,
        COUNT(*) FILTER (WHERE outcome = 'hit')::int                                AS hits,
        COUNT(*) FILTER (WHERE outcome = 'miss')::int                               AS misses,
        COUNT(*) FILTER (WHERE outcome = 'error')::int                              AS errors,
        COUNT(*) FILTER (WHERE outcome = 'inflated')::int                           AS inflated,
        ROUND(AVG(CASE WHEN outcome = 'hit' THEN 1.0 ELSE 0.0 END)::numeric, 4)    AS hit_rate,
        ROUND(AVG(latency_ms)::numeric, 2)                                          AS avg_latency_ms,
        ROUND(AVG(net_tokens_saved)::numeric, 2)                                    AS avg_net_tokens_saved
      FROM context_enrichment_events
      WHERE created_at >= NOW() - INTERVAL ${sql.raw(`'${interval}'`)}
      GROUP BY channel
      ORDER BY total DESC
    `);

    const resultRows = (rows.rows ?? rows) as Record<string, unknown>[];
    return resultRows.map((r) => ({
      channel: String(r.channel ?? ''),
      total: Number(r.total ?? 0),
      hits: Number(r.hits ?? 0),
      misses: Number(r.misses ?? 0),
      errors: Number(r.errors ?? 0),
      inflated: Number(r.inflated ?? 0),
      hit_rate: Number(r.hit_rate ?? 0),
      avg_latency_ms: Number(r.avg_latency_ms ?? 0),
      avg_net_tokens_saved: Number(r.avg_net_tokens_saved ?? 0),
    }));
  }

  /**
   * Query latency percentile distribution broken down by model name.
   *
   * Groups `context_enrichment_events` by `model_name` and computes p50, p90,
   * p95, and p99 latency values (in milliseconds) using PostgreSQL's
   * `PERCENTILE_CONT` ordered-set aggregate. Results are ordered by sample
   * count descending so the most-used models appear first.
   *
   * @param db - Active Drizzle database instance.
   * @param interval - PostgreSQL INTERVAL string produced by `windowToInterval`
   *   (e.g. `'24 hours'`, `'7 days'`).
   * @returns An array of `LatencyDistributionPoint` records, one per distinct
   *   model, ordered by sample count descending. Returns an empty array when
   *   no rows match the interval.
   */
  private async _queryLatencyDistribution(
    db: Db,
    interval: string
  ): Promise<LatencyDistributionPoint[]> {
    const rows = await db.execute(sql`
      SELECT
        model_name                                                                   AS model,
        COALESCE(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY latency_ms), 0)::int AS p50_ms,
        COALESCE(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY latency_ms), 0)::int AS p90_ms,
        COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms), 0)::int AS p95_ms,
        COALESCE(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms), 0)::int AS p99_ms,
        COUNT(*)::int                                                                AS sample_count
      FROM context_enrichment_events
      WHERE created_at >= NOW() - INTERVAL ${sql.raw(`'${interval}'`)}
      GROUP BY model_name
      ORDER BY sample_count DESC
    `);

    const resultRows = (rows.rows ?? rows) as Record<string, unknown>[];
    return resultRows.map((r) => ({
      model: String(r.model ?? 'unknown'),
      p50_ms: Number(r.p50_ms ?? 0),
      p90_ms: Number(r.p90_ms ?? 0),
      p95_ms: Number(r.p95_ms ?? 0),
      p99_ms: Number(r.p99_ms ?? 0),
      sample_count: Number(r.sample_count ?? 0),
    }));
  }

  /**
   * Query time-bucketed token savings trend data for the given window.
   *
   * Groups `context_enrichment_events` into time buckets using PostgreSQL's
   * `DATE_TRUNC`, with the bucket granularity derived from `window`:
   * - `'24h'` → hourly buckets
   * - `'7d'` / `'30d'` → daily buckets
   *
   * The `truncUnit` string is embedded via `sql.raw()`. This is safe because
   * its value is determined entirely by the `window` parameter comparison
   * above, never from user-supplied input.
   *
   * @param db - Active Drizzle database instance.
   * @param interval - PostgreSQL INTERVAL string produced by `windowToInterval`
   *   (e.g. `'24 hours'`, `'7 days'`), used in the WHERE clause.
   * @param window - Raw window label ('24h' | '7d' | '30d'), used to select
   *   the DATE_TRUNC granularity ('hour' or 'day').
   * @returns An array of `TokenSavingsTrendPoint` records ordered by bucket
   *   ascending. Each point carries an ISO-8601 `date` string plus cumulative
   *   and average token fields. Returns an empty array when no rows match.
   */
  private async _queryTokenSavingsTrend(
    db: Db,
    interval: string,
    window: string
  ): Promise<TokenSavingsTrendPoint[]> {
    // Choose bucket granularity based on the window size:
    //   24h  → hour buckets
    //   7d   → day buckets
    //   30d  → day buckets
    const truncUnit = window === '24h' ? 'hour' : 'day';

    // Explicit allowlist guard before sql.raw() interpolation.
    // The ternary above already constrains truncUnit to 'hour' | 'day', but this
    // runtime check ensures no future refactor can introduce an unsafe value.
    if (truncUnit !== 'hour' && truncUnit !== 'day') {
      throw new Error(
        `_queryTokenSavingsTrend: invalid truncation unit '${truncUnit as string}' — must be 'hour' or 'day'`
      );
    }

    // sql.raw() is safe: truncUnit is produced by the ternary above, never from user input
    const rows = await db.execute(sql`
      SELECT
        DATE_TRUNC(${sql.raw(`'${truncUnit}'`)}, created_at) AT TIME ZONE 'UTC' AS bucket,
        SUM(net_tokens_saved)::int                               AS net_tokens_saved,
        COUNT(*)::int                                            AS total_enrichments,
        ROUND(AVG(tokens_before)::numeric, 2)                   AS avg_tokens_before,
        ROUND(AVG(tokens_after)::numeric, 2)                    AS avg_tokens_after
      FROM context_enrichment_events
      WHERE created_at >= NOW() - INTERVAL ${sql.raw(`'${interval}'`)}
      GROUP BY bucket
      ORDER BY bucket ASC
    `);

    const resultRows = (rows.rows ?? rows) as Record<string, unknown>[];
    return resultRows.map((r) => {
      // Convert bucket timestamp to ISO-8601 date string (YYYY-MM-DD or
      // YYYY-MM-DDTHH:00:00.000Z depending on truncUnit).  We always emit the
      // full ISO string so the client can display it consistently.
      const bucket = r.bucket;
      const date = bucket instanceof Date ? bucket.toISOString() : String(bucket ?? '');
      return {
        date,
        net_tokens_saved: Number(r.net_tokens_saved ?? 0),
        total_enrichments: Number(r.total_enrichments ?? 0),
        avg_tokens_before: Number(r.avg_tokens_before ?? 0),
        avg_tokens_after: Number(r.avg_tokens_after ?? 0),
      };
    });
  }

  /**
   * Query time-bucketed average similarity and quality score trend data.
   *
   * Groups `context_enrichment_events` into time buckets using `DATE_TRUNC`,
   * with the same granularity logic as `_queryTokenSavingsTrend`:
   * - `'24h'` → hourly buckets
   * - `'7d'` / `'30d'` → daily buckets
   *
   * Only rows where `similarity_score IS NOT NULL` are included, so the
   * averages reflect actual scored lookups rather than unenriched events.
   *
   * The `truncUnit` string is embedded via `sql.raw()`. This is safe because
   * its value is determined entirely by the `window` comparison above, never
   * from user-supplied input.
   *
   * @param db - Active Drizzle database instance.
   * @param interval - PostgreSQL INTERVAL string produced by `windowToInterval`
   *   (e.g. `'24 hours'`, `'7 days'`), used in the WHERE clause.
   * @param window - Raw window label ('24h' | '7d' | '30d'), used to select
   *   the DATE_TRUNC granularity ('hour' or 'day').
   * @returns An array of `SimilarityQualityPoint` records ordered by bucket
   *   ascending. Each point carries an ISO-8601 `date` string, average
   *   similarity score, average quality score, and search count. Returns an
   *   empty array when no rows match.
   */
  private async _querySimilarityQuality(
    db: Db,
    interval: string,
    window: string
  ): Promise<SimilarityQualityPoint[]> {
    const truncUnit = window === '24h' ? 'hour' : 'day';

    // Explicit allowlist guard before sql.raw() interpolation (same pattern as _queryTokenSavingsTrend).
    // The ternary above already constrains truncUnit to 'hour' | 'day', but this
    // runtime check ensures no future refactor can introduce an unsafe value.
    if (truncUnit !== 'hour' && truncUnit !== 'day') {
      throw new Error(
        `_querySimilarityQuality: invalid truncation unit '${truncUnit as string}' — must be 'hour' or 'day'`
      );
    }

    // sql.raw() is safe: truncUnit is produced by the ternary above, never from user input
    const rows = await db.execute(sql`
      SELECT
        DATE_TRUNC(${sql.raw(`'${truncUnit}'`)}, created_at) AT TIME ZONE 'UTC' AS bucket,
        ROUND(AVG(similarity_score)::numeric, 4)                AS avg_similarity_score,
        ROUND(AVG(quality_score)::numeric, 4)                   AS avg_quality_score,
        COUNT(*)::int                                            AS search_count
      FROM context_enrichment_events
      WHERE created_at >= NOW() - INTERVAL ${sql.raw(`'${interval}'`)}
        AND similarity_score IS NOT NULL
      GROUP BY bucket
      ORDER BY bucket ASC
    `);

    const resultRows = (rows.rows ?? rows) as Record<string, unknown>[];
    return resultRows.map((r) => {
      const bucket = r.bucket;
      const date = bucket instanceof Date ? bucket.toISOString() : String(bucket ?? '');
      return {
        date,
        avg_similarity_score: Number(r.avg_similarity_score ?? 0),
        avg_quality_score: Number(r.avg_quality_score ?? 0),
        search_count: Number(r.search_count ?? 0),
      };
    });
  }

  /**
   * Query the most recent token-inflation incidents within the given window.
   *
   * Selects up to 100 rows from `context_enrichment_events` where
   * `outcome = 'inflated'` (i.e. the enriched context had more tokens than
   * the original), ordered by `created_at DESC` so the newest alerts surface
   * first. Results include full provenance fields (`correlation_id`, `channel`,
   * `model_name`, `repo`, `agent_name`) to aid investigation.
   *
   * @param db - Active Drizzle database instance.
   * @param interval - PostgreSQL INTERVAL string produced by `windowToInterval`
   *   (e.g. `'24 hours'`, `'7 days'`), used in the WHERE clause.
   * @returns An array of up to 100 `InflationAlert` records ordered by
   *   `occurred_at` descending. Optional fields (`repo`, `agent_name`) are
   *   `undefined` when the corresponding DB column is NULL. Returns an empty
   *   array when no inflated events exist in the window.
   */
  private async _queryInflationAlerts(db: Db, interval: string): Promise<InflationAlert[]> {
    const rows = await db.execute(sql`
      SELECT
        correlation_id,
        channel,
        model_name,
        tokens_before,
        tokens_after,
        net_tokens_saved,
        created_at       AS occurred_at,
        repo,
        agent_name
      FROM context_enrichment_events
      WHERE outcome = 'inflated'
        AND created_at >= NOW() - INTERVAL ${sql.raw(`'${interval}'`)}
      ORDER BY created_at DESC
      LIMIT 100
    `);

    const resultRows = (rows.rows ?? rows) as Record<string, unknown>[];
    return resultRows.map((r) => {
      const occurredAt = r.occurred_at;
      return {
        correlation_id: String(r.correlation_id ?? ''),
        channel: String(r.channel ?? ''),
        model_name: String(r.model_name ?? 'unknown'),
        tokens_before: Number(r.tokens_before ?? 0),
        tokens_after: Number(r.tokens_after ?? 0),
        net_tokens_saved: Number(r.net_tokens_saved ?? 0),
        occurred_at:
          occurredAt instanceof Date ? occurredAt.toISOString() : String(occurredAt ?? ''),
        repo: r.repo != null ? String(r.repo) : undefined,
        agent_name: r.agent_name != null ? String(r.agent_name) : undefined,
      };
    });
  }
}
