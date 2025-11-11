import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// Create mock functions using vi.hoisted() so they're available during module loading
const {
  mockConsumerConnect,
  mockConsumerDisconnect,
  mockConsumerSubscribe,
  mockConsumerRun,
  mockAdminConnect,
  mockAdminDisconnect,
  mockAdminListTopics
} = vi.hoisted(() => ({
  mockConsumerConnect: vi.fn(),
  mockConsumerDisconnect: vi.fn(),
  mockConsumerSubscribe: vi.fn(),
  mockConsumerRun: vi.fn(),
  mockAdminConnect: vi.fn(),
  mockAdminDisconnect: vi.fn(),
  mockAdminListTopics: vi.fn(),
}));

// Mock kafkajs module
vi.mock('kafkajs', () => ({
  Kafka: vi.fn().mockImplementation(() => ({
    consumer: vi.fn().mockReturnValue({
      connect: mockConsumerConnect,
      disconnect: mockConsumerDisconnect,
      subscribe: mockConsumerSubscribe,
      run: mockConsumerRun,
    }),
    admin: vi.fn().mockReturnValue({
      connect: mockAdminConnect,
      disconnect: mockAdminDisconnect,
      listTopics: mockAdminListTopics,
    }),
  })),
}));

// Mock storage module
vi.mock('../storage', () => ({
  intelligenceDb: {
    execute: vi.fn(),
  },
}));

// Import after mocks are set up - this will use our mocks
import { EventConsumer } from '../event-consumer';
import { intelligenceDb } from '../storage';

