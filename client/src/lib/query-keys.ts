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

  /**
   * PATLEARN Pattern query keys for code pattern learning dashboard
   *
   * Hierarchical key structure enables targeted cache invalidation:
   * - `all` invalidates everything (patterns, summaries, evidence)
   * - `lists()` invalidates only list queries
   * - `summaries()` invalidates only summary queries
   * - `details()` invalidates only detail queries
   *
   * @example Invalidate all PATLEARN queries after mutation
   * ```ts
   * queryClient.invalidateQueries({ queryKey: queryKeys.patlearn.all });
   * ```
   *
   * @example Invalidate only list queries (keeps summary/detail cached)
   * ```ts
   * queryClient.invalidateQueries({ queryKey: queryKeys.patlearn.lists() });
   * ```
   *
   * @example Invalidate a specific pattern's detail
   * ```ts
   * queryClient.invalidateQueries({ queryKey: queryKeys.patlearn.detail(patternId) });
   * ```
   *
   * @example Invalidate all summaries when time window changes
   * ```ts
   * queryClient.invalidateQueries({ queryKey: queryKeys.patlearn.summaries() });
   * ```
   *
   * @example Prefetch pattern evidence before navigation
   * ```ts
   * queryClient.prefetchQuery({
   *   queryKey: queryKeys.patlearn.evidence(patternId),
   *   queryFn: () => patlearnSource.evidence(patternId),
   * });
   * ```
   */
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

  /**
   * Agent operation query keys for monitoring AI agents
   *
   * Supports 52+ AI agents with hierarchical invalidation:
   * - `all` invalidates all agent data
   * - `lists()` invalidates agent lists only
   * - `summaries()` invalidates summary metrics
   * - `actions(agentId?)` invalidates action logs (all or specific agent)
   *
   * @example Invalidate all agent data after configuration change
   * ```ts
   * queryClient.invalidateQueries({ queryKey: queryKeys.agents.all });
   * ```
   *
   * @example Refetch a single agent's actions after it completes work
   * ```ts
   * queryClient.invalidateQueries({ queryKey: queryKeys.agents.actions(agentId) });
   * ```
   *
   * @example Invalidate all action logs across all agents
   * ```ts
   * queryClient.invalidateQueries({ queryKey: queryKeys.agents.actions() });
   * ```
   *
   * @example Update only agent summaries (keep detail views cached)
   * ```ts
   * queryClient.invalidateQueries({ queryKey: queryKeys.agents.summaries() });
   * ```
   *
   * @example Force refetch a specific agent's detail
   * ```ts
   * queryClient.refetchQueries({ queryKey: queryKeys.agents.detail(agentId) });
   * ```
   */
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

  /**
   * Event query keys for Kafka/Redpanda event flow monitoring
   *
   * Keys support real-time event streaming and historical queries:
   * - `all` invalidates all event data
   * - `recent(limit?)` for paginated recent events
   * - `byType(type)` for filtered event queries
   * - `stream()` for WebSocket subscription state
   *
   * @example Invalidate all event data
   * ```ts
   * queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
   * ```
   *
   * @example Clear recent events cache when switching time windows
   * ```ts
   * queryClient.invalidateQueries({ queryKey: queryKeys.events.recent() });
   * // This invalidates recent(50), recent(100), etc.
   * ```
   *
   * @example Invalidate events of a specific type
   * ```ts
   * queryClient.invalidateQueries({
   *   queryKey: queryKeys.events.byType('agent-routing-decisions'),
   * });
   * ```
   *
   * @example Reset stream subscription state on reconnect
   * ```ts
   * queryClient.resetQueries({ queryKey: queryKeys.events.stream() });
   * ```
   */
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

  /**
   * Intelligence operation query keys for AI/ML metrics
   *
   * Covers 168+ AI operations with summary, quality, and routing metrics:
   * - `all` invalidates all intelligence data
   * - `summary()` for high-level operation metrics
   * - `quality()` for code quality gate results
   * - `routing()` for agent routing decision metrics
   *
   * @example Invalidate all intelligence data after bulk operation
   * ```ts
   * queryClient.invalidateQueries({ queryKey: queryKeys.intelligence.all });
   * ```
   *
   * @example Refresh only quality metrics after code analysis
   * ```ts
   * queryClient.invalidateQueries({ queryKey: queryKeys.intelligence.quality() });
   * ```
   *
   * @example Update routing metrics after agent configuration change
   * ```ts
   * queryClient.invalidateQueries({ queryKey: queryKeys.intelligence.routing() });
   * ```
   *
   * @example Refetch summary without affecting other intelligence queries
   * ```ts
   * queryClient.refetchQueries({ queryKey: queryKeys.intelligence.summary() });
   * ```
   */
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

  /**
   * Health monitoring query keys for platform observability
   *
   * Supports system-wide and service-specific health checks:
   * - `all` invalidates all health data (use sparingly)
   * - `system()` for overall platform health
   * - `service(name)` for individual service health
   * - `database()` for PostgreSQL connection health
   * - `eventBus()` for Kafka/Redpanda health
   *
   * @example Invalidate all health data after infrastructure change
   * ```ts
   * queryClient.invalidateQueries({ queryKey: queryKeys.health.all });
   * ```
   *
   * @example Refresh a specific service's health status
   * ```ts
   * queryClient.invalidateQueries({
   *   queryKey: queryKeys.health.service('archon-intelligence'),
   * });
   * ```
   *
   * @example Force recheck database connectivity
   * ```ts
   * queryClient.refetchQueries({ queryKey: queryKeys.health.database() });
   * ```
   *
   * @example Invalidate event bus health after Kafka reconnect
   * ```ts
   * queryClient.invalidateQueries({ queryKey: queryKeys.health.eventBus() });
   * ```
   *
   * @example Poll system health more frequently during incident
   * ```ts
   * queryClient.setQueryDefaults(queryKeys.health.system(), {
   *   refetchInterval: 5000, // 5 seconds during incident
   * });
   * ```
   */
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

  /**
   * Registry and service discovery query keys
   *
   * Covers ONEX node registry and service discovery:
   * - `all` invalidates all registry data
   * - `nodes()` for node listing queries
   * - `node(id)` for individual node details
   * - `services()` for service discovery data
   *
   * @example Invalidate all registry data after deployment
   * ```ts
   * queryClient.invalidateQueries({ queryKey: queryKeys.registry.all });
   * ```
   *
   * @example Refresh node list after new node registration
   * ```ts
   * queryClient.invalidateQueries({ queryKey: queryKeys.registry.nodes() });
   * ```
   *
   * @example Invalidate a specific node's cached data
   * ```ts
   * queryClient.invalidateQueries({
   *   queryKey: queryKeys.registry.node(nodeId),
   * });
   * ```
   *
   * @example Update services after Consul sync
   * ```ts
   * queryClient.invalidateQueries({ queryKey: queryKeys.registry.services() });
   * ```
   *
   * @example Remove stale node from cache
   * ```ts
   * queryClient.removeQueries({ queryKey: queryKeys.registry.node(staleNodeId) });
   * ```
   */
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
  // ============================================================================
  // Validation
  // ============================================================================

  /**
   * Cross-repo validation query keys for validation dashboard
   */
  validation: {
    /** Base key for all validation queries */
    all: ['validation'] as const,

    /** Summary stats */
    summary: () => [...queryKeys.validation.all, 'summary'] as const,

    /** Run lists */
    lists: () => [...queryKeys.validation.all, 'list'] as const,

    /** Filtered run list */
    list: (filter: string) => [...queryKeys.validation.lists(), filter] as const,

    /** Single run detail */
    detail: (runId: string) => [...queryKeys.validation.all, 'detail', runId] as const,

    /** Per-repo trends */
    trends: (repo: string) => [...queryKeys.validation.all, 'trends', repo] as const,
  },
  // ============================================================================
  // Extraction Pipeline (OMN-1804)
  // ============================================================================

  /**
   * Extraction pipeline query keys for pattern extraction metrics dashboard.
   *
   * Supports WebSocket invalidation: on EXTRACTION_INVALIDATE, invalidate
   * `queryKeys.extraction.all` to refetch all panels.
   */
  extraction: {
    /** Base key for all extraction queries */
    all: ['extraction'] as const,

    /** Summary stats (metric cards) */
    summary: () => [...queryKeys.extraction.all, 'summary'] as const,

    /** Pipeline health by stage */
    health: () => [...queryKeys.extraction.all, 'health'] as const,

    /** Latency heatmap */
    latency: (window: string) => [...queryKeys.extraction.all, 'latency', window] as const,

    /** Pattern volume over time */
    volume: (window: string) => [...queryKeys.extraction.all, 'volume', window] as const,

    /** Error rates summary */
    errors: () => [...queryKeys.extraction.all, 'errors'] as const,
  },
  // ============================================================================
  // Injection Effectiveness (OMN-1891)
  // ============================================================================

  effectiveness: {
    /** Base key for all effectiveness queries */
    all: ['effectiveness'] as const,

    /** Executive summary */
    summary: () => [...queryKeys.effectiveness.all, 'summary'] as const,

    /** Auto-throttle status */
    throttle: () => [...queryKeys.effectiveness.all, 'throttle'] as const,

    /** Latency details */
    latency: () => [...queryKeys.effectiveness.all, 'latency'] as const,

    /** Utilization analytics */
    utilization: () => [...queryKeys.effectiveness.all, 'utilization'] as const,

    /** A/B comparison */
    ab: () => [...queryKeys.effectiveness.all, 'ab'] as const,

    /** Multi-metric trend */
    trend: () => [...queryKeys.effectiveness.all, 'trend'] as const,
  },
  // ============================================================================
  // Projections (OMN-2095)
  // ============================================================================

  /**
   * Projection query keys for server-side materialized views.
   *
   * Used by `useProjectionStream` hook for TanStack Query cache management.
   * On PROJECTION_INVALIDATE, invalidate the specific view's snapshot.
   */
  projections: {
    /** Base key for all projection queries */
    all: ['projections'] as const,

    /** All queries for a specific view */
    view: (viewId: string) => [...queryKeys.projections.all, viewId] as const,

    /** Snapshot query for a view */
    snapshot: (viewId: string, limit?: number) =>
      [...queryKeys.projections.view(viewId), 'snapshot', limit ?? 'default'] as const,

    /** Events-since query for a view */
    events: (viewId: string, cursor: number) =>
      [...queryKeys.projections.view(viewId), 'events', cursor] as const,
  },

  // ============================================================================
  // Learned Insights (OMN-1407)
  // ============================================================================

  insights: {
    /** Base key for all insights queries */
    all: ['insights'] as const,

    /** Insights summary with full insight list */
    summary: () => [...queryKeys.insights.all, 'summary'] as const,

    /** Insight discovery trend */
    trend: () => [...queryKeys.insights.all, 'trend'] as const,
  },
} as const;

/**
 * Type helper for query keys
 */
export type QueryKeys = typeof queryKeys;
