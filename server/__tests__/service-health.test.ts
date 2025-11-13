import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkAllServices } from '../service-health';
import { intelligenceDb } from '../storage';
import { eventConsumer } from '../event-consumer';
import { sql } from 'drizzle-orm';
import { Kafka } from 'kafkajs';

// Mock dependencies
vi.mock('../storage', () => ({
  intelligenceDb: {
    execute: vi.fn(),
  },
}));

vi.mock('../event-consumer', () => ({
  eventConsumer: {
    getHealthStatus: vi.fn(),
  },
}));

vi.mock('kafkajs', () => ({
  Kafka: vi.fn(),
}));

// Mock global fetch
global.fetch = vi.fn();

describe('Service Health Checks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Note: Individual check functions are not exported, so we test via checkAllServices
  // or we can test the exported checkAllServices function which calls them all
  describe('checkPostgreSQL (via checkAllServices)', () => {
    it('should return up status when database is healthy', async () => {
      const mockResult = [{
        check: 1,
        current_time: new Date(),
        pg_version: 'PostgreSQL 15.0',
      }];

      vi.mocked(intelligenceDb.execute).mockResolvedValue(mockResult as any);

      const mockAdmin = {
        connect: vi.fn().mockResolvedValue(undefined),
        listTopics: vi.fn().mockResolvedValue([]),
        disconnect: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(Kafka).mockImplementation(() => ({
        admin: () => mockAdmin,
      } as any));

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
      } as any);

      vi.mocked(eventConsumer.getHealthStatus).mockReturnValue({
        status: 'healthy',
      } as any);

      const results = await checkAllServices();
      const pgResult = results.find(r => r.service === 'PostgreSQL');

      expect(pgResult).toBeDefined();
      expect(pgResult?.status).toBe('up');
      expect(pgResult?.latencyMs).toBeGreaterThanOrEqual(0);
      expect(pgResult?.details).toBeDefined();
      expect(pgResult?.details?.version).toBeDefined();
    });

    it('should return down status when database connection fails', async () => {
      vi.mocked(intelligenceDb.execute).mockRejectedValue(new Error('Connection refused'));

      const mockAdmin = {
        connect: vi.fn().mockResolvedValue(undefined),
        listTopics: vi.fn().mockResolvedValue([]),
        disconnect: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(Kafka).mockImplementation(() => ({
        admin: () => mockAdmin,
      } as any));

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
      } as any);

      vi.mocked(eventConsumer.getHealthStatus).mockReturnValue({
        status: 'healthy',
      } as any);

      const results = await checkAllServices();
      const pgResult = results.find(r => r.service === 'PostgreSQL');

      expect(pgResult).toBeDefined();
      expect(pgResult?.status).toBe('down');
      expect(pgResult?.error).toBeDefined();
      expect(pgResult?.error).toContain('Connection refused');
    });
  });

  describe('checkKafka (via checkAllServices)', () => {
    it('should return up status when Kafka is healthy', async () => {
      vi.mocked(intelligenceDb.execute).mockResolvedValue([{ check: 1 }] as any);

      const mockAdmin = {
        connect: vi.fn().mockResolvedValue(undefined),
        listTopics: vi.fn().mockResolvedValue(['topic1', 'topic2', 'topic3']),
        disconnect: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(Kafka).mockImplementation(() => ({
        admin: () => mockAdmin,
      } as any));

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
      } as any);

      vi.mocked(eventConsumer.getHealthStatus).mockReturnValue({
        status: 'healthy',
      } as any);

      const results = await checkAllServices();
      const kafkaResult = results.find(r => r.service === 'Kafka/Redpanda');

      expect(kafkaResult).toBeDefined();
      expect(kafkaResult?.status).toBe('up');
      expect(kafkaResult?.latencyMs).toBeGreaterThanOrEqual(0);
      expect(kafkaResult?.details?.topicCount).toBe(3);
      expect(mockAdmin.connect).toHaveBeenCalled();
      expect(mockAdmin.listTopics).toHaveBeenCalled();
      expect(mockAdmin.disconnect).toHaveBeenCalled();
    });

    it('should return down status when Kafka connection fails', async () => {
      vi.mocked(intelligenceDb.execute).mockResolvedValue([{ check: 1 }] as any);

      const mockAdmin = {
        connect: vi.fn().mockRejectedValue(new Error('Connection refused')),
      };

      vi.mocked(Kafka).mockImplementation(() => ({
        admin: () => mockAdmin,
      } as any));

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
      } as any);

      vi.mocked(eventConsumer.getHealthStatus).mockReturnValue({
        status: 'healthy',
      } as any);

      const results = await checkAllServices();
      const kafkaResult = results.find(r => r.service === 'Kafka/Redpanda');

      expect(kafkaResult).toBeDefined();
      expect(kafkaResult?.status).toBe('down');
      expect(kafkaResult?.error).toBeDefined();
      expect(kafkaResult?.error).toContain('Connection refused');
    });
  });

  describe('checkOmniarchon (via checkAllServices)', () => {
    it('should return up status when Omniarchon is healthy', async () => {
      vi.mocked(intelligenceDb.execute).mockResolvedValue([{ check: 1 }] as any);

      const mockAdmin = {
        connect: vi.fn().mockResolvedValue(undefined),
        listTopics: vi.fn().mockResolvedValue([]),
        disconnect: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(Kafka).mockImplementation(() => ({
        admin: () => mockAdmin,
      } as any));

      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: vi.fn().mockResolvedValue({ status: 'healthy' }),
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

      vi.mocked(eventConsumer.getHealthStatus).mockReturnValue({
        status: 'healthy',
      } as any);

      const results = await checkAllServices();
      const omniarchonResult = results.find(r => r.service === 'Omniarchon');

      expect(omniarchonResult).toBeDefined();
      expect(omniarchonResult?.status).toBe('up');
      expect(omniarchonResult?.latencyMs).toBeGreaterThanOrEqual(0);
      expect(omniarchonResult?.details?.url).toBeDefined();
      expect(omniarchonResult?.details?.statusCode).toBe(200);
    });

    it('should handle non-OK HTTP responses', async () => {
      vi.mocked(intelligenceDb.execute).mockResolvedValue([{ check: 1 }] as any);

      const mockAdmin = {
        connect: vi.fn().mockResolvedValue(undefined),
        listTopics: vi.fn().mockResolvedValue([]),
        disconnect: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(Kafka).mockImplementation(() => ({
        admin: () => mockAdmin,
      } as any));

      const mockResponse = {
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

      vi.mocked(eventConsumer.getHealthStatus).mockReturnValue({
        status: 'healthy',
      } as any);

      const results = await checkAllServices();
      const omniarchonResult = results.find(r => r.service === 'Omniarchon');

      expect(omniarchonResult).toBeDefined();
      expect(omniarchonResult?.status).toBe('down');
      expect(omniarchonResult?.error).toContain('HTTP 503');
    });

    it('should handle fetch errors', async () => {
      vi.mocked(intelligenceDb.execute).mockResolvedValue([{ check: 1 }] as any);

      const mockAdmin = {
        connect: vi.fn().mockResolvedValue(undefined),
        listTopics: vi.fn().mockResolvedValue([]),
        disconnect: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(Kafka).mockImplementation(() => ({
        admin: () => mockAdmin,
      } as any));

      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

      vi.mocked(eventConsumer.getHealthStatus).mockReturnValue({
        status: 'healthy',
      } as any);

      const results = await checkAllServices();
      const omniarchonResult = results.find(r => r.service === 'Omniarchon');

      expect(omniarchonResult).toBeDefined();
      expect(omniarchonResult?.status).toBe('down');
      expect(omniarchonResult?.error).toBeDefined();
      expect(omniarchonResult?.error).toContain('Network error');
    });
  });

  describe('checkEventConsumer (via checkAllServices)', () => {
    it('should return up status when event consumer is healthy', async () => {
      vi.mocked(intelligenceDb.execute).mockResolvedValue([{ check: 1 }] as any);

      const mockAdmin = {
        connect: vi.fn().mockResolvedValue(undefined),
        listTopics: vi.fn().mockResolvedValue([]),
        disconnect: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(Kafka).mockImplementation(() => ({
        admin: () => mockAdmin,
      } as any));

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
      } as any);

      vi.mocked(eventConsumer.getHealthStatus).mockReturnValue({
        status: 'healthy',
        eventsProcessed: 100,
        recentActionsCount: 10,
      } as any);

      const results = await checkAllServices();
      const eventConsumerResult = results.find(r => r.service === 'Event Consumer');

      expect(eventConsumerResult).toBeDefined();
      expect(eventConsumerResult?.status).toBe('up');
      expect(eventConsumerResult?.details?.eventsProcessed).toBe(100);
    });

    it('should return down status when event consumer is unhealthy', async () => {
      vi.mocked(intelligenceDb.execute).mockResolvedValue([{ check: 1 }] as any);

      const mockAdmin = {
        connect: vi.fn().mockResolvedValue(undefined),
        listTopics: vi.fn().mockResolvedValue([]),
        disconnect: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(Kafka).mockImplementation(() => ({
        admin: () => mockAdmin,
      } as any));

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
      } as any);

      vi.mocked(eventConsumer.getHealthStatus).mockReturnValue({
        status: 'unhealthy',
        eventsProcessed: 0,
        recentActionsCount: 0,
      } as any);

      const results = await checkAllServices();
      const eventConsumerResult = results.find(r => r.service === 'Event Consumer');

      expect(eventConsumerResult).toBeDefined();
      expect(eventConsumerResult?.status).toBe('down');
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(intelligenceDb.execute).mockResolvedValue([{ check: 1 }] as any);

      const mockAdmin = {
        connect: vi.fn().mockResolvedValue(undefined),
        listTopics: vi.fn().mockResolvedValue([]),
        disconnect: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(Kafka).mockImplementation(() => ({
        admin: () => mockAdmin,
      } as any));

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
      } as any);

      vi.mocked(eventConsumer.getHealthStatus).mockImplementation(() => {
        throw new Error('Event consumer error');
      });

      const results = await checkAllServices();
      const eventConsumerResult = results.find(r => r.service === 'Event Consumer');

      expect(eventConsumerResult).toBeDefined();
      expect(eventConsumerResult?.status).toBe('down');
      expect(eventConsumerResult?.error).toBeDefined();
      expect(eventConsumerResult?.error).toContain('Event consumer error');
    });
  });

  describe('checkAllServices', () => {
    it('should check all services and return array of results', async () => {
      // Mock all service checks
      vi.mocked(intelligenceDb.execute).mockResolvedValue([{ check: 1 }] as any);

      const mockAdmin = {
        connect: vi.fn().mockResolvedValue(undefined),
        listTopics: vi.fn().mockResolvedValue([]),
        disconnect: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(Kafka).mockImplementation(() => ({
        admin: () => mockAdmin,
      } as any));

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
      } as any);

      vi.mocked(eventConsumer.getHealthStatus).mockReturnValue({
        status: 'healthy',
      } as any);

      const results = await checkAllServices();

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(4);
      expect(results[0].service).toBe('PostgreSQL');
      expect(results[1].service).toBe('Kafka/Redpanda');
      expect(results[2].service).toBe('Omniarchon');
      expect(results[3].service).toBe('Event Consumer');
    });
  });
});

