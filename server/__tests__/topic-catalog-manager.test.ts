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
import { TopicCatalogManager, CATALOG_TIMEOUT_MS } from '../topic-catalog-manager';
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
});
