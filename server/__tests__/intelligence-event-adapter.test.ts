import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted to set environment variables before module loading
vi.hoisted(() => {
  process.env.KAFKA_BROKERS = 'localhost:9092';
  process.env.KAFKA_BOOTSTRAP_SERVERS = 'localhost:9092';
});

// Mock Kafka BEFORE importing modules that use it
vi.mock('kafkajs', () => ({
  Kafka: vi.fn(),
}));

import { IntelligenceEventAdapter } from '../intelligence-event-adapter';
import { Kafka } from 'kafkajs';

describe('IntelligenceEventAdapter', () => {
  let adapter: IntelligenceEventAdapter;
  let mockProducer: any;
  let mockConsumer: any;
  let messageHandler: any;

  beforeEach(() => {
    mockProducer = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockResolvedValue(undefined),
    };

    mockConsumer = {
      connect: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockResolvedValue(undefined),
      run: vi.fn().mockImplementation(({ eachMessage }) => {
        messageHandler = eachMessage;
        return Promise.resolve();
      }),
      disconnect: vi.fn().mockResolvedValue(undefined),
    };

    vi.mocked(Kafka).mockImplementation(
      () =>
        ({
          producer: () => mockProducer,
          consumer: () => mockConsumer,
        }) as any
    );

    adapter = new IntelligenceEventAdapter(['localhost:9092']);
  });

  afterEach(async () => {
    if (adapter) {
      await adapter.stop().catch(() => {});
    }
    vi.clearAllMocks();
  });

  describe('start', () => {
    it('should connect producer and consumer', async () => {
      await adapter.start();

      expect(mockProducer.connect).toHaveBeenCalled();
      expect(mockConsumer.connect).toHaveBeenCalled();
      expect(mockConsumer.subscribe).toHaveBeenCalledTimes(2);
      expect(mockConsumer.run).toHaveBeenCalled();
    });

    it('should not start twice', async () => {
      await adapter.start();
      await adapter.start();

      expect(mockProducer.connect).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop', () => {
    it('should disconnect producer and consumer', async () => {
      await adapter.start();
      await adapter.stop();

      expect(mockConsumer.disconnect).toHaveBeenCalled();
      expect(mockProducer.disconnect).toHaveBeenCalled();
    });

    it('should handle stop when not started', async () => {
      await expect(adapter.stop()).resolves.not.toThrow();
    });
  });

  describe('request', () => {
    it('should throw if not started', async () => {
      await expect(adapter.request('test', { data: 'test' })).rejects.toThrow(
        'IntelligenceEventAdapter not started'
      );
    });

    it('should send request and wait for response', async () => {
      await adapter.start();

      // Mock send to capture correlation ID
      let capturedCorrelationId: string | undefined;
      mockProducer.send.mockImplementation((args: any) => {
        const messages = args.messages;
        if (messages && messages.length > 0) {
          capturedCorrelationId = messages[0].key?.toString();
        }
        return Promise.resolve();
      });

      const requestPromise = adapter.request('test', { data: 'test' }, 2000);

      // Wait a bit for the request to be sent
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Simulate completed response
      if (messageHandler && capturedCorrelationId) {
        await messageHandler({
          topic: adapter.TOPIC_COMPLETED,
          message: {
            key: Buffer.from(capturedCorrelationId),
            value: Buffer.from(
              JSON.stringify({
                correlation_id: capturedCorrelationId,
                payload: { result: 'success' },
              })
            ),
          },
        });
      }

      const result = await requestPromise;
      expect(result).toEqual({ result: 'success' });
    });

    it('should handle timeout', async () => {
      await adapter.start();

      await expect(adapter.request('test', { data: 'test' }, 100)).rejects.toThrow();
    });

    it('should handle failed response', async () => {
      await adapter.start();

      // Mock send to capture correlation ID
      let capturedCorrelationId: string | undefined;
      mockProducer.send.mockImplementation((args: any) => {
        const messages = args.messages;
        if (messages && messages.length > 0) {
          capturedCorrelationId = messages[0].key?.toString();
        }
        return Promise.resolve();
      });

      const requestPromise = adapter.request('test', { data: 'test' }, 2000);

      // Wait a bit for the request to be sent
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Simulate failed response
      if (messageHandler && capturedCorrelationId) {
        await messageHandler({
          topic: adapter.TOPIC_FAILED,
          message: {
            key: Buffer.from(capturedCorrelationId),
            value: Buffer.from(
              JSON.stringify({
                correlation_id: capturedCorrelationId,
                payload: { error_message: 'Test error' },
              })
            ),
          },
        });
      }

      await expect(requestPromise).rejects.toThrow('Test error');
    });
  });

  describe('requestPatternDiscovery', () => {
    it('should call request with pattern extraction parameters', async () => {
      await adapter.start();

      // Mock send to capture what was sent
      let capturedPayload: any;
      mockProducer.send.mockImplementation(async (args: any) => {
        const messages = args.messages;
        if (messages && messages.length > 0) {
          const value = JSON.parse(messages[0].value.toString());
          capturedPayload = value.payload;
        }
        return Promise.resolve();
      });

      // This will timeout, but we can check the payload
      const requestPromise = adapter.requestPatternDiscovery(
        {
          sourcePath: '/path/to/file.py',
          language: 'python',
          project: 'test-project',
          operationType: 'PATTERN_EXTRACTION',
        },
        100
      ); // Short timeout

      // Wait a bit for the request to be sent
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Check that the payload contains the expected fields
      expect(capturedPayload).toBeDefined();
      expect(capturedPayload.source_path).toBe('/path/to/file.py');
      expect(capturedPayload.language).toBe('python');
      expect(capturedPayload.project_id).toBe('test-project');
      expect(capturedPayload.operation_type).toBe('PATTERN_EXTRACTION');

      // Let the request timeout
      await expect(requestPromise).rejects.toThrow();
    });

    it('should use default operation type if not provided', async () => {
      await adapter.start();

      let capturedPayload: any;
      mockProducer.send.mockImplementation(async (args: any) => {
        const messages = args.messages;
        if (messages && messages.length > 0) {
          const value = JSON.parse(messages[0].value.toString());
          capturedPayload = value.payload;
        }
        return Promise.resolve();
      });

      const requestPromise = adapter.requestPatternDiscovery(
        {
          sourcePath: '/path/to/file.py',
          language: 'python',
        },
        100
      );

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(capturedPayload).toBeDefined();
      expect(capturedPayload.operation_type).toBe('PATTERN_EXTRACTION');

      await expect(requestPromise).rejects.toThrow();
    });
  });
});
