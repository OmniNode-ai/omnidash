/**
 * ONEX Intent Topic Constants
 *
 * Canonical, environment-agnostic topic names for intent-related events.
 * These mirror the constants defined in omnibase_core/topics/onex_intent_topics.py
 *
 * Design Rules (ONEX Convention):
 * - No `dev.` / `staging.` / `prod.` in constants
 * - Core defines WHAT the topic is
 * - Runtime defines WHERE it runs (via env prefix)
 */

// Event: intent classified by intelligence
export const ONEX_EVT_OMNIINTELLIGENCE_INTENT_CLASSIFIED_V1 =
  'onex.evt.omniintelligence.intent-classified.v1';

// Event: intent stored in memory
export const ONEX_EVT_OMNIMEMORY_INTENT_STORED_V1 = 'onex.evt.omnimemory.intent-stored.v1';

// Event: intent query response (memory → dashboard)
export const ONEX_EVT_OMNIMEMORY_INTENT_QUERY_RESPONSE_V1 =
  'onex.evt.omnimemory.intent-query-response.v1';

/**
 * Prepend the environment prefix to a canonical topic name.
 *
 * @example
 * withEnvPrefix('dev', ONEX_EVT_OMNIINTELLIGENCE_INTENT_CLASSIFIED_V1)
 * // => 'dev.onex.evt.omniintelligence.intent-classified.v1'
 */
export function withEnvPrefix(topicEnvPrefix: string, canonicalTopic: string): string {
  return `${topicEnvPrefix}.${canonicalTopic}`;
}

/**
 * Get the topic environment prefix from environment variables.
 * Defaults to 'dev' if not specified.
 */
export function getTopicEnvPrefix(): string {
  return process.env.TOPIC_ENV_PREFIX || 'dev';
}
