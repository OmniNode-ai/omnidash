/**
 * ONEX Topic Constants — Single Source of Truth
 *
 * Canonical topic names for all Kafka topics.
 * The canonical format IS `onex.<kind>.<producer>.<event-name>.v<version>` —
 * these are the real topic names, not suffixes.
 *
 * Legacy topics used a `{env}.` prefix (e.g. `dev.onex.evt...`).
 * New producers emit to the canonical name directly (no env prefix).
 * Constants are still named `SUFFIX_*` for historical reasons.
 *
 *   kind:     evt | cmd | intent | snapshot | dlq
 *   producer: platform | omniclaude | omniintelligence | omnimemory | validation
 *
 * @see omnibase_infra: src/omnibase_infra/topics/topic_resolver.py
 * @see omnibase_infra: src/omnibase_infra/topics/platform_topic_suffixes.py
 */

// ============================================================================
// Topic Kind Type
// ============================================================================

export type OnexTopicKind = 'evt' | 'cmd' | 'intent' | 'snapshot' | 'dlq';

// ============================================================================
// Environment Prefix Resolution
// ============================================================================

/** Legacy environment prefixes (e.g. `dev.`, `staging.`). Old producers prepended these to topic names. Used to strip legacy prefixes from incoming Kafka messages so they match canonical names. */
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
 * Build a legacy-format topic name by prepending the environment prefix.
 * Only needed for compatibility with older producers/consumers that expect
 * the `{env}.{topic}` format. New code should use the canonical name directly.
 *
 * @example
 * resolveTopicName('onex.evt.platform.node-heartbeat.v1')
 * // => 'dev.onex.evt.platform.node-heartbeat.v1'  (legacy format)
 */
export function resolveTopicName(suffix: string, envPrefix?: string): string {
  const prefix = envPrefix ?? getTopicEnvPrefix();
  return `${prefix}.${suffix}`;
}

// ============================================================================
// Environment Prefix Stripping
// ============================================================================

/**
 * Strip a leading environment prefix from a topic name, returning the canonical suffix.
 *
 * If the topic starts with a known environment prefix (e.g. `dev.`, `staging.`),
 * the prefix is removed and the remainder is returned.
 * If no known prefix is found, the input is returned unchanged — this makes it
 * safe to call on topics that are already in canonical (suffix) form.
 *
 * @example
 * extractSuffix('dev.onex.evt.platform.node-heartbeat.v1')
 * // => 'onex.evt.platform.node-heartbeat.v1'
 *
 * extractSuffix('onex.evt.platform.node-heartbeat.v1')
 * // => 'onex.evt.platform.node-heartbeat.v1'  (already canonical, returned as-is)
 *
 * extractSuffix('agent-actions')
 * // => 'agent-actions'  (legacy flat name, no prefix to strip)
 */
export function extractSuffix(topic: string): string {
  for (const prefix of ENVIRONMENT_PREFIXES) {
    const prefixDot = prefix + '.';
    if (topic.startsWith(prefixDot)) {
      return topic.slice(prefixDot.length);
    }
  }
  return topic;
}

/**
 * Look up a value from a topic-keyed map, normalizing env-prefixed topics first.
 *
 * Tries the raw topic key first for exact matches (works for legacy flat names
 * and canonical suffixes), then strips any env prefix and retries.
 *
 * Use this instead of direct `map[topic]` access when the topic may arrive with
 * an environment prefix (e.g. `dev.onex.evt...`) but the map is keyed by
 * canonical suffix (`onex.evt...`).
 *
 * @example
 * const meta = lookupByTopic(TOPIC_METADATA, 'dev.onex.evt.platform.node-heartbeat.v1');
 * // Finds the entry keyed by 'onex.evt.platform.node-heartbeat.v1'
 */
