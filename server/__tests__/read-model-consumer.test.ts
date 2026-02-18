/**
 * Tests for ReadModelConsumer (OMN-2061)
 *
 * Verifies:
 * - Consumer handles routing decision events
 * - Consumer handles agent action events
 * - Consumer handles transformation events
 * - Consumer handles LLM cost events (OMN-2300 / OMN-2329)
 * - Consumer gracefully degrades when DB is unavailable
 * - Consumer getStats returns correct statistics
 * - Consumer handles malformed messages
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EachMessagePayload } from 'kafkajs';

// Mock storage module before importing consumer
vi.mock('../storage', () => ({
  tryGetIntelligenceDb: vi.fn(),
  getIntelligenceDb: vi.fn(),
  isDatabaseConfigured: vi.fn(() => false),
}));

// Mock kafkajs
vi.mock('kafkajs', () => ({
  Kafka: vi.fn(() => ({
    consumer: vi.fn(() => ({
      connect: vi.fn(),
      subscribe: vi.fn(),
      run: vi.fn(),
      disconnect: vi.fn(),
    })),
  })),
}));

import { ReadModelConsumer } from '../read-model-consumer';

// ============================================================================
// Test helpers
// ============================================================================

/**
 * Build a minimal EachMessagePayload for testing handleMessage (private method
 * accessed via the consumer's public handleMessage-driven stat tracking).
 * We use `(consumer as unknown as Record<string, unknown>).handleMessage` to
 * access the private method without TypeScript errors.
 */
function makeKafkaPayload(topic: string, data: Record<string, unknown>): EachMessagePayload {
  return {
    topic,
    partition: 0,
    message: {
      key: null,
      value: Buffer.from(JSON.stringify(data)),
      offset: '0',
      timestamp: Date.now().toString(),
      size: 0,
      attributes: 0,
      headers: {},
    },
    heartbeat: vi.fn(),
    pause: vi.fn(),
  };
}

