/**
 * Centralized Query Key Factory for TanStack Query
 *
 * Provides consistent, type-safe cache keys across the application.
 * Using a factory pattern ensures:
 * - Consistent key structure for cache management
 * - Easy cache invalidation with hierarchical keys
 * - Type safety and autocomplete support
 * - Single source of truth for query keys
 *
 * @see https://tanstack.com/query/latest/docs/framework/react/community/lukemorales-query-key-factory
 *
 * @example
 * ```ts
 * import { queryKeys } from '@/lib/query-keys';
 *
 * // In a component
 * const { data } = useQuery({
 *   queryKey: queryKeys.patlearn.summary('24h'),
 *   queryFn: () => patlearnSource.summary('24h'),
 * });
 *
 * // For cache invalidation
 * queryClient.invalidateQueries({ queryKey: queryKeys.patlearn.all });
 * ```
 */

export const queryKeys = {
  // ============================================================================
  // PATLEARN Patterns
  // ============================================================================

  patlearn: {
    /** Base key for all PATLEARN queries - use for broad invalidation */
    all: ['patlearn'] as const,

    /** List queries base */
    lists: () => [...queryKeys.patlearn.all, 'list'] as const,

    /** Filtered list query */
    list: (filter: string) => [...queryKeys.patlearn.lists(), filter] as const,

    /** Summary queries base */
    summaries: () => [...queryKeys.patlearn.all, 'summary'] as const,

    /** Summary for a specific time window */
    summary: (window: string) => [...queryKeys.patlearn.summaries(), window] as const,

    /** Detail queries base */
    details: () => [...queryKeys.patlearn.all, 'detail'] as const,

    /** Single pattern detail */
    detail: (id: string) => [...queryKeys.patlearn.details(), id] as const,

    /** Score evidence for a pattern */
    evidence: (id: string) => [...queryKeys.patlearn.all, 'evidence', id] as const,
  },

  // ============================================================================
  // Agent Operations
  // ============================================================================

  agents: {
    /** Base key for all agent queries */
    all: ['agents'] as const,

    /** List of agents */
    lists: () => [...queryKeys.agents.all, 'list'] as const,

    /** Filtered agent list */
    list: (filter?: string) => [...queryKeys.agents.lists(), filter ?? 'all'] as const,

    /** Agent summaries */
    summaries: () => [...queryKeys.agents.all, 'summary'] as const,

    /** Summary for a specific scope */
    summary: (scope: string) => [...queryKeys.agents.summaries(), scope] as const,

    /** Single agent detail */
    detail: (id: string) => [...queryKeys.agents.all, 'detail', id] as const,

    /** Agent actions */
    actions: (agentId?: string) =>
      agentId
        ? ([...queryKeys.agents.all, 'actions', agentId] as const)
        : ([...queryKeys.agents.all, 'actions'] as const),
  },

  // ============================================================================
  // Events
  // ============================================================================

  events: {
    /** Base key for all event queries */
    all: ['events'] as const,

    /** Recent events */
    recent: (limit?: number) => [...queryKeys.events.all, 'recent', limit ?? 50] as const,

    /** Events by type */
    byType: (type: string) => [...queryKeys.events.all, 'type', type] as const,

    /** Event stream/subscription */
    stream: () => [...queryKeys.events.all, 'stream'] as const,
  },

  // ============================================================================
  // Intelligence
  // ============================================================================

  intelligence: {
    /** Base key for all intelligence queries */
    all: ['intelligence'] as const,

    /** Summary metrics */
    summary: () => [...queryKeys.intelligence.all, 'summary'] as const,

    /** Quality metrics */
    quality: () => [...queryKeys.intelligence.all, 'quality'] as const,

    /** Routing metrics */
    routing: () => [...queryKeys.intelligence.all, 'routing'] as const,
  },

  // ============================================================================
  // Health Monitoring
  // ============================================================================

  health: {
    /** Base key for all health queries */
    all: ['health'] as const,

    /** Overall system health */
    system: () => [...queryKeys.health.all, 'system'] as const,

    /** Service-specific health */
    service: (serviceName: string) => [...queryKeys.health.all, 'service', serviceName] as const,

    /** Database health */
    database: () => [...queryKeys.health.all, 'database'] as const,

    /** Kafka/event bus health */
    eventBus: () => [...queryKeys.health.all, 'event-bus'] as const,
  },

  // ============================================================================
  // Registry & Discovery
  // ============================================================================

  registry: {
    /** Base key for all registry queries */
    all: ['registry'] as const,

    /** Node registry */
    nodes: () => [...queryKeys.registry.all, 'nodes'] as const,

    /** Single node detail */
    node: (nodeId: string) => [...queryKeys.registry.all, 'node', nodeId] as const,

    /** Service discovery */
    services: () => [...queryKeys.registry.all, 'services'] as const,
  },
} as const;

/**
 * Type helper for query keys
 */
export type QueryKeys = typeof queryKeys;
