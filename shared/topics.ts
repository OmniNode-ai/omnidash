/**
 * ONEX Topic Constants — Single Source of Truth
 *
 * Canonical, environment-agnostic topic suffixes for all Kafka topics.
 * Constants store SUFFIXES only (no env prefix).
 * Full topic names are built at runtime via `resolveTopicName()`.
 *
 * Format: onex.<kind>.<producer>.<event-name>.v<version>
 *   kind:     evt | cmd | intent | snapshot | dlq
 *   producer: platform | omniclaude | omniintelligence | omnimemory | validation
 *
 * @see omnibase_infra2/src/omnibase_infra/topics/topic_resolver.py
 * @see omnibase_infra/src/omnibase_infra/topics/platform_topic_suffixes.py
 */

// ============================================================================
// Topic Kind Type
// ============================================================================

export type OnexTopicKind = 'evt' | 'cmd' | 'intent' | 'snapshot' | 'dlq';

// ============================================================================
// Environment Prefix Resolution
// ============================================================================

/** Environment prefixes used in canonical topic names -- used to filter junk values from upstream producers */
export const ENVIRONMENT_PREFIXES = [
  'dev',
  'staging',
  'prod',
  'production',
  'test',
  'local',
] as const;
export type EnvironmentPrefix = (typeof ENVIRONMENT_PREFIXES)[number];

/**
 * Get the topic environment prefix from environment variables.
 * Defaults to 'dev' if not specified.
 *
 * **Client-side (browser)**: Vite replaces `process.env.*` at build time.
 * Since TOPIC_ENV_PREFIX / ONEX_ENV are not in the Vite define list,
 * the browser bundle always resolves to `'dev'`.
 *
 * **Server-side**: Reads from `TOPIC_ENV_PREFIX` or `ONEX_ENV` env vars.
 * These must be set BEFORE any module that imports from this file is evaluated,
 * because topic constants are resolved at module load time (not lazily).
 */
export function getTopicEnvPrefix(): string {
  if (typeof process !== 'undefined' && process.env !== undefined) {
    const prefix = process.env.TOPIC_ENV_PREFIX ?? process.env.ONEX_ENV;
    return prefix !== undefined && prefix !== '' ? prefix : 'dev';
  }
  return 'dev';
}

/**
 * Build a full topic name by prepending the environment prefix to a canonical suffix.
 *
 * @example
 * resolveTopicName('onex.evt.platform.node-heartbeat.v1')
 * // => 'dev.onex.evt.platform.node-heartbeat.v1'
 */
export function resolveTopicName(suffix: string, envPrefix?: string): string {
  const prefix = envPrefix ?? getTopicEnvPrefix();
  return `${prefix}.${suffix}`;
}

// ============================================================================
// Platform Topics (from omnibase_infra platform_topic_suffixes.py)
// ============================================================================

export const SUFFIX_NODE_REGISTRATION = 'onex.evt.platform.node-registration.v1';
export const SUFFIX_NODE_INTROSPECTION = 'onex.evt.platform.node-introspection.v1';
export const SUFFIX_NODE_HEARTBEAT = 'onex.evt.platform.node-heartbeat.v1';
export const SUFFIX_REQUEST_INTROSPECTION = 'onex.cmd.platform.request-introspection.v1';
export const SUFFIX_FSM_STATE_TRANSITIONS = 'onex.evt.platform.fsm-state-transitions.v1';
export const SUFFIX_RUNTIME_TICK = 'onex.intent.platform.runtime-tick.v1';
export const SUFFIX_REGISTRATION_SNAPSHOTS = 'onex.snapshot.platform.registration-snapshots.v1';

/** Platform node lifecycle events consumed by the dashboard */
export const SUFFIX_NODE_BECAME_ACTIVE = 'onex.evt.platform.node-became-active.v1';
export const SUFFIX_NODE_LIVENESS_EXPIRED = 'onex.evt.platform.node-liveness-expired.v1';

// ============================================================================
// OmniClaude Topics
// ============================================================================

export const SUFFIX_OMNICLAUDE_PROMPT_SUBMITTED = 'onex.evt.omniclaude.prompt-submitted.v1';
export const SUFFIX_OMNICLAUDE_SESSION_STARTED = 'onex.evt.omniclaude.session-started.v1';
export const SUFFIX_OMNICLAUDE_SESSION_ENDED = 'onex.evt.omniclaude.session-ended.v1';
export const SUFFIX_OMNICLAUDE_TOOL_EXECUTED = 'onex.evt.omniclaude.tool-executed.v1';
export const SUFFIX_OMNICLAUDE_CONTEXT_UTILIZATION = 'onex.evt.omniclaude.context-utilization.v1';
export const SUFFIX_OMNICLAUDE_AGENT_MATCH = 'onex.evt.omniclaude.agent-match.v1';
export const SUFFIX_OMNICLAUDE_LATENCY_BREAKDOWN = 'onex.evt.omniclaude.latency-breakdown.v1';

// ============================================================================
// OmniIntelligence Topics
// ============================================================================

export const SUFFIX_INTELLIGENCE_CLAUDE_HOOK = 'onex.cmd.omniintelligence.claude-hook-event.v1';
export const SUFFIX_INTELLIGENCE_INTENT_CLASSIFIED =
  'onex.evt.omniintelligence.intent-classified.v1';
export const SUFFIX_INTELLIGENCE_SESSION_OUTCOME_CMD =
  'onex.cmd.omniintelligence.session-outcome.v1';
