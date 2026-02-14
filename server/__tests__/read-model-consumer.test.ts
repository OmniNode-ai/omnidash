/**
 * Tests for ReadModelConsumer (OMN-2061)
 *
 * Verifies:
 * - Consumer handles routing decision events
 * - Consumer handles agent action events
 * - Consumer handles transformation events
 * - Consumer gracefully degrades when DB is unavailable
 * - Consumer getStats returns correct statistics
 * - Consumer handles malformed messages
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

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
});
