/**
 * DataSourceWithFallback — Kafka-primary + local-fallback data strategy (OMN-5202)
 *
 * Provides a generic wrapper for local-only dashboard pages that should
 * prefer Kafka/read-model data when available but fall back gracefully to
 * local polling sources (docker inspect, file poll, etc.) when Kafka is
 * unavailable or the read model is empty.
 *
 * Source priority:
 *   1. kafka  — primary: read-model or live Kafka consumer data
 *   2. local  — fallback: docker inspect / file-based poller
 *   3. empty  — last resort: caller-provided empty/zero value
 *
 * The `source` field in the result lets the UI show a "Local data" badge
 * when Kafka is unavailable so operators know the freshness tier.
 */

// ============================================================================
// Types
// ============================================================================

/** Which data source produced the result. */
export type DataSource = 'kafka' | 'local' | 'empty';

/** Result envelope returned by withFallback. */
export interface DataSourceResult<T> {
  /** The resolved data (from whichever source succeeded first). */
  data: T;
  /** Which source provided the data. */
  source: DataSource;
}

// ============================================================================
// Core utility
// ============================================================================

/**
 * Attempt `primary` first (Kafka / read-model); on failure try `fallback`
 * (local poller); if both fail return `empty` with source="empty".
 *
 * Both `primary` and `fallback` are called lazily — `fallback` is only
 * invoked when `primary` throws or rejects, and `empty` is only used when
 * both throw.
 *
 * @param primary  Async factory for Kafka / read-model data (throws on unavailable)
 * @param fallback Async factory for local poller data (throws on unavailable)
 * @param empty    Static empty value returned when all sources fail
 * @returns        DataSourceResult with data and the source tier that was used
 *
 * @example
 * const result = await withFallback(
 *   () => fetchFromReadModel(),
 *   () => workerHealthProjection.getAll(),
 *   []
 * );
 * res.json({ ...result.data, source: result.source });
 */
export async function withFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
  empty: T
): Promise<DataSourceResult<T>> {
  try {
    const data = await primary();
    return { data, source: 'kafka' };
  } catch {
    try {
      const data = await fallback();
      return { data, source: 'local' };
    } catch {
      return { data: empty, source: 'empty' };
    }
  }
}