export const SUFFIX_INTELLIGENCE_SESSION_OUTCOME_EVT =
  'onex.evt.omniintelligence.session-outcome.v1';
export const SUFFIX_INTELLIGENCE_PATTERN_SCORED = 'onex.evt.omniintelligence.pattern-scored.v1';
export const SUFFIX_INTELLIGENCE_PATTERN_DISCOVERED =
  'onex.evt.omniintelligence.pattern-discovered.v1';
export const SUFFIX_INTELLIGENCE_PATTERN_LEARNED = 'onex.evt.omniintelligence.pattern-learned.v1';

// ============================================================================
// OmniMemory Topics
// ============================================================================

export const SUFFIX_MEMORY_INTENT_STORED = 'onex.evt.omnimemory.intent-stored.v1';
export const SUFFIX_MEMORY_INTENT_QUERY_RESPONSE = 'onex.evt.omnimemory.intent-query-response.v1';
export const SUFFIX_MEMORY_INTENT_QUERY_REQUESTED = 'onex.cmd.omnimemory.intent-query-requested.v1';

// ============================================================================
// Validation Topics (canonical format per topic_resolver.py)
// ============================================================================

export const SUFFIX_VALIDATION_RUN_STARTED = 'onex.evt.validation.cross-repo-run-started.v1';
export const SUFFIX_VALIDATION_VIOLATIONS_BATCH =
  'onex.evt.validation.cross-repo-violations-batch.v1';
export const SUFFIX_VALIDATION_RUN_COMPLETED = 'onex.evt.validation.cross-repo-run-completed.v1';

// ============================================================================
// Legacy Agent Topics (flat names, no ONEX convention)
// These do NOT get an env prefix — used as-is.
// ============================================================================

export const LEGACY_AGENT_ROUTING_DECISIONS = 'agent-routing-decisions';
export const LEGACY_AGENT_ACTIONS = 'agent-actions';
export const LEGACY_AGENT_TRANSFORMATION_EVENTS = 'agent-transformation-events';
export const LEGACY_ROUTER_PERFORMANCE_METRICS = 'router-performance-metrics';
export const LEGACY_AGENT_MANIFEST_INJECTIONS = 'agent-manifest-injections';

// ============================================================================
// Topic Groups (for subscription lists)
// ============================================================================

/** Legacy agent topics (no env prefix) */
export const LEGACY_AGENT_TOPICS = [
  LEGACY_AGENT_ROUTING_DECISIONS,
  LEGACY_AGENT_ACTIONS,
  LEGACY_AGENT_TRANSFORMATION_EVENTS,
  LEGACY_ROUTER_PERFORMANCE_METRICS,
] as const;

/** Platform node topic suffixes consumed by the dashboard */
export const PLATFORM_NODE_SUFFIXES = [
  SUFFIX_NODE_INTROSPECTION,
  SUFFIX_NODE_REGISTRATION,
  SUFFIX_REQUEST_INTROSPECTION,
  SUFFIX_NODE_BECAME_ACTIVE,
  SUFFIX_NODE_LIVENESS_EXPIRED,
  SUFFIX_NODE_HEARTBEAT,
] as const;

/** OmniClaude lifecycle topic suffixes */
export const OMNICLAUDE_SUFFIXES = [
  SUFFIX_OMNICLAUDE_PROMPT_SUBMITTED,
  SUFFIX_OMNICLAUDE_SESSION_STARTED,
  SUFFIX_OMNICLAUDE_SESSION_ENDED,
  SUFFIX_OMNICLAUDE_TOOL_EXECUTED,
] as const;

/** Intent topic suffixes */
export const INTENT_SUFFIXES = [
  SUFFIX_INTELLIGENCE_INTENT_CLASSIFIED,
  SUFFIX_MEMORY_INTENT_STORED,
  SUFFIX_MEMORY_INTENT_QUERY_RESPONSE,
] as const;

/** Validation topic suffixes */
export const VALIDATION_SUFFIXES = [
  SUFFIX_VALIDATION_RUN_STARTED,
  SUFFIX_VALIDATION_VIOLATIONS_BATCH,
  SUFFIX_VALIDATION_RUN_COMPLETED,
] as const;

/**
 * Build the complete subscription topic list for the event consumer.
 * Combines legacy topics (used as-is) with canonical topics (env-prefixed).
 *
 * Note: LEGACY_AGENT_MANIFEST_INJECTIONS is deliberately excluded from the live
 * consumer subscription (it is not consumed at runtime). The recording script
 * (scripts/record-events.ts) manually appends it for offline capture/replay.
 */
export function buildSubscriptionTopics(envPrefix?: string): string[] {
  const prefix = envPrefix ?? getTopicEnvPrefix();
  return [
    // Legacy agent topics (no prefix)
    ...LEGACY_AGENT_TOPICS,
    // Platform node topics
    ...PLATFORM_NODE_SUFFIXES.map((s) => resolveTopicName(s, prefix)),
    // OmniClaude topics
    ...[SUFFIX_INTELLIGENCE_CLAUDE_HOOK].map((s) => resolveTopicName(s, prefix)),
    ...OMNICLAUDE_SUFFIXES.map((s) => resolveTopicName(s, prefix)),
    // Intent topics
    ...INTENT_SUFFIXES.map((s) => resolveTopicName(s, prefix)),
    // Validation topics
    ...VALIDATION_SUFFIXES.map((s) => resolveTopicName(s, prefix)),
  ];
}
