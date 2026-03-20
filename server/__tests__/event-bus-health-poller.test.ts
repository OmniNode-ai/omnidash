import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

// Stub fetch once at module level, before static import of module under test.
// This stays active for the entire suite; afterAll cleans up.
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { fetchTopicNames, EXPECTED_TOPICS } from '../event-bus-health-poller';

// Module-level cleanup: unstub globals after all describe blocks complete
afterAll(() => {
  vi.unstubAllGlobals();
});

describe('fetchTopicNames', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('extracts unique topic names from /v1/partitions response, excluding redpanda namespace', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { ns: 'kafka', topic: 'topic-a', partition_id: 0 },
        { ns: 'kafka', topic: 'topic-a', partition_id: 1 },
        { ns: 'kafka', topic: 'topic-b', partition_id: 0 },
        { ns: 'redpanda', topic: '__consumer_offsets', partition_id: 0 },
      ],
    });

    const topics = await fetchTopicNames();
    expect(topics).toEqual(expect.arrayContaining(['topic-a', 'topic-b']));
    expect(topics).toHaveLength(2);
    // Only assert namespace filtering -- topics in ns='redpanda' are excluded
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/partitions'),
      expect.objectContaining({ signal: expect.any(Object) })
    );
  });

  it('returns empty array for empty partitions response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    const topics = await fetchTopicNames();
    expect(topics).toEqual([]);
  });

  it('returns empty array for non-array response (shape guard)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: 'unexpected shape' }),
    });

    const topics = await fetchTopicNames();
    expect(topics).toEqual([]);
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(fetchTopicNames()).rejects.toThrow('HTTP 404');
  });
});

/**
 * OMN-4970: Verify event-bus-health-poller configuration is compatible
 * with the Redpanda Admin API port 9644 exposure from OMN-4959.
 */
describe('event-bus-health-poller configuration (OMN-4970)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('REDPANDA_ADMIN_URL defaults to http://localhost:9644 (port from OMN-4959)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    await fetchTopicNames();

    // Verify the default URL matches the port exposed by OMN-4959
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:9644/v1/partitions',
      expect.objectContaining({ signal: expect.any(Object) })
    );
  });

  it('EXPECTED_TOPICS includes core ONEX topic names for health monitoring', () => {
    // These topics are critical for the health dashboard to track.
    // If any are missing, the health poller will not report them as expected.
    const criticalTopics = [
      'onex.evt.omniclaude.gate-decision.v1',
      'onex.evt.omniclaude.epic-run-updated.v1',
      'onex.evt.omniclaude.pr-watch-updated.v1',
      'onex.evt.omniclaude.budget-cap-hit.v1',
      // OMN-5600: pattern-discovery uses underscore-prefixed topic name
      // matching the actual broker topic (_omniintelligence.pattern-discovery.v1)
      '_omniintelligence.pattern-discovery.v1',
      'onex.evt.omniintelligence.intent-classified.v1',
    ];

    for (const topic of criticalTopics) {
      expect(EXPECTED_TOPICS).toContain(topic);
    }
  });

  it('EXPECTED_TOPICS does not include legacy flat topic names', () => {
    // OMN-4083: legacy flat names like 'agent-actions' should not be in EXPECTED_TOPICS.
    // Only canonical ONEX-prefixed names should be used.
    const legacyTopics = [
      'agent-actions',
      'agent.routing.requested.v1',
      'agent.routing.completed.v1',
    ];
    for (const topic of legacyTopics) {
      expect(EXPECTED_TOPICS).not.toContain(topic);
    }
  });
});
