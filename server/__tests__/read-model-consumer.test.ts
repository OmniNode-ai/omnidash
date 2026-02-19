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

// Mock projection-bootstrap so baselinesProjection.reset() is a no-op spy
// that does not interact with the DB or bleed state across tests.
vi.mock('../projection-bootstrap', () => ({
  baselinesProjection: {
    reset: vi.fn(),
  },
}));

// Mock baselines-events so emitBaselinesUpdate() is a no-op spy.
vi.mock('../baselines-events', () => ({
  emitBaselinesUpdate: vi.fn(),
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
    vi.clearAllMocks();
    consumer = new ReadModelConsumer();
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
      const payload = makeKafkaPayload('onex.evt.omniintelligence.llm-call-completed.v1', {
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

    it('projects LLM cost event when DB is available (legacy schema)', async () => {
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
      // Legacy schema: uses model_name, total_cost_usd, reported_cost_usd, usage_source
      const payload = makeKafkaPayload('onex.evt.omniintelligence.llm-call-completed.v1', {
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
      expect(stats.topicStats['onex.evt.omniintelligence.llm-call-completed.v1']).toBeDefined();
      expect(stats.topicStats['onex.evt.omniintelligence.llm-call-completed.v1'].projected).toBe(1);
      expect(stats.topicStats['onex.evt.omniintelligence.llm-call-completed.v1'].errors).toBe(0);
    });

    it('projects ContractLlmCallMetrics canonical payload (OMN-2371)', async () => {
      // OMN-2371 (GAP-5): Verify that the canonical producer payload schema
      // (ContractLlmCallMetrics from omnibase_spi) is correctly projected.
      // Key differences from legacy schema:
      //   - model_id (not model_name)
      //   - usage_normalized.source (nested, not top-level usage_source)
      //   - estimated_cost_usd only (no total_cost_usd / reported_cost_usd)
      //   - timestamp_iso (not timestamp or created_at)
      //   - reporting_source (not repo_name)
      const { tryGetIntelligenceDb } = await import('../storage');

      const insertValues = vi.fn().mockResolvedValue(undefined);
      const insertMock = vi.fn().mockReturnValue({ values: insertValues });
      const executeMock = vi.fn().mockResolvedValue(undefined);

      (tryGetIntelligenceDb as ReturnType<typeof vi.fn>).mockReturnValue({
        insert: insertMock,
        execute: executeMock,
      });

      const handleMessage = getHandleMessage(consumer);
      const payload = makeKafkaPayload('onex.evt.omniintelligence.llm-call-completed.v1', {
        // ContractLlmCallMetrics canonical fields
        schema_version: '1.0',
        model_id: 'claude-sonnet-4-6',
        prompt_tokens: 3000,
        completion_tokens: 1200,
        total_tokens: 4200,
        estimated_cost_usd: 0.018,
        latency_ms: 1450.5,
        usage_normalized: {
          schema_version: '1.0',
          prompt_tokens: 3000,
          completion_tokens: 1200,
          total_tokens: 4200,
          source: 'API',
          usage_is_estimated: false,
        },
        usage_is_estimated: false,
        timestamp_iso: '2026-02-19T10:00:00Z',
        reporting_source: 'omniclaude',
        contract_version: '1.0',
      });

      await handleMessage(payload);

      expect(insertMock).toHaveBeenCalled();
      expect(executeMock).toHaveBeenCalled();

      // Verify the row was built with the canonical field mappings
      const insertArg = insertValues.mock.calls[0]?.[0];
      expect(insertArg).toBeDefined();
      // model_id → modelName
      expect(insertArg.modelName).toBe('claude-sonnet-4-6');
      // usage_normalized.source → usageSource (uppercased)
      expect(insertArg.usageSource).toBe('API');
      // estimated_cost_usd → totalCostUsd (fallback) and estimatedCostUsd
      expect(insertArg.estimatedCostUsd).toBe('0.018');
      expect(insertArg.totalCostUsd).toBe('0.018');
      // timestamp_iso → bucketTime
      expect(insertArg.bucketTime).toBeInstanceOf(Date);
      // granularity defaults to 'hour' for per-call events
      expect(insertArg.granularity).toBe('hour');
      // token counts match
      expect(insertArg.promptTokens).toBe(3000);
      expect(insertArg.completionTokens).toBe(1200);
      expect(insertArg.totalTokens).toBe(4200);

      const stats = consumer.getStats();
      expect(stats.eventsProjected).toBe(1);
      expect(stats.errorsCount).toBe(0);
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
      const payload = makeKafkaPayload('onex.evt.omniintelligence.llm-call-completed.v1', {
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

    it('defaults model_name to "unknown" with warning when model_id and model_name are absent', async () => {
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
      const payload = makeKafkaPayload('onex.evt.omniintelligence.llm-call-completed.v1', {
        // model_id and model_name intentionally absent
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        total_cost_usd: 0.001,
        reported_cost_usd: 0.001,
        estimated_cost_usd: 0,
        usage_source: 'API',
      });

      await handleMessage(payload);

      // Warning should be logged for missing model_id/model_name
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('missing model_id/model_name'));
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
      const payload = makeKafkaPayload('onex.evt.omniintelligence.llm-call-completed.v1', {
        model_id: 'gpt-4o',
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
      const payload = makeKafkaPayload('onex.evt.omniintelligence.llm-call-completed.v1', {
        model_id: 'claude-opus-4',
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
      const payload = makeKafkaPayload('onex.evt.omniintelligence.llm-call-completed.v1', {
        model_id: 'gpt-4',
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

  // ============================================================================
  // Baselines Snapshot Projection (OMN-2331)
  // ============================================================================

  describe('projectBaselinesSnapshot via handleMessage', () => {
    function getHandleMessage(c: ReadModelConsumer) {
      return (
        c as unknown as { handleMessage: (p: EachMessagePayload) => Promise<void> }
      ).handleMessage.bind(c);
    }

    /**
     * Build a minimal valid baselines-computed payload.
     * All child arrays include at least one row so every insert branch is exercised.
     */
    function makeBaselinesPayload(overrides: Record<string, unknown> = {}): EachMessagePayload {
      return makeKafkaPayload('onex.evt.omnibase-infra.baselines-computed.v1', {
        snapshot_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        contract_version: 1,
        computed_at_utc: '2026-02-18T00:00:00Z',
        comparisons: [
          {
            pattern_id: 'pat-1',
            pattern_name: 'test-pattern',
            sample_size: 10,
            window_start: '2026-01-01',
            window_end: '2026-02-01',
            token_delta: {},
            time_delta: {},
            retry_delta: {},
            test_pass_rate_delta: {},
            review_iteration_delta: {},
            recommendation: 'promote',
            confidence: 'high',
            rationale: 'looks good',
          },
        ],
        trend: [
          {
            date: '2026-02-01',
            avg_cost_savings: 0.1,
            avg_outcome_improvement: 0.05,
            comparisons_evaluated: 3,
          },
        ],
        breakdown: [{ action: 'promote', count: 5, avg_confidence: 0.9 }],
        ...overrides,
      });
    }

    /**
     * Build a mock db that satisfies the transaction-based write in
     * projectBaselinesSnapshot. The transaction callback is invoked
     * synchronously with a tx object whose insert/delete chains all resolve.
     *
     * The tx.insert mock tracks which table is being inserted into by call order.
     * Call 1 = snapshot header (needs onConflictDoUpdate chain).
     * Calls 2-4 = child rows (values resolves directly).
     *
     * A factory function is returned so each test call gets a fresh closure
     * with its own independent insertCallCount — this ensures idempotency tests
     * that call handleMessage twice don't corrupt the mock's per-call dispatch.
     */
    function makeMockDb() {
      const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
      const childInsertValues = vi.fn().mockResolvedValue(undefined);
      const deleteWhere = vi.fn().mockResolvedValue(undefined);
      const deleteMock = vi.fn().mockReturnValue({ where: deleteWhere });

      // Build a fresh tx per transaction invocation so each transaction's
      // insert call counter starts at 0 even when handleMessage is called twice.
      function makeTx() {
        let txInsertCount = 0;
        const txInsert = vi.fn().mockImplementation(() => {
          txInsertCount++;
          if (txInsertCount === 1) {
            return { values: vi.fn().mockReturnValue({ onConflictDoUpdate }) };
          }
          return { values: childInsertValues };
        });
        return { insert: txInsert, delete: deleteMock };
      }

      const executeMock = vi.fn().mockResolvedValue(undefined);

      const db = {
        transaction: vi
          .fn()
          .mockImplementation(async (fn: (tx: ReturnType<typeof makeTx>) => Promise<void>) => {
            await fn(makeTx());
          }),
        execute: executeMock,
      };

      return { db, deleteMock, childInsertValues, executeMock };
    }

    it('happy path: writes all 4 tables and advances watermark', async () => {
      const { tryGetIntelligenceDb } = await import('../storage');
      const { baselinesProjection } = await import('../projection-bootstrap');
      const { emitBaselinesUpdate } = await import('../baselines-events');
      const { db, deleteMock, childInsertValues, executeMock } = makeMockDb();
      (tryGetIntelligenceDb as ReturnType<typeof vi.fn>).mockReturnValue(db);

      const handleMessage = getHandleMessage(consumer);
      await handleMessage(makeBaselinesPayload());

      // transaction was entered once
      expect(db.transaction).toHaveBeenCalledTimes(1);

      // deletes for comparisons, trend, breakdown
      expect(deleteMock).toHaveBeenCalledTimes(3);

      // child row inserts: comparisons + trend + breakdown = 3
      expect(childInsertValues).toHaveBeenCalledTimes(3);

      // The comparisons insert is the first child insert call (txInsertCount === 2).
      // Verify the recommendation field is 'promote' (the valid happy-path value),
      // not 'shadow' (which would indicate the invalid-value fallback coercion fired).
      const comparisonsInsertArg = childInsertValues.mock.calls[0]?.[0];
      expect(comparisonsInsertArg).toBeDefined();
      const firstComparison = Array.isArray(comparisonsInsertArg)
        ? comparisonsInsertArg[0]
        : comparisonsInsertArg;
      expect(firstComparison?.recommendation).toBe('promote');

      // watermark updated
      expect(executeMock).toHaveBeenCalled();

      // projection cache should have been invalidated after the DB writes committed
      expect(baselinesProjection.reset).toHaveBeenCalledTimes(1);

      // WebSocket clients should have been notified with the correct snapshot ID
      expect(emitBaselinesUpdate).toHaveBeenCalledTimes(1);
      expect(emitBaselinesUpdate).toHaveBeenCalledWith('a1b2c3d4-e5f6-7890-abcd-ef1234567890');

      const stats = consumer.getStats();
      expect(stats.eventsProjected).toBe(1);
      expect(stats.errorsCount).toBe(0);
    });

    it('idempotency: re-delivering the same UUID snapshot_id upserts the header and re-projects child rows without double-inserting', async () => {
      const { tryGetIntelligenceDb } = await import('../storage');
      const { db, childInsertValues } = makeMockDb();
      (tryGetIntelligenceDb as ReturnType<typeof vi.fn>).mockReturnValue(db);

      const handleMessage = getHandleMessage(consumer);
      const payload = makeBaselinesPayload();

      await handleMessage(payload);
      await handleMessage(payload);

      // Two rounds → two transactions entered
      expect(db.transaction).toHaveBeenCalledTimes(2);

      // Each round inserts 3 child batches (comparisons + trend + breakdown) = 6 total.
      // The header is upserted via onConflictDoUpdate so it is safe to re-deliver.
      expect(childInsertValues).toHaveBeenCalledTimes(6);

      const stats = consumer.getStats();
      expect(stats.eventsProjected).toBe(2);
      expect(stats.errorsCount).toBe(0);
    });

    it('graceful degrade: 42P01 error returns without crashing', async () => {
      const { tryGetIntelligenceDb } = await import('../storage');

      const tableNotFoundErr = Object.assign(
        new Error('relation "baselines_snapshots" does not exist'),
        { code: '42P01' }
      );
      const db = {
        transaction: vi.fn().mockRejectedValue(tableNotFoundErr),
        execute: vi.fn().mockResolvedValue(undefined),
      };
      (tryGetIntelligenceDb as ReturnType<typeof vi.fn>).mockReturnValue(db);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const handleMessage = getHandleMessage(consumer);
      // Should not throw
      await handleMessage(makeBaselinesPayload());

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('baselines_* tables not yet created')
      );

      // Event is treated as handled so watermark advances (projected=1, errors=0)
      const stats = consumer.getStats();
      expect(stats.eventsProjected).toBe(1);
      expect(stats.errorsCount).toBe(0);

      warnSpy.mockRestore();
    });

    it('blank date filtering: trend rows with null/empty date are skipped with a warning', async () => {
      const { tryGetIntelligenceDb } = await import('../storage');
      const { db, childInsertValues } = makeMockDb();
      (tryGetIntelligenceDb as ReturnType<typeof vi.fn>).mockReturnValue(db);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const handleMessage = getHandleMessage(consumer);
      await handleMessage(
        makeBaselinesPayload({
          trend: [
            // Row with null date — should be filtered out
            {
              date: null,
              avg_cost_savings: 0.1,
              avg_outcome_improvement: 0.05,
              comparisons_evaluated: 1,
            },
            // Row with empty string date — should be filtered out
            {
              date: '',
              avg_cost_savings: 0.2,
              avg_outcome_improvement: 0.1,
              comparisons_evaluated: 2,
            },
            // Row with a valid date — should pass through
            {
              date: '2026-02-15',
              avg_cost_savings: 0.3,
              avg_outcome_improvement: 0.15,
              comparisons_evaluated: 3,
            },
          ],
        })
      );

      // Warning should fire exactly once for each of the two bad rows
      expect(warnSpy).toHaveBeenCalledTimes(2);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Skipping trend row with blank/null date'),
        expect.any(String)
      );

      // comparisons + trend (1 valid row filtered from 3) + breakdown = 3 child inserts
      expect(childInsertValues).toHaveBeenCalledTimes(3);

      // Verify the valid trend row made it into the insert
      const allInsertArgs = childInsertValues.mock.calls.flatMap((call) =>
        Array.isArray(call[0]) ? call[0] : []
      );
      const trendRow = allInsertArgs.find(
        (row: Record<string, unknown>) => row.date === '2026-02-15'
      );
      expect(trendRow).toBeDefined();

      warnSpy.mockRestore();
    });

    it('blank date filtering: trend rows with malformed date format are skipped with a warning', async () => {
      const { tryGetIntelligenceDb } = await import('../storage');
      const { db, childInsertValues } = makeMockDb();
      (tryGetIntelligenceDb as ReturnType<typeof vi.fn>).mockReturnValue(db);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const handleMessage = getHandleMessage(consumer);
      await handleMessage(
        makeBaselinesPayload({
          trend: [
            // Row with MM/DD/YYYY format — should be filtered out (fails YYYY-MM-DD regex)
            {
              date: '02/15/2026',
              avg_cost_savings: 0.1,
              avg_outcome_improvement: 0.05,
              comparisons_evaluated: 1,
            },
            // Row with a valid ISO date — should pass through
            {
              date: '2026-02-15',
              avg_cost_savings: 0.3,
              avg_outcome_improvement: 0.15,
              comparisons_evaluated: 3,
            },
          ],
        })
      );

      // Warning should fire for the malformed-format row
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Skipping trend row with malformed date format'),
        expect.any(String)
      );

      // comparisons + trend (1 valid row filtered from 2) + breakdown = 3 child inserts
      expect(childInsertValues).toHaveBeenCalledTimes(3);

      // Verify only the valid trend row made it into the insert
      const allInsertArgs = childInsertValues.mock.calls.flatMap((call) =>
        Array.isArray(call[0]) ? call[0] : []
      );
      const trendRow = allInsertArgs.find(
        (row: Record<string, unknown>) => row.date === '2026-02-15'
      );
      expect(trendRow).toBeDefined();

      const malformedRow = allInsertArgs.find(
        (row: Record<string, unknown>) => row.date === '02/15/2026'
      );
      expect(malformedRow).toBeUndefined();

      warnSpy.mockRestore();
    });

    it('coerces invalid confidence and recommendation values to safe defaults', async () => {
      const { tryGetIntelligenceDb } = await import('../storage');
      const { db, childInsertValues } = makeMockDb();
      (tryGetIntelligenceDb as ReturnType<typeof vi.fn>).mockReturnValue(db);

      const handleMessage = getHandleMessage(consumer);
      await handleMessage(
        makeBaselinesPayload({
          comparisons: [
            {
              pattern_id: 'pat-1',
              pattern_name: 'Test Pattern',
              recommendation: 'DEMOTE', // invalid — should coerce to 'shadow'
              confidence: 'VERY_HIGH', // invalid — should coerce to 'low'
              rationale: 'test',
              cost_delta: 0,
              outcome_improvement: 0,
              test_pass_rate_delta: {},
              review_iteration_delta: {},
              window_start: '2026-02-01',
              window_end: '2026-02-15',
            },
          ],
        })
      );

      const allInsertArgs = childInsertValues.mock.calls.flatMap((call) =>
        Array.isArray(call[0]) ? call[0] : []
      );
      const compRow = allInsertArgs.find(
        (row: Record<string, unknown>) => row.patternId === 'pat-1'
      );
      expect(compRow).toBeDefined();
      expect(compRow?.recommendation).toBe('shadow');
      expect(compRow?.confidence).toBe('low');
    });
  });
});
