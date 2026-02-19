/**
 * Unit tests for TopicCatalogManager (OMN-2315)
 *
 * Strategy: inject a mock Kafka instance directly into TopicCatalogManager so
 * no real broker connection is attempted.  Each test drives the manager's
 * behaviour by calling its internal message-handler directly (via the exposed
 * `simulateMessage` helper below) rather than going through an actual Kafka
 * consumer callback.
 *
 * Coverage:
 *   - Successful bootstrap → catalogReceived with topic list
 *   - Warning surfacing
 *   - Timeout path → catalogTimeout
 *   - catalog-changed delta (add/remove topics)
 *   - Correlation ID filtering (wrong ID → message discarded)
 *   - Malformed JSON → message skipped gracefully
 *   - Schema validation failure → message skipped
 *   - stop() cancels outstanding timeout
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import {
  TopicCatalogManager,
  CATALOG_TIMEOUT_MS,
  CATALOG_REQUERY_INTERVAL_MS,
} from '../topic-catalog-manager';
import {
  SUFFIX_PLATFORM_TOPIC_CATALOG_RESPONSE,
  SUFFIX_PLATFORM_TOPIC_CATALOG_CHANGED,
} from '@shared/topics';

// ---------------------------------------------------------------------------
// Minimal KafkaJS mock factory
// ---------------------------------------------------------------------------

function makeMockKafka() {
  const mockConsumerRun = vi.fn();
  const mockConsumerSubscribe = vi.fn().mockResolvedValue(undefined);
  const mockConsumerConnect = vi.fn().mockResolvedValue(undefined);
  const mockConsumerDisconnect = vi.fn().mockResolvedValue(undefined);

  const mockProducerSend = vi.fn().mockResolvedValue(undefined);
  const mockProducerConnect = vi.fn().mockResolvedValue(undefined);
  const mockProducerDisconnect = vi.fn().mockResolvedValue(undefined);

  const mockConsumer = {
    connect: mockConsumerConnect,
    disconnect: mockConsumerDisconnect,
    subscribe: mockConsumerSubscribe,
    run: mockConsumerRun,
  };

  const mockProducer = {
    connect: mockProducerConnect,
    disconnect: mockProducerDisconnect,
    send: mockProducerSend,
  };

  const mockKafka = {
    consumer: vi.fn().mockReturnValue(mockConsumer),
    producer: vi.fn().mockReturnValue(mockProducer),
  };

  return {
    mockKafka: mockKafka as unknown as import('kafkajs').Kafka,
    mockConsumer,
    mockProducer,
    mockConsumerRun,
    mockProducerSend,
  };
}

/**
 * Helper: bootstrap the manager and capture the eachMessage callback so tests
 * can push synthetic messages without touching Kafka.
 */
// Stable UUIDs for tests — proper v4 format required by the Zod schema.
const TEST_CORRELATION_ID = 'a1b2c3d4-e5f6-4a1b-8c3d-000000000001';
const OTHER_CORRELATION_ID = 'deadbeef-dead-4ead-8ead-000000000099';

