/**
 * Topic Registry Data Source (OMN-2082)
 *
 * Fetcher and transformer for the Topics tab in the Platform Registry.
 * Derives topic data from the existing EventBusProjection's topicBreakdown
 * field, filtering out legacy-prefixed topics and classifying by domain.
 *
 * Data flow:
 *   EventBusProjection snapshot -> topicBreakdown -> filter legacy -> classify -> sort
 */

import {
  isLegacyPrefixedTopic,
  classifyTopicDomain,
  type TopicDomain,
} from '@shared/topic-filters';
import type { EventBusPayload } from '@shared/event-bus-payload';

// Re-export for consumers
export type { TopicDomain };

// ============================================================================
// Types
// ============================================================================

/** A single topic entry in the registry */
export interface TopicRegistryEntry {
  /** Canonical topic name */
  topic: string;
  /** Domain classification for grouping */
  domain: TopicDomain;
  /** Total event count observed in the projection */
  eventCount: number;
}

/** Summary metrics for the topics tab */
export interface TopicRegistrySummary {
  /** Total number of non-legacy topics */
  totalTopics: number;
  /** Sum of all event counts across non-legacy topics */
  totalEvents: number;
  /** Number of topics per domain */
  domainCounts: Record<TopicDomain, number>;
}

/** Combined result from the topic registry data source */
export interface TopicRegistryData {
  entries: TopicRegistryEntry[];
  summary: TopicRegistrySummary;
}

// ============================================================================
// Transform
// ============================================================================

/**
 * Transform an EventBusPayload into topic registry data.
 *
 * 1. Extracts topicBreakdown from the payload
 * 2. Filters out legacy-prefixed topics (dev.*, staging.*, etc.)
 * 3. Classifies each topic by domain
 * 4. Returns entries sorted by eventCount descending
 */
export function transformTopicRegistryData(payload: EventBusPayload): TopicRegistryData {
  const { topicBreakdown } = payload;

  // Filter and classify
  const entries: TopicRegistryEntry[] = [];
  for (const [topic, eventCount] of Object.entries(topicBreakdown)) {
    if (isLegacyPrefixedTopic(topic)) continue;
    entries.push({
      topic,
      domain: classifyTopicDomain(topic),
      eventCount,
    });
  }

  // Sort by event count descending
  entries.sort((a, b) => b.eventCount - a.eventCount);

  // Compute summary
  const domainCounts: Record<TopicDomain, number> = {
    platform: 0,
    omniclaude: 0,
    agent: 0,
    other: 0,
  };

  let totalEvents = 0;
  for (const entry of entries) {
    domainCounts[entry.domain]++;
    totalEvents += entry.eventCount;
  }

  return {
    entries,
    summary: {
      totalTopics: entries.length,
      totalEvents,
      domainCounts,
    },
  };
}
