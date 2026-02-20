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

export class EnrichmentProjection extends DbBackedProjectionView<EnrichmentPayload> {
  readonly viewId = 'enrichment';

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

  protected async querySnapshot(db: Db): Promise<EnrichmentPayload> {
    return this._queryForWindow(db, '24h');
  }

  // --------------------------------------------------------------------------
  // Public API used by route handlers
  // --------------------------------------------------------------------------

  /**
   * Return a fresh snapshot scoped to the given time window.
   *
   * The base getSnapshot() / ensureFresh() caches the '24h' window; callers
   * that need '7d' or '30d' snapshots call this method directly. Routes should
   * prefer this over ensureFresh() whenever the window parameter is user-supplied.
   */
  async ensureFreshForWindow(window: string): Promise<EnrichmentPayload> {
    const db = tryGetIntelligenceDb();
    if (!db) return this.emptyPayload();
    return this._queryForWindow(db, window);
  }

  // --------------------------------------------------------------------------
  // Private query methods
  // --------------------------------------------------------------------------

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

    const rows = await db.execute(sql`
      SELECT
        DATE_TRUNC(${truncUnit}, created_at) AT TIME ZONE 'UTC' AS bucket,
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

  private async _querySimilarityQuality(
    db: Db,
    interval: string,
    window: string
  ): Promise<SimilarityQualityPoint[]> {
    const truncUnit = window === '24h' ? 'hour' : 'day';

    const rows = await db.execute(sql`
      SELECT
        DATE_TRUNC(${truncUnit}, created_at) AT TIME ZONE 'UTC' AS bucket,
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