async function bootstrapAndCapture(
  manager: TopicCatalogManager,
  mocks: ReturnType<typeof makeMockKafka>
) {
  const { mockConsumerRun, mockProducerSend } = mocks;

  let eachMessageCallback:
    | ((payload: { topic: string; message: { value: Buffer | null } }) => Promise<void>)
    | null = null;

  mockConsumerRun.mockImplementation(
    async ({ eachMessage }: { eachMessage: (p: unknown) => Promise<void> }) => {
      eachMessageCallback = eachMessage as typeof eachMessageCallback;
    }
  );

  await manager.bootstrap(TEST_CORRELATION_ID);

  return {
    /**
     * Simulate a Kafka message arriving on the given topic.
     */
    pushMessage: async (topic: string, payload: unknown) => {
      if (!eachMessageCallback) throw new Error('consumer.run was never called');
      await eachMessageCallback({
        topic,
        message: { value: Buffer.from(JSON.stringify(payload)) },
      });
    },
    /**
     * Simulate a Kafka message arriving with a raw string value (e.g. malformed JSON).
     */
    pushRawMessage: async (topic: string, rawValue: string) => {
      if (!eachMessageCallback) throw new Error('consumer.run was never called');
      await eachMessageCallback({
        topic,
        message: { value: Buffer.from(rawValue) },
      });
    },
    publishedQuery: mockProducerSend.mock.calls[0]?.[0],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TopicCatalogManager', () => {
  let mocks: ReturnType<typeof makeMockKafka>;
  let manager: TopicCatalogManager;

  beforeEach(() => {
    vi.useFakeTimers();
    mocks = makeMockKafka();
    manager = new TopicCatalogManager(mocks.mockKafka);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await manager.stop();
  });

  // -------------------------------------------------------------------------
  // Construction
  // -------------------------------------------------------------------------

  describe('constructor', () => {
    it('generates a stable instanceUuid (UUID format)', () => {
      expect(manager.instanceUuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('sets consumerGroupId to omnidash.catalog.{instanceUuid}', () => {
      expect(manager.consumerGroupId).toBe(`omnidash.catalog.${manager.instanceUuid}`);
    });

    it('generates a different instanceUuid on each construction', () => {
      const m2 = new TopicCatalogManager(mocks.mockKafka);
      expect(manager.instanceUuid).not.toBe(m2.instanceUuid);
    });
  });

  // -------------------------------------------------------------------------
  // Successful bootstrap
  // -------------------------------------------------------------------------

  describe('bootstrap → catalogReceived', () => {
    it('emits catalogReceived with topic list on valid response', async () => {
      const received = vi.fn();
      manager.on('catalogReceived', received);

      const { pushMessage } = await bootstrapAndCapture(manager, mocks);

      await pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_RESPONSE, {
        correlation_id: TEST_CORRELATION_ID,
        topics: [{ topic_name: 'onex.evt.platform.node-heartbeat.v1' }],
        warnings: [],
      });

      expect(received).toHaveBeenCalledOnce();
      expect(received.mock.calls[0][0]).toMatchObject({
        topics: ['onex.evt.platform.node-heartbeat.v1'],
        warnings: [],
        correlationId: TEST_CORRELATION_ID,
      });
    });

    it('surfaces warnings when catalog response contains them', async () => {
      const received = vi.fn();
      manager.on('catalogReceived', received);

      const { pushMessage } = await bootstrapAndCapture(manager, mocks);

      await pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_RESPONSE, {
        correlation_id: TEST_CORRELATION_ID,
        topics: [{ topic_name: 'onex.evt.platform.node-heartbeat.v1' }],
        warnings: ['Topic foo is deprecated, use bar instead'],
      });

      expect(received).toHaveBeenCalledOnce();
      expect(received.mock.calls[0][0].warnings).toEqual([
        'Topic foo is deprecated, use bar instead',
      ]);
    });

    it('publishes ModelTopicCatalogQuery with correct correlation_id and client_id', async () => {
      const { publishedQuery } = await bootstrapAndCapture(manager, mocks);

      expect(publishedQuery).toBeDefined();
      expect(publishedQuery.topic).toBe('onex.cmd.platform.topic-catalog-query.v1');
      const msg = JSON.parse(publishedQuery.messages[0].value);
      expect(msg.correlation_id).toBe(TEST_CORRELATION_ID);
      expect(typeof msg.client_id).toBe('string');
      expect(msg.client_id.length).toBeGreaterThan(0);
    });

    it('cancels the timeout when a valid response is received', async () => {
      const timeout = vi.fn();
      manager.on('catalogTimeout', timeout);

      const { pushMessage } = await bootstrapAndCapture(manager, mocks);

      await pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_RESPONSE, {
        correlation_id: TEST_CORRELATION_ID,
        topics: [],
        warnings: [],
      });

      // Advance past the timeout window — it should NOT fire
      vi.advanceTimersByTime(CATALOG_TIMEOUT_MS * 2);
      expect(timeout).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Timeout path
  // -------------------------------------------------------------------------

  describe('bootstrap → catalogTimeout', () => {
    it('emits catalogTimeout when no response arrives within CATALOG_TIMEOUT_MS', async () => {
      const timeout = vi.fn();
      manager.on('catalogTimeout', timeout);

      await bootstrapAndCapture(manager, mocks);

      vi.advanceTimersByTime(CATALOG_TIMEOUT_MS);
      expect(timeout).toHaveBeenCalledOnce();
    });

    it('does NOT emit catalogTimeout if stop() was called first', async () => {
      const timeout = vi.fn();
      manager.on('catalogTimeout', timeout);

      await bootstrapAndCapture(manager, mocks);

      await manager.stop();
      vi.advanceTimersByTime(CATALOG_TIMEOUT_MS * 2);

      expect(timeout).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Correlation ID filtering (cross-talk prevention)
  // -------------------------------------------------------------------------

  describe('correlation_id filtering', () => {
    it('ignores catalog-response with wrong correlation_id', async () => {
      const received = vi.fn();
      const timeout = vi.fn();
      manager.on('catalogReceived', received);
      manager.on('catalogTimeout', timeout);

      const { pushMessage } = await bootstrapAndCapture(manager, mocks);

      // Push a response with a DIFFERENT correlation_id
      await pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_RESPONSE, {
        correlation_id: OTHER_CORRELATION_ID,
        topics: [{ topic_name: 'onex.evt.platform.node-heartbeat.v1' }],
        warnings: [],
      });

      // catalogReceived must NOT fire — the message is from another instance
      expect(received).not.toHaveBeenCalled();

      // The timeout still fires because no valid response was received
      vi.advanceTimersByTime(CATALOG_TIMEOUT_MS);
      expect(timeout).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // catalog-changed delta events
  // -------------------------------------------------------------------------

  describe('catalogChanged', () => {
    it('emits catalogChanged after catalogReceived with add/remove delta', async () => {
      const changed = vi.fn();
      manager.on('catalogChanged', changed);

      const { pushMessage } = await bootstrapAndCapture(manager, mocks);

      // First establish the initial catalog
      await pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_RESPONSE, {
        correlation_id: TEST_CORRELATION_ID,
        topics: [{ topic_name: 'onex.evt.platform.node-heartbeat.v1' }],
        warnings: [],
      });

      // Now push a catalog-changed delta
      await pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_CHANGED, {
        topics_added: ['onex.evt.omniclaude.session-started.v1'],
        topics_removed: ['onex.evt.platform.node-heartbeat.v1'],
      });

      expect(changed).toHaveBeenCalledOnce();
      expect(changed.mock.calls[0][0]).toMatchObject({
        topicsAdded: ['onex.evt.omniclaude.session-started.v1'],
        topicsRemoved: ['onex.evt.platform.node-heartbeat.v1'],
      });
    });

    it('ignores catalog-changed before initial catalog is received', async () => {
      const changed = vi.fn();
      manager.on('catalogChanged', changed);

      const { pushMessage } = await bootstrapAndCapture(manager, mocks);

      // Push changed WITHOUT a prior response
      await pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_CHANGED, {
        topics_added: ['onex.evt.omniclaude.session-started.v1'],
        topics_removed: [],
      });

      expect(changed).not.toHaveBeenCalled();
    });

    it('handles empty delta arrays gracefully', async () => {
      const changed = vi.fn();
      manager.on('catalogChanged', changed);

      const { pushMessage } = await bootstrapAndCapture(manager, mocks);

      await pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_RESPONSE, {
        correlation_id: TEST_CORRELATION_ID,
        topics: [],
        warnings: [],
      });

      await pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_CHANGED, {
        topics_added: [],
        topics_removed: [],
      });

      // Empty delta still emits the event (no-op)
      expect(changed).toHaveBeenCalledOnce();
      expect(changed.mock.calls[0][0]).toMatchObject({ topicsAdded: [], topicsRemoved: [] });
    });
  });

  // -------------------------------------------------------------------------
  // Gap detection (version sequencing)
  // -------------------------------------------------------------------------

  describe('gap detection', () => {
    /** Helper: push a valid catalog-response to establish initial catalog. */
    async function establishCatalog(
      pushMessage: Awaited<ReturnType<typeof bootstrapAndCapture>>['pushMessage']
    ) {
      await pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_RESPONSE, {
        correlation_id: TEST_CORRELATION_ID,
        topics: [{ topic_name: 'onex.evt.platform.node-heartbeat.v1' }],
        warnings: [],
      });
    }

    it('emits catalogChanged normally when version is in order', async () => {
      const changed = vi.fn();
      manager.on('catalogChanged', changed);

      const { pushMessage } = await bootstrapAndCapture(manager, mocks);
      await establishCatalog(pushMessage);

      // version 1, then 2 — sequential, no gap
      await pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_CHANGED, {
        topics_added: ['a'],
        topics_removed: [],
        catalog_version: 1,
      });
      await pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_CHANGED, {
        topics_added: ['b'],
        topics_removed: [],
        catalog_version: 2,
      });

      expect(changed).toHaveBeenCalledTimes(2);
    });

    it('triggers requery when a version gap is detected and still emits catalogChanged', async () => {
      const changed = vi.fn();
      manager.on('catalogChanged', changed);

      const { pushMessage } = await bootstrapAndCapture(manager, mocks);
      await establishCatalog(pushMessage);

      // version 1 is fine — establishes baseline
      await pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_CHANGED, {
        topics_added: ['a'],
        topics_removed: [],
        catalog_version: 1,
      });
      expect(changed).toHaveBeenCalledTimes(1);

      // version 5 skips over 2, 3, 4 — gap detected
      await pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_CHANGED, {
        topics_added: ['b'],
        topics_removed: [],
        catalog_version: 5,
      });

      // Gap triggers a requery AND still emits catalogChanged (optimistic apply)
      expect(changed).toHaveBeenCalledTimes(2);
      // A new query must have been published (initial query at index 0, requery at index 1)
      expect(mocks.mockProducer.send).toHaveBeenCalledTimes(2);
    });

    it('does NOT trigger a second requery for the next event after a gap (no requery storm)', async () => {
      const changed = vi.fn();
      manager.on('catalogChanged', changed);

      const { pushMessage } = await bootstrapAndCapture(manager, mocks);
      await establishCatalog(pushMessage);

      // Establish baseline at version 1
      await pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_CHANGED, {
        topics_added: ['a'],
        topics_removed: [],
        catalog_version: 1,
      });

      // Gap: version 5 triggers the first requery
      await pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_CHANGED, {
        topics_added: ['b'],
        topics_removed: [],
        catalog_version: 5,
      });
      // Exactly one requery after the initial query
      expect(mocks.mockProducer.send).toHaveBeenCalledTimes(2);

      // Version 6 is the next sequential event after 5 — must NOT trigger another requery
      // (if lastSeenVersion were still the stale pre-gap value, 6 > stale + 1 would fire again)
      await pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_CHANGED, {
        topics_added: ['c'],
        topics_removed: [],
        catalog_version: 6,
      });

      // Still only two sends (initial + one requery), not three
      expect(mocks.mockProducer.send).toHaveBeenCalledTimes(2);
    });

    it('treats catalog_version === -1 as unknown sentinel and triggers version_unknown requery', async () => {
      const changed = vi.fn();
      manager.on('catalogChanged', changed);

      const { pushMessage } = await bootstrapAndCapture(manager, mocks);
      await establishCatalog(pushMessage);

      // Sentinel -1 means "unknown version" — triggers version_unknown requery each time
      await pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_CHANGED, {
        topics_added: ['a'],
        topics_removed: [],
        catalog_version: -1,
      });
      await pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_CHANGED, {
        topics_added: ['b'],
        topics_removed: [],
        catalog_version: -1,
      });

      // Both deltas still applied (optimistic)
      expect(changed).toHaveBeenCalledTimes(2);
      // initial query + 1 requery per -1 event = 3 sends
      expect(mocks.mockProducer.send).toHaveBeenCalledTimes(3);
    });

    it('treats absent catalog_version as unknown and triggers version_unknown requery', async () => {
      const changed = vi.fn();
      manager.on('catalogChanged', changed);

      const { pushMessage } = await bootstrapAndCapture(manager, mocks);
      await establishCatalog(pushMessage);

      // No version field — treated same as -1 (unknown), triggers requery
      await pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_CHANGED, {
        topics_added: ['a'],
        topics_removed: [],
      });

      // Delta still applied (optimistic)
      expect(changed).toHaveBeenCalledTimes(1);
      // initial query + 1 requery = 2 sends
      expect(mocks.mockProducer.send).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // Malformed / invalid messages
  // -------------------------------------------------------------------------

  describe('malformed messages', () => {
    it('skips catalog-response with non-JSON body', async () => {
      const received = vi.fn();
      manager.on('catalogReceived', received);

      const { pushRawMessage } = await bootstrapAndCapture(manager, mocks);

      await pushRawMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_RESPONSE, 'not-json{{{');

      expect(received).not.toHaveBeenCalled();
    });

    it('skips catalog-response that fails schema validation', async () => {
      const received = vi.fn();
      manager.on('catalogReceived', received);

      const { pushMessage } = await bootstrapAndCapture(manager, mocks);

      // Missing required `correlation_id`
      await pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_RESPONSE, {
        topics: [{ topic_name: 'foo' }],
      });

      expect(received).not.toHaveBeenCalled();
    });

    it('skips catalog-changed with non-JSON body', async () => {
      const changed = vi.fn();
      manager.on('catalogChanged', changed);

      const { pushMessage, pushRawMessage } = await bootstrapAndCapture(manager, mocks);

      // Establish initial catalog first
      await pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_RESPONSE, {
        correlation_id: TEST_CORRELATION_ID,
        topics: [],
        warnings: [],
      });

      await pushRawMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_CHANGED, 'not-json');

      expect(changed).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Environment prefix stripping
  // -------------------------------------------------------------------------

  describe('env-prefix topic handling', () => {
    it('accepts catalog-response delivered on a dev-prefixed topic', async () => {
      const received = vi.fn();
      manager.on('catalogReceived', received);

      const { pushMessage } = await bootstrapAndCapture(manager, mocks);

      // Deliver on dev. prefixed topic — manager should strip the prefix
      await pushMessage('dev.' + SUFFIX_PLATFORM_TOPIC_CATALOG_RESPONSE, {
        correlation_id: TEST_CORRELATION_ID,
        topics: [{ topic_name: 'onex.evt.platform.node-heartbeat.v1' }],
        warnings: [],
      });

      expect(received).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // Gap detection & re-query (OMN-2316)
  // -------------------------------------------------------------------------

  describe('gap detection — requery events', () => {
    /** Helper: establish the initial catalog so changed events are processed. */
    async function bootstrapWithCatalog(
      m: TopicCatalogManager,
      mk: ReturnType<typeof makeMockKafka>
    ) {
      const helpers = await bootstrapAndCapture(m, mk);
      await helpers.pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_RESPONSE, {
        correlation_id: TEST_CORRELATION_ID,
        topics: [{ topic_name: 'onex.evt.platform.node-heartbeat.v1' }],
        warnings: [],
      });
      return helpers;
    }

    it('emits catalogRequery with reason=gap when received_version > lastSeenVersion + 1', async () => {
      const requery = vi.fn();
      manager.on('catalogRequery', requery);

      const { pushMessage } = await bootstrapWithCatalog(manager, mocks);

      // Push version 2 (first changed event sets lastSeenVersion = 2)
      await pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_CHANGED, {
        topics_added: [],
        topics_removed: [],
        catalog_version: 2,
      });
      expect(requery).not.toHaveBeenCalled();

      // Now push version 5 — gap: 3 and 4 were skipped
      await pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_CHANGED, {
        topics_added: [],
        topics_removed: [],
        catalog_version: 5,
      });

      expect(requery).toHaveBeenCalledOnce();
      expect(requery.mock.calls[0][0]).toMatchObject({
        reason: 'gap',
        lastSeenVersion: 5, // advanced to receivedVersion before triggerRequery (storm prevention)
      });
    });

    it('emits catalogRequery with reason=version_unknown when catalog_version === -1', async () => {
      const requery = vi.fn();
      manager.on('catalogRequery', requery);

      const { pushMessage } = await bootstrapWithCatalog(manager, mocks);

      await pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_CHANGED, {
        topics_added: [],
        topics_removed: [],
        catalog_version: -1,
      });

      expect(requery).toHaveBeenCalledOnce();
      expect(requery.mock.calls[0][0]).toMatchObject({
        reason: 'version_unknown',
      });
    });

    it('emits catalogRequery with reason=version_unknown when catalog_version is absent', async () => {
      const requery = vi.fn();
      manager.on('catalogRequery', requery);

      const { pushMessage } = await bootstrapWithCatalog(manager, mocks);

      // No catalog_version field
      await pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_CHANGED, {
        topics_added: [],
        topics_removed: [],
      });

      expect(requery).toHaveBeenCalledOnce();
      expect(requery.mock.calls[0][0]).toMatchObject({
        reason: 'version_unknown',
      });
    });

    it('does NOT emit catalogRequery when received_version === lastSeenVersion + 1', async () => {
      const requery = vi.fn();
      manager.on('catalogRequery', requery);

      const { pushMessage } = await bootstrapWithCatalog(manager, mocks);

      // Push version 1 — lastSeenVersion becomes 1
      await pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_CHANGED, {
        topics_added: [],
        topics_removed: [],
        catalog_version: 1,
      });

      // Push version 2 — contiguous, no gap
      await pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_CHANGED, {
        topics_added: [],
        topics_removed: [],
        catalog_version: 2,
      });

      expect(requery).not.toHaveBeenCalled();
    });

    it('updates lastSeenVersion correctly on contiguous versions', async () => {
      const requery = vi.fn();
      manager.on('catalogRequery', requery);

      const { pushMessage } = await bootstrapWithCatalog(manager, mocks);

      // Three contiguous versions
      for (const v of [10, 11, 12]) {
        await pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_CHANGED, {
          topics_added: [],
          topics_removed: [],
          catalog_version: v,
        });
      }

      expect(requery).not.toHaveBeenCalled();

      // Version 14 skips 13 — should trigger gap
      await pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_CHANGED, {
        topics_added: [],
        topics_removed: [],
        catalog_version: 14,
      });

      expect(requery).toHaveBeenCalledOnce();
      expect(requery.mock.calls[0][0]).toMatchObject({ reason: 'gap', lastSeenVersion: 14 }); // advanced to receivedVersion before triggerRequery
    });

    it('publishes a new catalog query when a gap re-query is triggered', async () => {
      const { pushMessage } = await bootstrapWithCatalog(manager, mocks);

      // Clear the initial bootstrap query call
      mocks.mockProducerSend.mockClear();

      await pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_CHANGED, {
        topics_added: [],
        topics_removed: [],
        catalog_version: 5, // gap: lastSeen was null → no gap on first, so set it first
      });

      // First changed event sets lastSeenVersion=5 (no gap since lastSeenVersion was null)
      expect(mocks.mockProducerSend).not.toHaveBeenCalled();

      // Now trigger a real gap
      await pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_CHANGED, {
        topics_added: [],
        topics_removed: [],
        catalog_version: 10,
      });

      // A new query should have been published
      expect(mocks.mockProducerSend).toHaveBeenCalledOnce();
    });

    it('resets lastSeenVersion to null after a re-query response so the next catalog-changed establishes a fresh baseline without spurious gap re-query', async () => {
      const requery = vi.fn();
      manager.on('catalogRequery', requery);

      const { pushMessage } = await bootstrapWithCatalog(manager, mocks);

      // Establish lastSeenVersion=5
      await pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_CHANGED, {
        topics_added: [],
        topics_removed: [],
        catalog_version: 5,
      });
      expect(requery).not.toHaveBeenCalled();

      // Clear the initial bootstrap query call so we can isolate the re-query send
      mocks.mockProducerSend.mockClear();

      // Push version 10 — gap detected (5 → 10 skips 6-9), re-query triggered
      await pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_CHANGED, {
        topics_added: [],
        topics_removed: [],
        catalog_version: 10,
      });
      expect(requery).toHaveBeenCalledOnce();
      expect(requery.mock.calls[0][0]).toMatchObject({ reason: 'gap', lastSeenVersion: 10 });

      // Extract the new correlation_id generated by triggerRequery from the
      // producer.send call args (fire-and-forget publishQuery uses producer.send).
      // Wait for the fire-and-forget promise to resolve.
      await Promise.resolve();
      await Promise.resolve();
      expect(mocks.mockProducerSend).toHaveBeenCalledOnce();
      const requerySendCall = mocks.mockProducerSend.mock.calls[0][0];
      const requeryCorrelationId = JSON.parse(requerySendCall.messages[0].value).correlation_id;

      // Simulate the re-query response arriving with the new correlation_id.
      // This should reset lastSeenVersion to null inside handleCatalogResponse.
      await pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_RESPONSE, {
        correlation_id: requeryCorrelationId,
        topics: [{ topic_name: 'onex.evt.platform.node-heartbeat.v1' }],
        warnings: [],
      });

      // Clear requery mock to check no spurious re-query fires next
      requery.mockClear();

      // Push catalog_version=1 — since lastSeenVersion was reset to null by the
      // response handler, this is treated as the first version (fresh baseline).
      // It must NOT trigger a gap re-query.
      await pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_CHANGED, {
        topics_added: [],
        topics_removed: [],
        catalog_version: 1,
      });

      expect(requery).not.toHaveBeenCalled();
    });

    it('accepts catalog_version=1 as first baseline; gap at version 3 reports post-advance lastSeenVersion', async () => {
      const requery = vi.fn();
      manager.on('catalogRequery', requery);

      const { pushMessage } = await bootstrapWithCatalog(manager, mocks);

      // Version 1 — lastSeenVersion was null, so this establishes the baseline.
      // No gap, no re-query.
      await pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_CHANGED, {
        topics_added: [],
        topics_removed: [],
        catalog_version: 1,
      });
      expect(requery).not.toHaveBeenCalled();

      // Version 3 skips 2 — gap detected.  lastSeenVersion is advanced to the
      // received version (3) before triggerRequery is called, so the emitted
      // event carries lastSeenVersion: 3 (post-advance).
      await pushMessage(SUFFIX_PLATFORM_TOPIC_CATALOG_CHANGED, {
        topics_added: [],
        topics_removed: [],
        catalog_version: 3,
      });
      expect(requery).toHaveBeenCalledOnce();
      expect(requery.mock.calls[0][0]).toMatchObject({ reason: 'gap', lastSeenVersion: 3 });
    });
  });

  // -------------------------------------------------------------------------
  // Periodic requery (OMN-2316)
  // -------------------------------------------------------------------------

  describe('periodic requery', () => {
    it('emits catalogRequery with reason=periodic after CATALOG_REQUERY_INTERVAL_MS', async () => {
      const requery = vi.fn();
      manager.on('catalogRequery', requery);

      await bootstrapAndCapture(manager, mocks);

      // Advance past one interval
      vi.advanceTimersByTime(CATALOG_REQUERY_INTERVAL_MS);

      expect(requery).toHaveBeenCalledOnce();
      expect(requery.mock.calls[0][0]).toMatchObject({ reason: 'periodic' });
    });

    it('publishes a new catalog query on each periodic tick', async () => {
      await bootstrapAndCapture(manager, mocks);

      // Clear the initial bootstrap query call count
      mocks.mockProducerSend.mockClear();

      vi.advanceTimersByTime(CATALOG_REQUERY_INTERVAL_MS);

      // Allow the async publishQuery to resolve
      await Promise.resolve();

      expect(mocks.mockProducerSend).toHaveBeenCalledOnce();
    });

    it('fires multiple times across multiple intervals', async () => {
      const requery = vi.fn();
      manager.on('catalogRequery', requery);

      await bootstrapAndCapture(manager, mocks);

      vi.advanceTimersByTime(CATALOG_REQUERY_INTERVAL_MS * 3);

      expect(requery).toHaveBeenCalledTimes(3);
    });

    it('does NOT fire after stop() is called', async () => {
      const requery = vi.fn();
      manager.on('catalogRequery', requery);

      await bootstrapAndCapture(manager, mocks);
      await manager.stop();

      vi.advanceTimersByTime(CATALOG_REQUERY_INTERVAL_MS * 5);

      expect(requery).not.toHaveBeenCalled();
    });
  });
});