export function lookupByTopic<T>(map: Record<string, T>, topic: string): T | undefined {
  const direct = map[topic];
  if (direct !== undefined) return direct;

  const suffix = extractSuffix(topic);
  if (suffix !== topic) {
    return map[suffix];
  }

  return undefined;
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

/** Contract lifecycle events */
export const SUFFIX_CONTRACT_REGISTERED = 'onex.evt.platform.contract-registered.v1';
export const SUFFIX_CONTRACT_DEREGISTERED = 'onex.evt.platform.contract-deregistered.v1';

/** Granular node registration lifecycle events */
export const SUFFIX_NODE_REGISTRATION_INITIATED =
  'onex.evt.platform.node-registration-initiated.v1';
export const SUFFIX_NODE_REGISTRATION_ACCEPTED = 'onex.evt.platform.node-registration-accepted.v1';
export const SUFFIX_NODE_REGISTRATION_REJECTED = 'onex.evt.platform.node-registration-rejected.v1';

/** Dual-confirmation ACK flow events */
export const SUFFIX_NODE_REGISTRATION_ACKED = 'onex.cmd.platform.node-registration-acked.v1';
export const SUFFIX_NODE_REGISTRATION_RESULT = 'onex.evt.platform.node-registration-result.v1';
export const SUFFIX_NODE_REGISTRATION_ACK_RECEIVED =
  'onex.evt.platform.node-registration-ack-received.v1';
export const SUFFIX_NODE_REGISTRATION_ACK_TIMED_OUT =
  'onex.evt.platform.node-registration-ack-timed-out.v1';

/** Registry announces it wants nodes to re-introspect (evt counterpart to the cmd variant) */
export const SUFFIX_REGISTRY_REQUEST_INTROSPECTION =
  'onex.evt.platform.registry-request-introspection.v1';

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
export const SUFFIX_INTELLIGENCE_TOOL_CONTENT = 'onex.cmd.omniintelligence.tool-content.v1';

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

/** Routing decision events emitted by the agent router. */
export const LEGACY_AGENT_ROUTING_DECISIONS = 'agent-routing-decisions';
/** Tool calls, decisions, errors, and successes from agent execution. */
export const LEGACY_AGENT_ACTIONS = 'agent-actions';
/** Polymorphic agent transformation lifecycle events. */
export const LEGACY_AGENT_TRANSFORMATION_EVENTS = 'agent-transformation-events';
/** Routing performance metrics and cache statistics. */
export const LEGACY_ROUTER_PERFORMANCE_METRICS = 'router-performance-metrics';
/** Manifest injection snapshots (offline capture only, not in live consumer). */
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
  SUFFIX_REGISTRY_REQUEST_INTROSPECTION,
  SUFFIX_NODE_BECAME_ACTIVE,
  SUFFIX_NODE_LIVENESS_EXPIRED,
  SUFFIX_NODE_HEARTBEAT,
  SUFFIX_CONTRACT_REGISTERED,
  SUFFIX_CONTRACT_DEREGISTERED,
  SUFFIX_NODE_REGISTRATION_INITIATED,
  SUFFIX_NODE_REGISTRATION_ACCEPTED,
  SUFFIX_NODE_REGISTRATION_REJECTED,
  SUFFIX_NODE_REGISTRATION_ACKED,
  SUFFIX_NODE_REGISTRATION_RESULT,
  SUFFIX_NODE_REGISTRATION_ACK_RECEIVED,
  SUFFIX_NODE_REGISTRATION_ACK_TIMED_OUT,
  SUFFIX_REGISTRATION_SNAPSHOTS,
  SUFFIX_FSM_STATE_TRANSITIONS,
  SUFFIX_RUNTIME_TICK,
] as const;

/** OmniClaude lifecycle topic suffixes */
export const OMNICLAUDE_SUFFIXES = [
  SUFFIX_OMNICLAUDE_PROMPT_SUBMITTED,
  SUFFIX_OMNICLAUDE_SESSION_STARTED,
  SUFFIX_OMNICLAUDE_SESSION_ENDED,
  SUFFIX_OMNICLAUDE_TOOL_EXECUTED,
] as const;

/** OmniClaude injection/extraction pipeline topic suffixes (OMN-1804) */
export const OMNICLAUDE_INJECTION_SUFFIXES = [
  SUFFIX_OMNICLAUDE_CONTEXT_UTILIZATION,
  SUFFIX_OMNICLAUDE_AGENT_MATCH,
  SUFFIX_OMNICLAUDE_LATENCY_BREAKDOWN,
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
 * Legacy agent topics use flat names (e.g. `agent-actions`).
 * Canonical ONEX topics are subscribed by their canonical name directly
 * (e.g. `onex.evt.platform.node-heartbeat.v1`).
 *
 * Note: LEGACY_AGENT_MANIFEST_INJECTIONS is deliberately excluded from the live
 * consumer subscription (it is not consumed at runtime). The recording script
 * (scripts/record-events.ts) manually appends it for offline capture/replay.
 *
 * @returns Array of topic strings suitable for passing to Kafka `consumer.subscribe()`
 */
export function buildSubscriptionTopics(): string[] {
  return [
    // Legacy agent topics (flat names, no prefix)
    ...LEGACY_AGENT_TOPICS,
    // Canonical ONEX topics (subscribed by canonical name)
    ...PLATFORM_NODE_SUFFIXES,
    SUFFIX_INTELLIGENCE_CLAUDE_HOOK,
    SUFFIX_INTELLIGENCE_TOOL_CONTENT,
    ...OMNICLAUDE_SUFFIXES,
    ...OMNICLAUDE_INJECTION_SUFFIXES,
    ...INTENT_SUFFIXES,
    ...VALIDATION_SUFFIXES,
  ];
}