describe('ReadModelConsumer', () => {
  let consumer: ReadModelConsumer;

  beforeEach(() => {
    consumer = new ReadModelConsumer();
    vi.clearAllMocks();
  });

  describe('getStats', () => {
    it('returns initial stats when not running', () => {
      const stats = consumer.getStats();
      expect(stats.isRunning).toBe(false);
      expect(stats.eventsProjected).toBe(0);
      expect(stats.errorsCount).toBe(0);
      expect(stats.lastProjectedAt).toBeNull();
      expect(stats.topicStats).toEqual({});
    });
  });

  describe('start', () => {
    it('skips when no brokers configured', async () => {
      // Ensure no brokers in env
      const originalBrokers = process.env.KAFKA_BROKERS;
      const originalBootstrap = process.env.KAFKA_BOOTSTRAP_SERVERS;
      delete process.env.KAFKA_BROKERS;
      delete process.env.KAFKA_BOOTSTRAP_SERVERS;

      await consumer.start();
      expect(consumer.getStats().isRunning).toBe(false);

      // Restore
      if (originalBrokers) process.env.KAFKA_BROKERS = originalBrokers;
      if (originalBootstrap) process.env.KAFKA_BOOTSTRAP_SERVERS = originalBootstrap;
    });

    it('skips when database not configured', async () => {
      const { tryGetIntelligenceDb } = await import('../storage');
      (tryGetIntelligenceDb as ReturnType<typeof vi.fn>).mockReturnValue(null);

      // Set brokers to bypass broker check
      process.env.KAFKA_BROKERS = 'localhost:9092';

      await consumer.start();
      expect(consumer.getStats().isRunning).toBe(false);

      delete process.env.KAFKA_BROKERS;
    });
  });

  describe('stop', () => {
    it('handles stop when not running', async () => {
      // Should not throw
      await consumer.stop();
      expect(consumer.getStats().isRunning).toBe(false);
    });
  });

  // ============================================================================
  // LLM Cost Event Projection (OMN-2300 / OMN-2329)
  // ============================================================================

  describe('projectLlmCostEvent via handleMessage', () => {
    /**
     * Access private handleMessage through the consumer instance.
     * This is intentional test infrastructure to exercise the projection
     * logic without spinning up a full Kafka consumer.
     */
    function getHandleMessage(c: ReadModelConsumer) {
      return (
        c as unknown as { handleMessage: (p: EachMessagePayload) => Promise<void> }
      ).handleMessage.bind(c);
    }

    it('skips projection when DB is unavailable', async () => {
      const { tryGetIntelligenceDb } = await import('../storage');
      (tryGetIntelligenceDb as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const handleMessage = getHandleMessage(consumer);
      const payload = makeKafkaPayload('onex.evt.omniclaude.llm-cost-reported.v1', {
        model_name: 'claude-sonnet-4-6',
        prompt_tokens: 1000,
        completion_tokens: 500,
        total_tokens: 1500,
        total_cost_usd: 0.005,
        reported_cost_usd: 0.005,
        estimated_cost_usd: 0,
        usage_source: 'API',
      });

      // Should not throw even when DB is unavailable
      await handleMessage(payload);

      // Stats should remain at zero (DB unavailable → skipped)
      const stats = consumer.getStats();
      expect(stats.eventsProjected).toBe(0);
    });

    it('projects LLM cost event when DB is available', async () => {
      const { tryGetIntelligenceDb } = await import('../storage');

      // Mock a minimal Drizzle-like insert chain
      const insertMock = vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      // Mock db.execute so that updateWatermark succeeds instead of throwing a TypeError.
      // Without this mock, db.execute is undefined and updateWatermark silently swallows
      // the error (non-fatal path), which means the test passes but the watermark code
      // path is never exercised.
      const executeMock = vi.fn().mockResolvedValue(undefined);

      (tryGetIntelligenceDb as ReturnType<typeof vi.fn>).mockReturnValue({
        insert: insertMock,
        execute: executeMock,
      });

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const handleMessage = getHandleMessage(consumer);
      const payload = makeKafkaPayload('onex.evt.omniclaude.llm-cost-reported.v1', {
        model_name: 'claude-sonnet-4-6',
        repo_name: 'omnidash2',
        session_id: 'sess-abc-123',
        prompt_tokens: 2000,
        completion_tokens: 800,
        total_tokens: 2800,
        total_cost_usd: 0.012,
        reported_cost_usd: 0.012,
        estimated_cost_usd: 0,
        usage_source: 'API',
        request_count: 1,
      });

      await handleMessage(payload);

      // insert should have been called with llmCostAggregates table
      expect(insertMock).toHaveBeenCalled();

      // execute should have been called for the watermark upsert
      expect(executeMock).toHaveBeenCalled();

      // The watermark path should not have warned (i.e., db.execute succeeded)
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Failed to update watermark')
      );

      warnSpy.mockRestore();

      // Stats should reflect a successfully projected event
      const stats = consumer.getStats();
      expect(stats.eventsProjected).toBe(1);
      expect(stats.errorsCount).toBe(0);
      expect(stats.lastProjectedAt).not.toBeNull();
      expect(stats.topicStats['onex.evt.omniclaude.llm-cost-reported.v1']).toBeDefined();
      expect(stats.topicStats['onex.evt.omniclaude.llm-cost-reported.v1'].projected).toBe(1);
      expect(stats.topicStats['onex.evt.omniclaude.llm-cost-reported.v1'].errors).toBe(0);
    });

    it('derives total_tokens from prompt+completion when total_tokens=0', async () => {
      const { tryGetIntelligenceDb } = await import('../storage');

      const insertValues = vi.fn().mockResolvedValue(undefined);
      const insertMock = vi.fn().mockReturnValue({ values: insertValues });
      const executeMock = vi.fn().mockResolvedValue(undefined);

      (tryGetIntelligenceDb as ReturnType<typeof vi.fn>).mockReturnValue({
        insert: insertMock,
        execute: executeMock,
      });

      const handleMessage = getHandleMessage(consumer);
      const payload = makeKafkaPayload('onex.evt.omniclaude.llm-cost-reported.v1', {
        model_name: 'gpt-4',
        prompt_tokens: 1500,
        completion_tokens: 600,
        total_tokens: 0, // Intentionally zero — should be derived
        total_cost_usd: 0.008,
        reported_cost_usd: 0.008,
        estimated_cost_usd: 0,
        usage_source: 'API',
      });

      await handleMessage(payload);

      // Verify the values passed to insert included the derived total
      const insertArg = insertValues.mock.calls[0]?.[0];
      expect(insertArg).toBeDefined();
      // total_tokens should be derived as 1500 + 600 = 2100
      expect(insertArg.totalTokens).toBe(2100);

      // execute should have been called for the watermark upsert
      expect(executeMock).toHaveBeenCalled();

      // Stats should reflect a successfully projected event
      const stats = consumer.getStats();
      expect(stats.eventsProjected).toBe(1);
    });

    it('defaults model_name to "unknown" with warning when field is absent', async () => {
      const { tryGetIntelligenceDb } = await import('../storage');

      const insertValues = vi.fn().mockResolvedValue(undefined);
      const insertMock = vi.fn().mockReturnValue({ values: insertValues });
      const executeMock = vi.fn().mockResolvedValue(undefined);

      (tryGetIntelligenceDb as ReturnType<typeof vi.fn>).mockReturnValue({
        insert: insertMock,
        execute: executeMock,
      });

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const handleMessage = getHandleMessage(consumer);
      const payload = makeKafkaPayload('onex.evt.omniclaude.llm-cost-reported.v1', {
        // model_name intentionally absent
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        total_cost_usd: 0.001,
        reported_cost_usd: 0.001,
        estimated_cost_usd: 0,
        usage_source: 'API',
      });

      await handleMessage(payload);

      // Warning should be logged for missing model_name
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('missing model_name'));
      // Row should still be inserted with 'unknown'
      const insertArg = insertValues.mock.calls[0]?.[0];
      expect(insertArg?.modelName).toBe('unknown');

      // execute should have been called for the watermark upsert
      expect(executeMock).toHaveBeenCalled();

      warnSpy.mockRestore();

      // Stats should reflect a successfully projected event
      const stats = consumer.getStats();
      expect(stats.eventsProjected).toBe(1);
    });

    it('defaults usage_source to "API" for unrecognised values', async () => {
      const { tryGetIntelligenceDb } = await import('../storage');

      const insertValues = vi.fn().mockResolvedValue(undefined);
      const insertMock = vi.fn().mockReturnValue({ values: insertValues });
      const executeMock = vi.fn().mockResolvedValue(undefined);

      (tryGetIntelligenceDb as ReturnType<typeof vi.fn>).mockReturnValue({
        insert: insertMock,
        execute: executeMock,
      });

      const handleMessage = getHandleMessage(consumer);
      const payload = makeKafkaPayload('onex.evt.omniclaude.llm-cost-reported.v1', {
        model_name: 'gpt-4o',
        usage_source: 'INVALID_VALUE',
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        total_cost_usd: 0.001,
        reported_cost_usd: 0.001,
        estimated_cost_usd: 0,
      });

      await handleMessage(payload);

      const insertArg = insertValues.mock.calls[0]?.[0];
      expect(insertArg?.usageSource).toBe('API');

      // execute should have been called for the watermark upsert
      expect(executeMock).toHaveBeenCalled();

      // Stats should reflect a successfully projected event
      const stats = consumer.getStats();
      expect(stats.eventsProjected).toBe(1);
    });

    it('coerces non-finite cost values to 0', async () => {
      const { tryGetIntelligenceDb } = await import('../storage');

      const insertValues = vi.fn().mockResolvedValue(undefined);
      const insertMock = vi.fn().mockReturnValue({ values: insertValues });
      const executeMock = vi.fn().mockResolvedValue(undefined);

      (tryGetIntelligenceDb as ReturnType<typeof vi.fn>).mockReturnValue({
        insert: insertMock,
        execute: executeMock,
      });

      const handleMessage = getHandleMessage(consumer);
      const payload = makeKafkaPayload('onex.evt.omniclaude.llm-cost-reported.v1', {
        model_name: 'claude-opus-4',
        total_cost_usd: false, // non-numeric
        reported_cost_usd: null, // null
        estimated_cost_usd: 'NaN', // string NaN
        prompt_tokens: 200,
        completion_tokens: 100,
        total_tokens: 300,
        usage_source: 'ESTIMATED',
      });

      await handleMessage(payload);

      const insertArg = insertValues.mock.calls[0]?.[0];
      expect(insertArg?.totalCostUsd).toBe('0');
      expect(insertArg?.reportedCostUsd).toBe('0');
      expect(insertArg?.estimatedCostUsd).toBe('0');

      // execute should have been called for the watermark upsert
      expect(executeMock).toHaveBeenCalled();

      // Stats should reflect a successfully projected event
      const stats = consumer.getStats();
      expect(stats.eventsProjected).toBe(1);
    });

    it('gracefully handles the table-not-found error (42P01) and advances watermark', async () => {
      const { tryGetIntelligenceDb } = await import('../storage');

      const tableNotFoundErr = Object.assign(
        new Error('relation "llm_cost_aggregates" does not exist'),
        {
          code: '42P01',
        }
      );
      const insertMock = vi.fn().mockReturnValue({
        values: vi.fn().mockRejectedValue(tableNotFoundErr),
      });
      const executeMock = vi.fn().mockResolvedValue(undefined);

      (tryGetIntelligenceDb as ReturnType<typeof vi.fn>).mockReturnValue({
        insert: insertMock,
        execute: executeMock,
      });

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const handleMessage = getHandleMessage(consumer);
      const payload = makeKafkaPayload('onex.evt.omniclaude.llm-cost-reported.v1', {
        model_name: 'gpt-4',
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        total_cost_usd: 0.001,
        reported_cost_usd: 0.001,
        estimated_cost_usd: 0,
        usage_source: 'API',
      });

      // Should not throw — 42P01 is handled gracefully
      await handleMessage(payload);

      // Warning should be logged about missing table
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('llm_cost_aggregates table not yet created')
      );

      // Watermark should still be advanced even when the table is missing
      expect(executeMock).toHaveBeenCalled();

      // Watermark should still be advanced (projected=1 because the error is treated as handled)
      const stats = consumer.getStats();
      expect(stats.eventsProjected).toBe(1);
      expect(stats.errorsCount).toBe(0);

      warnSpy.mockRestore();
    });
  });
});
