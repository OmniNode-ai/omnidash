/**
 * Query Configuration Constants
 *
 * Centralized configuration for TanStack Query polling intervals and cache times.
 * These constants ensure consistent behavior across all dashboard queries.
 */

// ============================================================================
// Polling Intervals (refetchInterval)
// ============================================================================

/**
 * Very fast polling for health monitoring and critical real-time data
 * Use for: Service health checks, system status
 */
export const POLLING_INTERVAL_FAST = 10_000; // 10 seconds

/**
 * Fast polling for frequently updated data
 * Use for: Live dashboards, health monitoring
 */
export const POLLING_INTERVAL_STANDARD = 15_000; // 15 seconds

/**
 * Standard polling for real-time updates
 * Use for: Agent operations, recent actions, event streams
 */
export const POLLING_INTERVAL_MEDIUM = 30_000; // 30 seconds

/**
 * Slower polling for less frequently updated data
 * Use for: Pattern learning, code intelligence, analytics
 */
export const POLLING_INTERVAL_SLOW = 60_000; // 60 seconds (1 minute)

/**
 * Very slow polling for rarely updated data
 * Use for: Knowledge graphs, architecture networks
 */
export const POLLING_INTERVAL_VERY_SLOW = 120_000; // 2 minutes

// ============================================================================
// Stale Time (staleTime)
// ============================================================================

/**
 * Data is immediately stale (always refetch on mount)
 * Use for: Rapidly changing data that must be fresh
 */
export const STALE_TIME_IMMEDIATE = 0;

/**
 * Data stays fresh for 10 seconds
 * Use for: Health monitoring, system status
 */
export const STALE_TIME_SHORT = 10_000; // 10 seconds

/**
 * Data stays fresh for 15 seconds
 * Use for: Agent operations, live dashboards
 */
export const STALE_TIME_STANDARD = 15_000; // 15 seconds

/**
 * Data stays fresh for 30 seconds
 * Use for: Most dashboard queries
 */
export const STALE_TIME_MEDIUM = 30_000; // 30 seconds

/**
 * Data stays fresh for 1 minute
 * Use for: Analytics, reports, less critical data
 */
export const STALE_TIME_LONG = 60_000; // 60 seconds (1 minute)

// ============================================================================
// Throttle and Debounce
// ============================================================================

/**
 * Minimum time between query invalidations to prevent excessive re-renders
 * Use for: WebSocket message handlers, real-time updates
 */
export const QUERY_INVALIDATION_THROTTLE_MS = 1_000; // 1 second

// ============================================================================
// Cache Time (gcTime)
// ============================================================================

/**
 * How long to keep unused query data in cache
 * Default: 5 minutes (set in queryClient.ts)
 */
export const CACHE_TIME_DEFAULT = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// Common Patterns
// ============================================================================

/**
 * Standard configuration for real-time dashboards
 */
export const REALTIME_QUERY_CONFIG = {
  refetchInterval: POLLING_INTERVAL_MEDIUM,
  staleTime: STALE_TIME_STANDARD,
} as const;

/**
 * Standard configuration for analytics/reporting
 */
export const ANALYTICS_QUERY_CONFIG = {
  refetchInterval: POLLING_INTERVAL_SLOW,
  staleTime: STALE_TIME_LONG,
} as const;

/**
 * Standard configuration for health monitoring
 */
export const HEALTH_QUERY_CONFIG = {
  refetchInterval: POLLING_INTERVAL_STANDARD,
  staleTime: STALE_TIME_SHORT,
} as const;

/**
 * Configuration for rarely updated data (patterns, knowledge graphs)
 */
export const STATIC_QUERY_CONFIG = {
  refetchInterval: POLLING_INTERVAL_SLOW,
  staleTime: STALE_TIME_LONG,
} as const;

/**
 * Helper to get polling interval, returning false in test environment to prevent infinite loops
 * Use this instead of directly using POLLING_INTERVAL_* constants in components
 */
export function getPollingInterval(interval: number): number | false {
  // Disable polling in test environment
  if (typeof import.meta !== 'undefined' && (import.meta.env?.VITEST === true || import.meta.env?.VITEST === 'true')) {
    return false;
  }
  return interval;
}
