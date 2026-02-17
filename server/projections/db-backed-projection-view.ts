/**
 * DbBackedProjectionView — Base class for DB-query-backed projections (OMN-2325)
 *
 * Unlike event-driven projections (EventBusProjection, IntentProjectionView),
 * these views materialize state from PostgreSQL queries rather than from
 * real-time Kafka events. They implement the ProjectionView interface so
 * routes can use the same `projectionService.getView('x').getSnapshot()`
 * pattern, decoupling route handlers from storage schema.
 *
 * Features:
 * - TTL-based snapshot caching (default 5s) to avoid hammering the DB
 * - Graceful degradation when DB is unavailable (returns empty payloads)
 * - applyEvent() is a no-op (state comes from DB, not event stream)
 * - getEventsSince() returns empty (no incremental event tracking)
 *
 * Subclasses MUST implement:
 * - querySnapshot(): Execute SQL queries and return the domain payload
 * - emptyPayload(): Return the zero-value payload for graceful degradation
 */

import type { ProjectionView } from '../projection-service';
import type {
  ProjectionResponse,
  ProjectionEvent,
  ProjectionEventsResponse,
} from '@shared/projection-types';
import { tryGetIntelligenceDb } from '../storage';

/** Default cache TTL: 5 seconds. Keeps DB load reasonable for polling clients. */
const DEFAULT_CACHE_TTL_MS = 5_000;

/**
 * Abstract base class for projection views backed by PostgreSQL queries.
 *
 * @template TPayload - The snapshot payload type returned by getSnapshot()
 */
export abstract class DbBackedProjectionView<TPayload> implements ProjectionView<TPayload> {
  abstract readonly viewId: string;

  private cachedSnapshot: ProjectionResponse<TPayload> | null = null;
  private cacheExpiresAt = 0;
  private readonly cacheTtlMs: number;
  private snapshotSeq = 0;

  constructor(cacheTtlMs?: number) {
    this.cacheTtlMs = cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  }

  // --------------------------------------------------------------------------
  // ProjectionView interface
  // --------------------------------------------------------------------------

  /**
   * Returns a cached or freshly-queried snapshot.
   *
   * If the cache is stale (older than cacheTtlMs), re-queries the database.
   * If the DB is unavailable, returns the empty payload.
   *
   * The `options.limit` parameter is forwarded to `querySnapshot()` for
   * subclasses that support result limiting.
   */
  getSnapshot(options?: { limit?: number }): ProjectionResponse<TPayload> {
    const now = Date.now();

    // Return cached snapshot if still fresh
    if (this.cachedSnapshot && now < this.cacheExpiresAt) {
      return {
        ...this.cachedSnapshot,
        snapshotTimeMs: now,
      };
    }

    // Trigger async refresh but return stale/empty synchronously.
    // ProjectionView.getSnapshot() is synchronous by interface contract,
    // so we cannot await the DB query. Instead we:
    //   1. Return the last cached snapshot (stale but available), OR
    //   2. Return the empty payload if no cache exists yet
    //   3. Schedule an async refresh that will update the cache
    this.refreshAsync(options?.limit);

    if (this.cachedSnapshot) {
      return {
        ...this.cachedSnapshot,
        snapshotTimeMs: now,
      };
    }

    return {
      viewId: this.viewId,
      cursor: this.snapshotSeq,
      snapshotTimeMs: now,
      payload: this.emptyPayload(),
    };
  }

  /**
   * DB-backed projections don't track individual events.
   * Returns an empty events response.
   */
  getEventsSince(cursor: number): ProjectionEventsResponse {
    return {
      viewId: this.viewId,
      cursor,
      snapshotTimeMs: Date.now(),
      events: [],
    };
  }

  /**
   * DB-backed projections don't ingest events from the stream.
   * Always returns false (no state change).
   */
  applyEvent(_event: ProjectionEvent): boolean {
    return false;
  }

  /** Reset cached state. */
  reset(): void {
    this.cachedSnapshot = null;
    this.cacheExpiresAt = 0;
    this.snapshotSeq = 0;
  }

  // --------------------------------------------------------------------------
  // Subclass contract
  // --------------------------------------------------------------------------

  /**
   * Execute SQL queries and return the domain-specific payload.
   * Called by refreshAsync() when the cache is stale.
   *
   * @param db - Drizzle DB instance (guaranteed non-null)
   * @param limit - Optional result limit from getSnapshot() options
   * @returns The payload to cache and serve
   */
  protected abstract querySnapshot(
    db: NonNullable<ReturnType<typeof tryGetIntelligenceDb>>,
    limit?: number
  ): Promise<TPayload>;

  /**
   * Return the zero-value payload for graceful degradation.
   * Used when DB is unavailable or before the first refresh completes.
   */
  protected abstract emptyPayload(): TPayload;

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  /**
   * Trigger an async DB query to refresh the cached snapshot.
   * Errors are caught and logged; the cache remains stale but valid.
   */
  private refreshAsync(limit?: number): void {
    const db = tryGetIntelligenceDb();
    if (!db) return;

    // Fire-and-forget: update cache when query completes
    this.querySnapshot(db, limit)
      .then((payload) => {
        this.snapshotSeq++;
        const now = Date.now();
        this.cachedSnapshot = {
          viewId: this.viewId,
          cursor: this.snapshotSeq,
          snapshotTimeMs: now,
          payload,
        };
        this.cacheExpiresAt = now + this.cacheTtlMs;
      })
      .catch((err) => {
        console.error(`[projection:${this.viewId}] DB query failed:`, err);
      });
  }

  /**
   * Force a synchronous cache update (for testing or initialization).
   * Returns the payload directly.
   */
  async forceRefresh(limit?: number): Promise<TPayload> {
    const db = tryGetIntelligenceDb();
    if (!db) return this.emptyPayload();

    const payload = await this.querySnapshot(db, limit);
    this.snapshotSeq++;
    const now = Date.now();
    this.cachedSnapshot = {
      viewId: this.viewId,
      cursor: this.snapshotSeq,
      snapshotTimeMs: now,
      payload,
    };
    this.cacheExpiresAt = now + this.cacheTtlMs;
    return payload;
  }
}