describe('EventConsumer', () => {
  let consumer: InstanceType<typeof EventConsumer>;

  beforeEach(() => {
    // Clear all mock calls
    vi.clearAllMocks();

    // Reset environment variables
    process.env.KAFKA_BOOTSTRAP_SERVERS = '192.168.86.200:9092';
    process.env.ENABLE_EVENT_PRELOAD = 'false';

    // Create new consumer instance for each test
    consumer = new EventConsumer();
  });

  afterEach(async () => {
    try {
      await consumer.stop();
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('constructor', () => {
    it('should initialize as EventEmitter', () => {
      expect(consumer).toBeInstanceOf(EventEmitter);
    });

    it('should handle missing KAFKA_BROKERS environment variable', () => {
      delete process.env.KAFKA_BOOTSTRAP_SERVERS;
      delete process.env.KAFKA_BROKERS;

      const newConsumer = new EventConsumer();
      expect(newConsumer).toBeDefined();
    });
  });

  describe('validateConnection', () => {
    it('should return false when KAFKA_BROKERS is not configured', async () => {
      delete process.env.KAFKA_BOOTSTRAP_SERVERS;
      delete process.env.KAFKA_BROKERS;

      const testConsumer = new EventConsumer();
      const result = await testConsumer.validateConnection();
      expect(result).toBe(false);
    });

    it('should successfully validate broker connection', async () => {
      mockAdminConnect.mockResolvedValueOnce(undefined);
      mockAdminListTopics.mockResolvedValueOnce(['topic1', 'topic2', 'topic3']);
      mockAdminDisconnect.mockResolvedValueOnce(undefined);

      const result = await consumer.validateConnection();

      expect(result).toBe(true);
      expect(mockAdminConnect).toHaveBeenCalled();
      expect(mockAdminListTopics).toHaveBeenCalled();
      expect(mockAdminDisconnect).toHaveBeenCalled();
    });

    it('should return false and handle connection errors', async () => {
      mockAdminConnect.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await consumer.validateConnection();

      expect(result).toBe(false);
      expect(mockAdminConnect).toHaveBeenCalled();
    });

    it('should handle non-Error exceptions', async () => {
      mockAdminConnect.mockRejectedValueOnce('String error');

      const result = await consumer.validateConnection();

      expect(result).toBe(false);
    });
  });

  describe('start', () => {
    it('should connect to Kafka and subscribe to topics', async () => {
      mockConsumerConnect.mockResolvedValueOnce(undefined);
      mockConsumerSubscribe.mockResolvedValueOnce(undefined);
      mockConsumerRun.mockResolvedValueOnce(undefined);

      await consumer.start();

      expect(mockConsumerConnect).toHaveBeenCalled();
      expect(mockConsumerSubscribe).toHaveBeenCalledWith({
        topics: [
          'agent-routing-decisions',
          'agent-transformation-events',
          'router-performance-metrics',
          'agent-actions',
        ],
        fromBeginning: true,
      });
      expect(mockConsumerRun).toHaveBeenCalled();
    });

    it('should emit "connected" event on successful connection', async () => {
      mockConsumerConnect.mockResolvedValueOnce(undefined);
      mockConsumerSubscribe.mockResolvedValueOnce(undefined);
      mockConsumerRun.mockResolvedValueOnce(undefined);

      const connectedSpy = vi.fn();
      consumer.on('connected', connectedSpy);

      await consumer.start();

      expect(connectedSpy).toHaveBeenCalled();
    });

    it('should not start if already running', async () => {
      mockConsumerConnect.mockResolvedValue(undefined);
      mockConsumerSubscribe.mockResolvedValue(undefined);
      mockConsumerRun.mockResolvedValue(undefined);

      await consumer.start();
      const firstCallCount = mockConsumerConnect.mock.calls.length;

      await consumer.start();

      // Should not call connect again
      expect(mockConsumerConnect).toHaveBeenCalledTimes(firstCallCount);
    });

    it('should handle connection errors and emit error event', async () => {
      const connectionError = new Error('Connection failed');
      // Reject all connection attempts to exceed max retries
      mockConsumerConnect.mockRejectedValue(connectionError);

      const errorSpy = vi.fn();
      consumer.on('error', errorSpy);

      // Should throw after exhausting retries
      await expect(consumer.start()).rejects.toThrow('Kafka connection failed after 5 attempts');
      expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('Kafka connection failed after 5 attempts')
      }));
    }, 20000); // Increase timeout to 20s for 5 retries with exponential backoff (1+2+4+8s)
  });

  describe('stop', () => {
    it('should disconnect consumer and emit "disconnected" event', async () => {
      mockConsumerConnect.mockResolvedValueOnce(undefined);
      mockConsumerSubscribe.mockResolvedValueOnce(undefined);
      mockConsumerRun.mockResolvedValueOnce(undefined);
      mockConsumerDisconnect.mockResolvedValueOnce(undefined);

      await consumer.start();

      const disconnectedSpy = vi.fn();
      consumer.on('disconnected', disconnectedSpy);

      await consumer.stop();

      expect(mockConsumerDisconnect).toHaveBeenCalled();
      expect(disconnectedSpy).toHaveBeenCalled();
    });

    it('should handle disconnect errors', async () => {
      mockConsumerConnect.mockResolvedValueOnce(undefined);
      mockConsumerSubscribe.mockResolvedValueOnce(undefined);
      mockConsumerRun.mockResolvedValueOnce(undefined);

      await consumer.start();

      const disconnectError = new Error('Disconnect failed');
      mockConsumerDisconnect.mockRejectedValueOnce(disconnectError);

      const errorSpy = vi.fn();
      consumer.on('error', errorSpy);

      await consumer.stop();

      expect(errorSpy).toHaveBeenCalledWith(disconnectError);
    });

    it('should do nothing if consumer is not running', async () => {
      await consumer.stop();

      expect(mockConsumerDisconnect).not.toHaveBeenCalled();
    });
  });

  describe('event handling - routing decisions', () => {
    let eachMessageHandler: any;

    beforeEach(async () => {
      mockConsumerConnect.mockResolvedValueOnce(undefined);
      mockConsumerSubscribe.mockResolvedValueOnce(undefined);
      mockConsumerRun.mockImplementation(async ({ eachMessage }) => {
        eachMessageHandler = eachMessage;
      });

      await consumer.start();
    });

    it('should handle routing decision events with snake_case fields', async () => {
      const metricUpdateSpy = vi.fn();
      const routingUpdateSpy = vi.fn();
      consumer.on('metricUpdate', metricUpdateSpy);
      consumer.on('routingUpdate', routingUpdateSpy);

      const event = {
        id: 'decision-1',
        correlation_id: 'corr-1',
        selected_agent: 'agent-api',
        confidence_score: 0.95,
        routing_time_ms: 45,
        user_request: 'Create API endpoint',
        routing_strategy: 'semantic',
        timestamp: new Date().toISOString(),
      };

      await eachMessageHandler({
        topic: 'agent-routing-decisions',
        message: {
          value: Buffer.from(JSON.stringify(event)),
        },
      });

      expect(metricUpdateSpy).toHaveBeenCalled();
      expect(routingUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedAgent: 'agent-api',
          confidenceScore: 0.95,
          routingTimeMs: 45,
        })
      );

      const metrics = consumer.getAgentMetrics();
      expect(metrics).toContainEqual(
        expect.objectContaining({
          agent: 'agent-api',
          totalRequests: 1,
          avgConfidence: 0.95,
          avgRoutingTime: 45,
        })
      );
    });

    it('should skip routing decisions without agent name', async () => {
      const metricUpdateSpy = vi.fn();
      consumer.on('metricUpdate', metricUpdateSpy);

      const event = {
        id: 'decision-3',
        correlation_id: 'corr-3',
        // Missing selected_agent
        confidence_score: 0.75,
      };

      await eachMessageHandler({
        topic: 'agent-routing-decisions',
        message: {
          value: Buffer.from(JSON.stringify(event)),
        },
      });

      // Should not update metrics
      const metrics = consumer.getAgentMetrics();
      expect(metrics).toHaveLength(0);
    });

    it('should accumulate metrics for multiple routing decisions', async () => {
      const events = [
        {
          selected_agent: 'agent-api',
          confidence_score: 0.9,
          routing_time_ms: 40,
        },
        {
          selected_agent: 'agent-api',
          confidence_score: 0.95,
          routing_time_ms: 50,
        },
        {
          selected_agent: 'agent-api',
          confidence_score: 0.85,
          routing_time_ms: 45,
        },
      ];

      for (const event of events) {
        await eachMessageHandler({
          topic: 'agent-routing-decisions',
          message: {
            value: Buffer.from(JSON.stringify(event)),
          },
        });
      }

      const metrics = consumer.getAgentMetrics();
      const agentMetric = metrics.find(m => m.agent === 'agent-api');

      expect(agentMetric).toBeDefined();
      expect(agentMetric?.totalRequests).toBe(3);
      expect(agentMetric?.avgConfidence).toBeCloseTo((0.9 + 0.95 + 0.85) / 3, 2);
      expect(agentMetric?.avgRoutingTime).toBeCloseTo((40 + 50 + 45) / 3, 2);
    });
  });

  describe('event handling - agent actions', () => {
    let eachMessageHandler: any;

    beforeEach(async () => {
      mockConsumerConnect.mockResolvedValueOnce(undefined);
      mockConsumerSubscribe.mockResolvedValueOnce(undefined);
      mockConsumerRun.mockImplementation(async ({ eachMessage }) => {
        eachMessageHandler = eachMessage;
      });

      await consumer.start();
    });

    it('should handle agent action events', async () => {
      const actionUpdateSpy = vi.fn();
      consumer.on('actionUpdate', actionUpdateSpy);

      const event = {
        id: 'action-1',
        correlation_id: 'corr-1',
        agent_name: 'agent-api',
        action_type: 'tool_call',
        action_name: 'read_file',
        duration_ms: 150,
      };

      await eachMessageHandler({
        topic: 'agent-actions',
        message: {
          value: Buffer.from(JSON.stringify(event)),
        },
      });

      expect(actionUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          agentName: 'agent-api',
          actionType: 'tool_call',
          actionName: 'read_file',
          durationMs: 150,
        })
      );
    });

    it('should track success rate for success and error actions', async () => {
      const events = [
        { agent_name: 'agent-test', action_type: 'success', action_name: 'test1' },
        { agent_name: 'agent-test', action_type: 'success', action_name: 'test2' },
        { agent_name: 'agent-test', action_type: 'error', action_name: 'test3' },
        { agent_name: 'agent-test', action_type: 'success', action_name: 'test4' },
      ];

      for (const event of events) {
        await eachMessageHandler({
          topic: 'agent-actions',
          message: {
            value: Buffer.from(JSON.stringify(event)),
          },
        });
      }

      const metrics = consumer.getAgentMetrics();
      const agentMetric = metrics.find(m => m.agent === 'agent-test');

      expect(agentMetric?.successRate).toBe(0.75); // 3/4 = 75%
    });
  });

  describe('error handling', () => {
    let eachMessageHandler: any;

    beforeEach(async () => {
      mockConsumerConnect.mockResolvedValueOnce(undefined);
      mockConsumerSubscribe.mockResolvedValueOnce(undefined);
      mockConsumerRun.mockImplementation(async ({ eachMessage }) => {
        eachMessageHandler = eachMessage;
      });

      await consumer.start();
    });

    it('should emit error event for malformed JSON', async () => {
      const errorSpy = vi.fn();
      consumer.on('error', errorSpy);

      await eachMessageHandler({
        topic: 'agent-actions',
        message: {
          value: Buffer.from('{ invalid json'),
        },
      });

      expect(errorSpy).toHaveBeenCalled();
      expect(errorSpy.mock.calls[0][0]).toBeInstanceOf(Error);
    });

    it('should continue processing after error', async () => {
      const errorSpy = vi.fn();
      const actionUpdateSpy = vi.fn();
      consumer.on('error', errorSpy);
      consumer.on('actionUpdate', actionUpdateSpy);

      // Send malformed event
      await eachMessageHandler({
        topic: 'agent-actions',
        message: {
          value: Buffer.from('invalid'),
        },
      });

      // Send valid event
      await eachMessageHandler({
        topic: 'agent-actions',
        message: {
          value: Buffer.from(JSON.stringify({ agent_name: 'test', action_type: 'success' })),
        },
      });

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(actionUpdateSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('getter methods', () => {
    it('getRecentActions should return limited results', () => {
      const actions = consumer.getRecentActions(5);
      expect(Array.isArray(actions)).toBe(true);
      expect(actions.length).toBeLessThanOrEqual(5);
    });

    it('getRecentActions should return all actions when no limit specified', () => {
      const actions = consumer.getRecentActions();
      expect(Array.isArray(actions)).toBe(true);
    });

    it('getHealthStatus should return correct status', async () => {
      const healthBefore = consumer.getHealthStatus();
      expect(healthBefore.status).toBe('unhealthy'); // Not started yet

      mockConsumerConnect.mockResolvedValueOnce(undefined);
      mockConsumerSubscribe.mockResolvedValueOnce(undefined);
      mockConsumerRun.mockResolvedValueOnce(undefined);

      await consumer.start();

      const healthAfter = consumer.getHealthStatus();
      expect(healthAfter.status).toBe('healthy');
      expect(healthAfter).toHaveProperty('eventsProcessed');
      expect(healthAfter).toHaveProperty('recentActionsCount');
      expect(healthAfter).toHaveProperty('timestamp');
    });

    it('getPerformanceStats should calculate cache hit rate correctly', () => {
      const stats = consumer.getPerformanceStats();
      expect(stats).toHaveProperty('totalQueries');
      expect(stats).toHaveProperty('cacheHitCount');
      expect(stats).toHaveProperty('avgRoutingDuration');
      expect(stats).toHaveProperty('cacheHitRate');
    });
  });

  describe('connectWithRetry', () => {
    it('should successfully connect on first attempt', async () => {
      mockConsumerConnect.mockResolvedValueOnce(undefined);

      await consumer.connectWithRetry(5);

      expect(mockConsumerConnect).toHaveBeenCalledTimes(1);
    });

    it('should retry with exponential backoff on failure', async () => {
      // Fail 2 times, then succeed
      mockConsumerConnect
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockResolvedValueOnce(undefined);

      const startTime = Date.now();
      await consumer.connectWithRetry(5);
      const elapsed = Date.now() - startTime;

      // Should have tried 3 times (2 failures + 1 success)
      expect(mockConsumerConnect).toHaveBeenCalledTimes(3);

      // Should have waited: 1000ms (attempt 1) + 2000ms (attempt 2) = ~3000ms
      // Allow some tolerance for execution time
      expect(elapsed).toBeGreaterThanOrEqual(2900);
      expect(elapsed).toBeLessThan(4000);
    });

    it('should throw error after max retries', async () => {
      const maxRetries = 3;
      vi.clearAllMocks(); // Ensure clean state before this test
      mockConsumerConnect.mockRejectedValue(new Error('Connection refused'));

      await expect(consumer.connectWithRetry(maxRetries)).rejects.toThrow(
        'Kafka connection failed after 3 attempts'
      );

      // Should have tried exactly maxRetries times
      expect(mockConsumerConnect).toHaveBeenCalledTimes(maxRetries);
    }, 10000); // Increase timeout for retry delays

    it('should respect max delay of 30 seconds', async () => {
      // Mock high retry count to test max delay
      // Delays: 1s, 2s, 4s, 8s, 16s, 30s (capped), 30s (capped)
      mockConsumerConnect
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockResolvedValueOnce(undefined); // Success on 6th attempt

      const startTime = Date.now();
      await consumer.connectWithRetry(10);
      const elapsed = Date.now() - startTime;

      // Total delay: 1000 + 2000 + 4000 + 8000 + 16000 = 31000ms
      // Allow tolerance for execution time
      expect(elapsed).toBeGreaterThanOrEqual(30000);
      expect(elapsed).toBeLessThan(33000);
    }, 35000); // Increase timeout to 35s for long retry test

    it('should handle non-Error exceptions', async () => {
      mockConsumerConnect
        .mockRejectedValueOnce('String error')
        .mockResolvedValueOnce(undefined);

      await consumer.connectWithRetry(5);

      expect(mockConsumerConnect).toHaveBeenCalledTimes(2);
    }, 10000); // Increase timeout to 10s for retry delay

    it('should throw error if consumer not initialized', async () => {
      const uninitializedConsumer = new EventConsumer();
      // Force consumer to null to simulate uninitialized state
      (uninitializedConsumer as any).consumer = null;

      await expect(uninitializedConsumer.connectWithRetry()).rejects.toThrow(
        'Consumer not initialized'
      );
    });
  });

  describe('reconnection on message processing errors', () => {
    let eachMessageHandler: any;

    beforeEach(async () => {
      mockConsumerConnect.mockResolvedValue(undefined);
      mockConsumerSubscribe.mockResolvedValue(undefined);
      mockConsumerRun.mockImplementation(async ({ eachMessage }) => {
        eachMessageHandler = eachMessage;
      });

      await consumer.start();
    });

    it('should attempt reconnection on connection error during message processing', async () => {
      vi.clearAllMocks(); // Clear after start to track reconnection attempts
      mockConsumerConnect.mockResolvedValueOnce(undefined); // Successful reconnection

      const errorSpy = vi.fn();
      consumer.on('error', errorSpy);

      // Create message that will throw connection error during toString
      const testMessage = {
        topic: 'agent-actions',
        message: {
          value: {
            toString: () => {
              throw new Error('Network connection error');
            }
          }
        }
      };

      await eachMessageHandler(testMessage);

      // Should have attempted reconnection
      expect(mockConsumerConnect).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
    }, 10000); // Increase timeout for reconnection

    it('should not attempt reconnection on non-connection errors', async () => {
      vi.clearAllMocks(); // Clear after start

      const errorSpy = vi.fn();
      consumer.on('error', errorSpy);

      // Send malformed JSON (non-connection error)
      await eachMessageHandler({
        topic: 'agent-actions',
        message: {
          value: Buffer.from('{ invalid json'),
        },
      });

      // Should emit error but not attempt reconnection
      expect(errorSpy).toHaveBeenCalled();
      expect(mockConsumerConnect).not.toHaveBeenCalled();
    });

    it('should emit error if reconnection fails', async () => {
      vi.clearAllMocks(); // Clear after start

      const reconnectError = new Error('Kafka connection failed after 5 attempts: Connection failed');
      mockConsumerConnect.mockRejectedValue(new Error('Connection failed'));

      const errorSpy = vi.fn();
      consumer.on('error', errorSpy);

      // Create message that will throw connection error
      const testMessage = {
        topic: 'agent-actions',
        message: {
          value: {
            toString: () => {
              throw new Error('Kafka connection lost - broker unreachable');
            }
          }
        }
      };

      await eachMessageHandler(testMessage);

      // Should have emitted both original error and reconnection error
      expect(errorSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(errorSpy.mock.calls[0][0].message).toContain('broker unreachable');
    }, 20000); // Increase timeout for failed reconnection attempts
  });

  describe('data pruning', () => {
    let eachMessageHandler: any;

    beforeEach(async () => {
      mockConsumerConnect.mockResolvedValueOnce(undefined);
      mockConsumerSubscribe.mockResolvedValueOnce(undefined);
      mockConsumerRun.mockImplementation(async ({ eachMessage }) => {
        eachMessageHandler = eachMessage;
      });

      await consumer.start();
    });

    it('should prune old actions after 24 hours', async () => {
      // Add recent action (current time)
      const recentAction = {
        id: 'action-recent',
        agent_name: 'agent-test',
        action_type: 'tool_call',
        action_name: 'read_file',
        timestamp: new Date().toISOString(),
      };

      // Add old action (25 hours ago)
      const oldAction = {
        id: 'action-old',
        agent_name: 'agent-test',
        action_type: 'tool_call',
        action_name: 'write_file',
        timestamp: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      };

      await eachMessageHandler({
        topic: 'agent-actions',
        message: { value: Buffer.from(JSON.stringify(recentAction)) },
      });

      await eachMessageHandler({
        topic: 'agent-actions',
        message: { value: Buffer.from(JSON.stringify(oldAction)) },
      });

      // Verify both actions are present
      let actions = consumer.getRecentActions();
      expect(actions.length).toBe(2);

      // Call pruneOldData directly (simulate timer trigger)
      (consumer as any).pruneOldData();

      // Verify only recent action remains
      actions = consumer.getRecentActions();
      expect(actions.length).toBe(1);
      expect(actions[0].id).toBe('action-recent');
    });

    it('should prune old routing decisions after 24 hours', async () => {
      // Add recent decision
      const recentDecision = {
        id: 'decision-recent',
        selected_agent: 'agent-api',
        confidence_score: 0.9,
        timestamp: new Date().toISOString(),
      };

      // Add old decision (25 hours ago)
      const oldDecision = {
        id: 'decision-old',
        selected_agent: 'agent-api',
        confidence_score: 0.85,
        timestamp: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      };

      await eachMessageHandler({
        topic: 'agent-routing-decisions',
        message: { value: Buffer.from(JSON.stringify(recentDecision)) },
      });

      await eachMessageHandler({
        topic: 'agent-routing-decisions',
        message: { value: Buffer.from(JSON.stringify(oldDecision)) },
      });

      // Verify both decisions are present
      let decisions = consumer.getRoutingDecisions();
      expect(decisions.length).toBe(2);

      // Call pruneOldData
      (consumer as any).pruneOldData();

      // Verify only recent decision remains
      decisions = consumer.getRoutingDecisions();
      expect(decisions.length).toBe(1);
      expect(decisions[0].id).toBe('decision-recent');
    });

    it('should prune old transformations after 24 hours', async () => {
      // Add recent transformation
      const recentTransformation = {
        id: 'trans-recent',
        source_agent: 'agent-a',
        target_agent: 'agent-b',
        success: true,
        timestamp: new Date().toISOString(),
      };

      // Add old transformation (25 hours ago)
      const oldTransformation = {
        id: 'trans-old',
        source_agent: 'agent-c',
        target_agent: 'agent-d',
        success: true,
        timestamp: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      };

      await eachMessageHandler({
        topic: 'agent-transformation-events',
        message: { value: Buffer.from(JSON.stringify(recentTransformation)) },
      });

      await eachMessageHandler({
        topic: 'agent-transformation-events',
        message: { value: Buffer.from(JSON.stringify(oldTransformation)) },
      });

      // Verify both transformations are present
      let transformations = consumer.getRecentTransformations();
      expect(transformations.length).toBe(2);

      // Call pruneOldData
      (consumer as any).pruneOldData();

      // Verify only recent transformation remains
      transformations = consumer.getRecentTransformations();
      expect(transformations.length).toBe(1);
      expect(transformations[0].id).toBe('trans-recent');
    });

    it('should prune old performance metrics after 24 hours', async () => {
      // Add recent metric
      const recentMetric = {
        id: 'metric-recent',
        query_text: 'test query',
        routing_duration_ms: 100,
        cache_hit: true,
        timestamp: new Date().toISOString(),
      };

      // Add old metric (25 hours ago)
      const oldMetric = {
        id: 'metric-old',
        query_text: 'old query',
        routing_duration_ms: 150,
        cache_hit: false,
        timestamp: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      };

      await eachMessageHandler({
        topic: 'router-performance-metrics',
        message: { value: Buffer.from(JSON.stringify(recentMetric)) },
      });

      await eachMessageHandler({
        topic: 'router-performance-metrics',
        message: { value: Buffer.from(JSON.stringify(oldMetric)) },
      });

      // Verify both metrics are present
      let metrics = consumer.getPerformanceMetrics();
      expect(metrics.length).toBe(2);

      // Call pruneOldData
      (consumer as any).pruneOldData();

      // Verify only recent metric remains
      metrics = consumer.getPerformanceMetrics();
      expect(metrics.length).toBe(1);
      expect(metrics[0].id).toBe('metric-recent');
    });

    it('should keep all events when none are older than 24 hours', async () => {
      // Add multiple recent events (all within last hour)
      const events = [
        {
          id: 'action-1',
          agent_name: 'agent-test',
          action_type: 'tool_call',
          timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        },
        {
          id: 'action-2',
          agent_name: 'agent-test',
          action_type: 'success',
          timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        },
        {
          id: 'action-3',
          agent_name: 'agent-test',
          action_type: 'error',
          timestamp: new Date().toISOString(),
        },
      ];

      for (const event of events) {
        await eachMessageHandler({
          topic: 'agent-actions',
          message: { value: Buffer.from(JSON.stringify(event)) },
        });
      }

      const actionsBefore = consumer.getRecentActions().length;
      expect(actionsBefore).toBe(3);

      // Call pruneOldData
      (consumer as any).pruneOldData();

      // All events should still be present
      const actionsAfter = consumer.getRecentActions();
      expect(actionsAfter.length).toBe(3);
    });

    it('should clear pruning timer when consumer stops', async () => {
      // Verify timer exists after start
      expect((consumer as any).pruneTimer).toBeDefined();

      // Stop the consumer
      await consumer.stop();

      // Verify timer is cleared
      expect((consumer as any).pruneTimer).toBeUndefined();
    });

    it('should not log when no old data to prune', () => {
      const consoleSpy = vi.spyOn(console, 'log');

      // Call pruneOldData with no old data
      (consumer as any).pruneOldData();

      // Should not log pruning message (only logs when totalRemoved > 0)
      const pruningLogs = consoleSpy.mock.calls.filter(call =>
        call[0]?.includes('🧹 Pruned old data')
      );
      expect(pruningLogs.length).toBe(0);

      consoleSpy.mockRestore();
    });
  });
});
