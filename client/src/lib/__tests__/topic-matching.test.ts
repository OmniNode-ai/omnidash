/**
 * Unit tests for topic matching utilities.
 *
 * Verifies the suffix-based matching contract:
 * - Monitored topics are suffix-only (no env prefix)
 * - Env prefix is dot-delimited (single segment)
 * - Matching is literal string comparison (no wildcards/regex)
 */

import { describe, it, expect } from 'vitest';
import { topicMatchesSuffix, normalizeToSuffix } from '@/lib/configs/event-bus-dashboard';

describe('topicMatchesSuffix', () => {
  const HEARTBEAT_SUFFIX = 'onex.evt.platform.node-heartbeat.v1';

  it('matches exact suffix (no prefix)', () => {
    expect(topicMatchesSuffix('onex.evt.platform.node-heartbeat.v1', HEARTBEAT_SUFFIX)).toBe(true);
  });

  it('matches with dev env prefix', () => {
    expect(topicMatchesSuffix('dev.onex.evt.platform.node-heartbeat.v1', HEARTBEAT_SUFFIX)).toBe(
      true
    );
  });

  it('matches with arbitrary env prefix', () => {
    expect(topicMatchesSuffix('prodX.onex.evt.platform.node-heartbeat.v1', HEARTBEAT_SUFFIX)).toBe(
      true
    );
  });

  it('matches with staging prefix', () => {
    expect(
      topicMatchesSuffix('staging.onex.evt.platform.node-heartbeat.v1', HEARTBEAT_SUFFIX)
    ).toBe(true);
  });

  it('does NOT match v12 when monitoring v1 (no partial suffix match)', () => {
    // This is the critical edge case: ".v1" must not match ".v12"
    // endsWith(".onex.evt.platform.node-heartbeat.v1") will NOT match
    // "dev.onex.evt.platform.node-heartbeat.v12" because the suffix is different
    expect(topicMatchesSuffix('dev.onex.evt.platform.node-heartbeat.v12', HEARTBEAT_SUFFIX)).toBe(
      false
    );
  });

  it('matches legacy flat topic names exactly', () => {
    expect(topicMatchesSuffix('agent-routing-decisions', 'agent-routing-decisions')).toBe(true);
  });

  it('does NOT match unrelated topics', () => {
    expect(topicMatchesSuffix('dev.onex.evt.platform.node-registration.v1', HEARTBEAT_SUFFIX)).toBe(
      false
    );
  });

  it('does NOT match empty strings', () => {
    expect(topicMatchesSuffix('', HEARTBEAT_SUFFIX)).toBe(false);
    expect(topicMatchesSuffix(HEARTBEAT_SUFFIX, '')).toBe(false);
  });

  it('does NOT match when suffix is substring but not dot-delimited', () => {
    // "xonex.evt.platform.node-heartbeat.v1" — the "x" is not separated by a dot
    expect(topicMatchesSuffix('xonex.evt.platform.node-heartbeat.v1', HEARTBEAT_SUFFIX)).toBe(
      false
    );
  });
});

describe('normalizeToSuffix', () => {
  const TOPICS = [
    'agent-routing-decisions',
    'onex.evt.platform.node-heartbeat.v1',
    'onex.evt.platform.node-introspection.v1',
  ] as const;

  it('returns suffix-only topic as-is', () => {
    expect(normalizeToSuffix('onex.evt.platform.node-heartbeat.v1', TOPICS)).toBe(
      'onex.evt.platform.node-heartbeat.v1'
    );
  });

  it('strips env prefix and returns matching suffix', () => {
    expect(normalizeToSuffix('dev.onex.evt.platform.node-heartbeat.v1', TOPICS)).toBe(
      'onex.evt.platform.node-heartbeat.v1'
    );
  });

  it('returns legacy flat topic as-is', () => {
    expect(normalizeToSuffix('agent-routing-decisions', TOPICS)).toBe('agent-routing-decisions');
  });

  it('returns unknown topic unchanged', () => {
    expect(normalizeToSuffix('unknown-topic', TOPICS)).toBe('unknown-topic');
  });
});
