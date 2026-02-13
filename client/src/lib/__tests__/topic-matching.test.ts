/**
 * Unit tests for topic matching utilities.
 *
 * Verifies the suffix-based matching contract:
 * - Monitored topics are suffix-only (no env prefix)
 * - Env prefix is dot-delimited (single segment)
 * - Matching is literal string comparison (no wildcards/regex)
 */

import { describe, it, expect } from 'vitest';
import {
  LEGACY_AGENT_ROUTING_DECISIONS,
  SUFFIX_NODE_HEARTBEAT,
  SUFFIX_NODE_INTROSPECTION,
} from '@shared/topics';
import { topicMatchesSuffix, normalizeToSuffix } from '@/lib/configs/event-bus-dashboard';

describe('topicMatchesSuffix', () => {
  it('matches exact suffix (no prefix)', () => {
    expect(topicMatchesSuffix(SUFFIX_NODE_HEARTBEAT, SUFFIX_NODE_HEARTBEAT)).toBe(true);
  });

  it('matches with dev env prefix', () => {
    expect(topicMatchesSuffix(`dev.${SUFFIX_NODE_HEARTBEAT}`, SUFFIX_NODE_HEARTBEAT)).toBe(true);
  });

  it('matches with arbitrary env prefix', () => {
    expect(topicMatchesSuffix(`prodX.${SUFFIX_NODE_HEARTBEAT}`, SUFFIX_NODE_HEARTBEAT)).toBe(true);
  });

  it('matches with staging prefix', () => {
    expect(topicMatchesSuffix(`staging.${SUFFIX_NODE_HEARTBEAT}`, SUFFIX_NODE_HEARTBEAT)).toBe(
      true
    );
  });

  it('does NOT match v12 when monitoring v1 (no partial suffix match)', () => {
    // This is the critical edge case: ".v1" must not match ".v12"
    // endsWith(".onex.evt.platform.node-heartbeat.v1") will NOT match
    // "dev.onex.evt.platform.node-heartbeat.v12" because the suffix is different
    expect(
      topicMatchesSuffix('dev.onex.evt.platform.node-heartbeat.v12', SUFFIX_NODE_HEARTBEAT)
    ).toBe(false);
  });

  it('matches legacy flat topic names exactly', () => {
    expect(topicMatchesSuffix(LEGACY_AGENT_ROUTING_DECISIONS, LEGACY_AGENT_ROUTING_DECISIONS)).toBe(
      true
    );
  });

  it('does NOT match unrelated topics', () => {
    expect(topicMatchesSuffix(`dev.${SUFFIX_NODE_INTROSPECTION}`, SUFFIX_NODE_HEARTBEAT)).toBe(
      false
    );
  });

  it('does NOT match empty strings', () => {
    expect(topicMatchesSuffix('', SUFFIX_NODE_HEARTBEAT)).toBe(false);
    expect(topicMatchesSuffix(SUFFIX_NODE_HEARTBEAT, '')).toBe(false);
  });

  it('does NOT match when suffix is substring but not dot-delimited', () => {
    // "xonex.evt.platform.node-heartbeat.v1" — the "x" is not separated by a dot
    expect(topicMatchesSuffix(`x${SUFFIX_NODE_HEARTBEAT}`, SUFFIX_NODE_HEARTBEAT)).toBe(false);
  });
});

describe('normalizeToSuffix', () => {
  const TOPICS = [
    LEGACY_AGENT_ROUTING_DECISIONS,
    SUFFIX_NODE_HEARTBEAT,
    SUFFIX_NODE_INTROSPECTION,
  ] as const;

  it('returns suffix-only topic as-is', () => {
    expect(normalizeToSuffix(SUFFIX_NODE_HEARTBEAT, TOPICS)).toBe(SUFFIX_NODE_HEARTBEAT);
  });

  it('strips env prefix and returns matching suffix', () => {
    expect(normalizeToSuffix(`dev.${SUFFIX_NODE_HEARTBEAT}`, TOPICS)).toBe(SUFFIX_NODE_HEARTBEAT);
  });

  it('returns legacy flat topic as-is', () => {
    expect(normalizeToSuffix(LEGACY_AGENT_ROUTING_DECISIONS, TOPICS)).toBe(
      LEGACY_AGENT_ROUTING_DECISIONS
    );
  });

  it('returns unknown topic unchanged', () => {
    expect(normalizeToSuffix('unknown-topic', TOPICS)).toBe('unknown-topic');
  });
});
