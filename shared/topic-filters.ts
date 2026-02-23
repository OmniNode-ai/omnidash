/**
 * Topic Filtering & Domain Classification (OMN-2082)
 *
 * Shared denylist and domain classification logic for the Topics tab
 * in the Platform Registry. Used by both server and client code.
 *
 * - isLegacyPrefixedTopic: filters out topics with env prefixes (dev., staging., etc.)
 * - classifyTopicDomain: groups topics by producer domain for UI display
 */

import { ENVIRONMENT_PREFIXES } from './topics';

// ============================================================================
// Legacy Topic Filtering
// ============================================================================

/**
 * Returns true if the topic has a legacy environment prefix (dev., staging., etc.).
 *
 * Legacy producers prepended an environment segment to topic names. These are
 * filtered from the Topics tab to show only canonical topic names.
 *
 * @example
 * isLegacyPrefixedTopic('dev.onex.evt.platform.node-heartbeat.v1') // true
 * isLegacyPrefixedTopic('onex.evt.platform.node-heartbeat.v1')     // false
 * isLegacyPrefixedTopic('agent-actions')                           // false
 */
export function isLegacyPrefixedTopic(topic: string): boolean {
  const firstSegment = topic.split('.')[0];
  return ENVIRONMENT_PREFIXES.includes(firstSegment as (typeof ENVIRONMENT_PREFIXES)[number]);
}

// ============================================================================
// Domain Classification
// ============================================================================

/** Domain classification for topic grouping in the registry UI */
export type TopicDomain = 'platform' | 'omniclaude' | 'agent' | 'other';

/**
 * Classify a topic into a domain group based on its name segments.
 *
 * Classification rules:
 * - Contains `.platform.`    -> platform
 * - Contains `.omniclaude.`  -> omniclaude
 * - No dots (flat name) OR starts with `agent-` -> agent (legacy flat topics)
 * - Everything else          -> other
 *
 * @example
 * classifyTopicDomain('onex.evt.platform.node-heartbeat.v1')     // 'platform'
 * classifyTopicDomain('onex.evt.omniclaude.session-started.v1')  // 'omniclaude'
 * classifyTopicDomain('agent-routing-decisions')                  // 'agent'
 * classifyTopicDomain('router-performance-metrics')               // 'agent'
 * classifyTopicDomain('onex.evt.validation.cross-repo-run.v1')   // 'other'
 */
export function classifyTopicDomain(topic: string): TopicDomain {
  if (topic.includes('.platform.')) return 'platform';
  if (topic.includes('.omniclaude.')) return 'omniclaude';
  // Legacy flat agent topics (no dots) or agent-* prefixed
  if (!topic.includes('.') || topic.startsWith('agent-')) return 'agent';
  return 'other';
}
