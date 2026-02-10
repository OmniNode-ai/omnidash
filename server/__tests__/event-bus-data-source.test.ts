import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// Set environment variables before module loading
vi.hoisted(() => {
  process.env.KAFKA_BROKERS = 'localhost:9092';
  process.env.KAFKA_BOOTSTRAP_SERVERS = 'localhost:9092';
});

// Create mock functions for Kafka operations
const {
  mockConsumerConnect,
  mockConsumerDisconnect,
  mockConsumerSubscribe,
  mockConsumerRun,
  mockAdminConnect,
  mockAdminDisconnect,
  mockAdminListTopics,
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
      on: vi.fn(),
      events: {
        CRASH: 'consumer.crash',
        GROUP_JOIN: 'consumer.group_join',
        REBALANCING: 'consumer.rebalancing',
        FETCH_START: 'consumer.fetch_start',
      },
    }),
    admin: vi.fn().mockReturnValue({
      connect: mockAdminConnect,
      disconnect: mockAdminDisconnect,
      listTopics: mockAdminListTopics,
    }),
  })),
}));

// Mock storage module
const mockDb = {
  execute: vi.fn().mockResolvedValue({ rows: [] }),
};

vi.mock('../storage', () => ({
  getIntelligenceDb: vi.fn(() => mockDb),
}));

// Import after mocks are set up
import { EventBusDataSource, type EventBusEvent } from '../event-bus-data-source';

/** Helper to create a minimal EventBusEvent */
function makeEvent(overrides: Partial<EventBusEvent> = {}): EventBusEvent {
  return {
    event_type: 'test.event.v1',
    event_id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    tenant_id: 'test-tenant',
    namespace: 'test-ns',
    source: 'test-source',
    correlation_id: 'corr-123',
    causation_id: undefined,
    schema_ref: 'test-schema-ref',
    payload: { key: 'value' },
    topic: 'dev.onex.evt.test.event.v1',
    partition: 0,
    offset: '42',
    processed_at: new Date(),
    ...overrides,
  };
}

describe('EventBusDataSource', () => {
  let dataSource: EventBusDataSource;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.KAFKA_BROKERS = 'localhost:9092';
    process.env.KAFKA_BOOTSTRAP_SERVERS = 'localhost:9092';
    dataSource = new EventBusDataSource();
  });

  afterEach(async () => {
    try {
      await dataSource.stop();
    } catch {
      // Ignore cleanup errors
    }
  });

  // =========================================================================
  // Constructor
  // =========================================================================
  describe('constructor', () => {
    it('should initialize as EventEmitter', () => {
      expect(dataSource).toBeInstanceOf(EventEmitter);
    });

    it('should throw when KAFKA_BROKERS is missing', () => {
      delete process.env.KAFKA_BROKERS;
      delete process.env.KAFKA_BOOTSTRAP_SERVERS;

      expect(() => new EventBusDataSource()).toThrow(
        'KAFKA_BROKERS or KAFKA_BOOTSTRAP_SERVERS environment variable is required'
      );
    });

    it('should accept KAFKA_BOOTSTRAP_SERVERS as alternative', () => {
      delete process.env.KAFKA_BROKERS;
      process.env.KAFKA_BOOTSTRAP_SERVERS = '192.168.86.200:9092';

      const ds = new EventBusDataSource();
      expect(ds).toBeInstanceOf(EventEmitter);
    });
  });

  // =========================================================================
  // validateConnection
  // =========================================================================
  describe('validateConnection', () => {
    it('should return true when broker is reachable', async () => {
      mockAdminConnect.mockResolvedValueOnce(undefined);
      mockAdminListTopics.mockResolvedValueOnce(['topic-a', 'topic-b']);
      mockAdminDisconnect.mockResolvedValueOnce(undefined);

      const result = await dataSource.validateConnection();

      expect(result).toBe(true);
      expect(mockAdminConnect).toHaveBeenCalled();
      expect(mockAdminListTopics).toHaveBeenCalled();
      expect(mockAdminDisconnect).toHaveBeenCalled();
    });

    it('should return false when broker is unreachable', async () => {
      mockAdminConnect.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await dataSource.validateConnection();

      expect(result).toBe(false);
    });

    it('should return false when KAFKA_BROKERS is cleared after construction', async () => {
      // Construct with valid env, then clear to simulate env disappearing
      const ds = new EventBusDataSource();
      delete process.env.KAFKA_BROKERS;
      delete process.env.KAFKA_BOOTSTRAP_SERVERS;

      const result = await ds.validateConnection();
      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // start
  // =========================================================================
  describe('start', () => {
    it('should connect, subscribe to matching topics, and run consumer', async () => {
      mockConsumerConnect.mockResolvedValueOnce(undefined);
      mockAdminConnect.mockResolvedValueOnce(undefined);
      mockAdminListTopics.mockResolvedValueOnce([
        'dev.onex.evt.test.something.v1',
        'agent-routing-decisions',
        'router-performance-metrics',
        '__consumer_offsets',
        'random-unmatched-topic',
      ]);
      mockAdminDisconnect.mockResolvedValueOnce(undefined);
      mockConsumerSubscribe.mockResolvedValueOnce(undefined);
      mockConsumerRun.mockResolvedValueOnce(undefined);

      await dataSource.start();

      expect(mockConsumerConnect).toHaveBeenCalled();
      expect(mockConsumerSubscribe).toHaveBeenCalled();

      // Should filter out __consumer_offsets and unmatched topics
      const subscribeCall = mockConsumerSubscribe.mock.calls[0][0];
      expect(subscribeCall.fromBeginning).toBe(false);
      expect(subscribeCall.topics).toContain('dev.onex.evt.test.something.v1');
      expect(subscribeCall.topics).toContain('agent-routing-decisions');
      expect(subscribeCall.topics).toContain('router-performance-metrics');
      expect(subscribeCall.topics).not.toContain('__consumer_offsets');
      expect(subscribeCall.topics).not.toContain('random-unmatched-topic');

      expect(mockConsumerRun).toHaveBeenCalled();
    });

    it('should emit "connected" on successful start', async () => {
      mockConsumerConnect.mockResolvedValueOnce(undefined);
      mockAdminConnect.mockResolvedValueOnce(undefined);
      mockAdminListTopics.mockResolvedValueOnce(['agent-actions']);
      mockAdminDisconnect.mockResolvedValueOnce(undefined);
      mockConsumerSubscribe.mockResolvedValueOnce(undefined);
      mockConsumerRun.mockResolvedValueOnce(undefined);

      const connectedSpy = vi.fn();
      dataSource.on('connected', connectedSpy);

      await dataSource.start();

      expect(connectedSpy).toHaveBeenCalled();
    });

    it('should not start twice', async () => {
      mockConsumerConnect.mockResolvedValue(undefined);
      mockAdminConnect.mockResolvedValue(undefined);
      mockAdminListTopics.mockResolvedValue(['agent-actions']);
      mockAdminDisconnect.mockResolvedValue(undefined);
      mockConsumerSubscribe.mockResolvedValue(undefined);
      mockConsumerRun.mockResolvedValue(undefined);

      await dataSource.start();
      await dataSource.start(); // second call

      expect(mockConsumerConnect).toHaveBeenCalledTimes(1);
    });

    it('should fall back to all non-internal topics when no patterns match', async () => {
      mockConsumerConnect.mockResolvedValueOnce(undefined);
      mockAdminConnect.mockResolvedValueOnce(undefined);
      mockAdminListTopics.mockResolvedValueOnce([
        'random-topic-a',
        'random-topic-b',
        '__consumer_offsets',
      ]);
      mockAdminDisconnect.mockResolvedValueOnce(undefined);
      mockConsumerSubscribe.mockResolvedValueOnce(undefined);
      mockConsumerRun.mockResolvedValueOnce(undefined);

      await dataSource.start();

      const subscribeCall = mockConsumerSubscribe.mock.calls[0][0];
      expect(subscribeCall.topics).toContain('random-topic-a');
      expect(subscribeCall.topics).toContain('random-topic-b');
      expect(subscribeCall.topics).not.toContain('__consumer_offsets');
    });

    it('should emit error and throw on connection failure', async () => {
      mockConsumerConnect.mockRejectedValueOnce(new Error('Connection refused'));

      const errorSpy = vi.fn();
      dataSource.on('error', errorSpy);

      await expect(dataSource.start()).rejects.toThrow();
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // handleMessage - the core pipeline
  // =========================================================================
  describe('handleMessage', () => {
    let eachMessageHandler: (payload: any) => Promise<void>;

    beforeEach(async () => {
      mockConsumerConnect.mockResolvedValueOnce(undefined);
      mockAdminConnect.mockResolvedValueOnce(undefined);
      mockAdminListTopics.mockResolvedValueOnce(['dev.onex.evt.test.event.v1']);
      mockAdminDisconnect.mockResolvedValueOnce(undefined);
      mockConsumerSubscribe.mockResolvedValueOnce(undefined);
      mockConsumerRun.mockImplementation(async ({ eachMessage }) => {
        eachMessageHandler = eachMessage;
      });

      await dataSource.start();
    });

    it('should normalize and emit a valid event', async () => {
      const eventSpy = vi.fn();
      dataSource.on('event', eventSpy);

      const kafkaMessage = {
        event_type: 'code.analysis.completed',
        event_id: 'evt-001',
        timestamp: '2024-06-15T12:00:00Z',
        tenant_id: 'tenant-1',
        namespace: 'intelligence',
        source: 'archon',
        correlation_id: 'corr-abc',
        schema_ref: 'v1',
        payload: { result: 'success' },
      };

      await eachMessageHandler({
        topic: 'dev.onex.evt.test.event.v1',
        partition: 0,
        message: {
          offset: '100',
          value: Buffer.from(JSON.stringify(kafkaMessage)),
          headers: {},
        },
      });

      expect(eventSpy).toHaveBeenCalledTimes(1);
      const emittedEvent: EventBusEvent = eventSpy.mock.calls[0][0];
      expect(emittedEvent.event_type).toBe('code.analysis.completed');
      expect(emittedEvent.event_id).toBe('evt-001');
      expect(emittedEvent.tenant_id).toBe('tenant-1');
      expect(emittedEvent.topic).toBe('dev.onex.evt.test.event.v1');
      expect(emittedEvent.partition).toBe(0);
      expect(emittedEvent.offset).toBe('100');
      expect(emittedEvent.payload).toEqual({ result: 'success' });
      expect(emittedEvent.processed_at).toBeInstanceOf(Date);
    });

    it('should emit event:stored after successful storage', async () => {
      const storedSpy = vi.fn();
      dataSource.on('event:stored', storedSpy);
      mockDb.execute.mockResolvedValueOnce({ rows: [] });

      await eachMessageHandler({
        topic: 'dev.onex.evt.test.event.v1',
        partition: 0,
        message: {
          offset: '101',
          value: Buffer.from(JSON.stringify({ event_id: 'evt-store-1', payload: {} })),
          headers: {},
        },
      });

      expect(storedSpy).toHaveBeenCalledTimes(1);
    });

    it('should NOT emit event:stored when DB storage fails', async () => {
      const storedSpy = vi.fn();
      dataSource.on('event:stored', storedSpy);

      // After beforeEach completes (initializeSchema consumed its calls),
      // make the next execute call (storeEvent) reject
      mockDb.execute.mockRejectedValueOnce(new Error('DB write failed'));

      await eachMessageHandler({
        topic: 'dev.onex.evt.test.event.v1',
        partition: 0,
        message: {
          offset: '102',
          value: Buffer.from(JSON.stringify({ event_id: 'evt-fail-1', payload: {} })),
          headers: {},
        },
      });

      // storeEvent returns false on error, so event:stored should NOT fire
      expect(storedSpy).not.toHaveBeenCalled();
    });

    it('should emit "event" BEFORE attempting storage', async () => {
      const order: string[] = [];

      dataSource.on('event', () => order.push('event'));
      dataSource.on('event:stored', () => order.push('event:stored'));

      // Default mock resolves immediately, which is fine for ordering test
      mockDb.execute.mockResolvedValue({ rows: [] });

      await eachMessageHandler({
        topic: 'dev.onex.evt.test.event.v1',
        partition: 0,
        message: {
          offset: '103',
          value: Buffer.from(JSON.stringify({ event_id: 'evt-order-1', payload: {} })),
          headers: {},
        },
      });

      expect(order).toEqual(['event', 'event:stored']);
    });

    it('should extract event_type from message headers when not in body', async () => {
      const eventSpy = vi.fn();
      dataSource.on('event', eventSpy);

      await eachMessageHandler({
        topic: 'dev.onex.evt.test.event.v1',
        partition: 0,
        message: {
          offset: '104',
          value: Buffer.from(JSON.stringify({ payload: { data: 1 } })),
          headers: {
            'x-event-type': Buffer.from('header.event.type'),
          },
        },
      });

      const emitted: EventBusEvent = eventSpy.mock.calls[0][0];
      expect(emitted.event_type).toBe('header.event.type');
    });

    it('should fall back to topic name for event_type when no other source', async () => {
      const eventSpy = vi.fn();
      dataSource.on('event', eventSpy);

      await eachMessageHandler({
        topic: 'dev.onex.evt.test.event.v1',
        partition: 0,
        message: {
          offset: '105',
          value: Buffer.from(JSON.stringify({ payload: { data: 1 } })),
          headers: {},
        },
      });

      const emitted: EventBusEvent = eventSpy.mock.calls[0][0];
      expect(emitted.event_type).toBe('dev.onex.evt.test.event.v1');
    });

    it('should generate synthetic event_id from topic-partition-offset', async () => {
      const eventSpy = vi.fn();
      dataSource.on('event', eventSpy);

      await eachMessageHandler({
        topic: 'my-topic',
        partition: 3,
        message: {
          offset: '999',
          value: Buffer.from(JSON.stringify({ payload: {} })),
          headers: {},
        },
      });

      const emitted: EventBusEvent = eventSpy.mock.calls[0][0];
      expect(emitted.event_id).toBe('my-topic-3-999');
    });

    it('should skip internal Kafka topics silently', async () => {
      const eventSpy = vi.fn();
      dataSource.on('event', eventSpy);

      await eachMessageHandler({
        topic: '__consumer_offsets',
        partition: 0,
        message: {
          offset: '0',
          value: Buffer.from('binary-data'),
          headers: {},
        },
      });

      expect(eventSpy).not.toHaveBeenCalled();
    });

    it('should treat empty body as empty object (fallback to "{}")', async () => {
      // NOTE: Empty buffer toString() is '' which is falsy, so || '{}' kicks in.
      // This means empty messages produce a valid event with default fields.
      const eventSpy = vi.fn();
      dataSource.on('event', eventSpy);

      await eachMessageHandler({
        topic: 'dev.onex.evt.test.event.v1',
        partition: 0,
        message: {
          offset: '106',
          value: Buffer.from(''),
          headers: {},
        },
      });

      // Empty body falls back to '{}', which is valid JSON
      expect(eventSpy).toHaveBeenCalledTimes(1);
      const emitted: EventBusEvent = eventSpy.mock.calls[0][0];
      expect(emitted.payload).toEqual({});
    });

    it('should skip messages with whitespace-only body', async () => {
      const eventSpy = vi.fn();
      dataSource.on('event', eventSpy);

      await eachMessageHandler({
        topic: 'dev.onex.evt.test.event.v1',
        partition: 0,
        message: {
          offset: '107',
          value: Buffer.from('   \n  '),
          headers: {},
        },
      });

      // Whitespace-only passes the trim() === '' check and is skipped
      expect(eventSpy).not.toHaveBeenCalled();
    });

    it('should handle malformed JSON gracefully and not crash', async () => {
      const eventSpy = vi.fn();
      const errorSpy = vi.fn();
      dataSource.on('event', eventSpy);
      dataSource.on('error', errorSpy);

      await eachMessageHandler({
        topic: 'dev.onex.evt.test.event.v1',
        partition: 0,
        message: {
          offset: '108',
          value: Buffer.from('{ invalid json !!!'),
          headers: {},
        },
      });

      // Should not emit event for malformed JSON
      expect(eventSpy).not.toHaveBeenCalled();
      // Should not emit error either - it silently skips
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('should handle null message.value', async () => {
      const eventSpy = vi.fn();
      dataSource.on('event', eventSpy);

      await eachMessageHandler({
        topic: 'dev.onex.evt.test.event.v1',
        partition: 0,
        message: {
          offset: '109',
          value: null,
          headers: {},
        },
      });

      // null value becomes '{}' which is valid JSON
      // This creates an event with default values
      expect(eventSpy).toHaveBeenCalledTimes(1);
    });

    it('should continue processing after error in message handling', async () => {
      const eventSpy = vi.fn();
      dataSource.on('event', eventSpy);

      // First: malformed message
      await eachMessageHandler({
        topic: 'dev.onex.evt.test.event.v1',
        partition: 0,
        message: {
          offset: '110',
          value: Buffer.from('not json'),
          headers: {},
        },
      });

      // Second: valid message
      await eachMessageHandler({
        topic: 'dev.onex.evt.test.event.v1',
        partition: 0,
        message: {
          offset: '111',
          value: Buffer.from(JSON.stringify({ event_id: 'evt-recovery', payload: {} })),
          headers: {},
        },
      });

      expect(eventSpy).toHaveBeenCalledTimes(1);
      expect(eventSpy.mock.calls[0][0].event_id).toBe('evt-recovery');
    });

    it('should use whole event as payload when payload field is missing', async () => {
      const eventSpy = vi.fn();
      dataSource.on('event', eventSpy);

      const rawEvent = {
        event_id: 'evt-no-payload',
        some_field: 'some_value',
        timestamp: '2024-01-01T00:00:00Z',
      };

      await eachMessageHandler({
        topic: 'dev.onex.evt.test.event.v1',
        partition: 0,
        message: {
          offset: '112',
          value: Buffer.from(JSON.stringify(rawEvent)),
          headers: {},
        },
      });

      const emitted: EventBusEvent = eventSpy.mock.calls[0][0];
      // Should use the whole event as payload since there's no .payload field
      expect(emitted.payload).toEqual(rawEvent);
    });

    it('should extract tenant_id from headers when not in body', async () => {
      const eventSpy = vi.fn();
      dataSource.on('event', eventSpy);

      await eachMessageHandler({
        topic: 'dev.onex.evt.test.event.v1',
        partition: 0,
        message: {
          offset: '113',
          value: Buffer.from(JSON.stringify({ event_id: 'evt-hdr', payload: {} })),
          headers: {
            'x-tenant': Buffer.from('header-tenant'),
          },
        },
      });

      const emitted: EventBusEvent = eventSpy.mock.calls[0][0];
      expect(emitted.tenant_id).toBe('header-tenant');
    });

    it('should default tenant_id to "default" when not available', async () => {
      const eventSpy = vi.fn();
      dataSource.on('event', eventSpy);

      await eachMessageHandler({
        topic: 'dev.onex.evt.test.event.v1',
        partition: 0,
        message: {
          offset: '114',
          value: Buffer.from(JSON.stringify({ event_id: 'evt-no-tenant', payload: {} })),
          headers: {},
        },
      });

      const emitted: EventBusEvent = eventSpy.mock.calls[0][0];
      expect(emitted.tenant_id).toBe('default');
    });
  });

  // =========================================================================
  // storeEvent
  // =========================================================================
  describe('storeEvent', () => {
    it('should insert event into database', async () => {
      mockDb.execute.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent();
      await dataSource.storeEvent(event);

      expect(mockDb.execute).toHaveBeenCalledTimes(1);
    });

    it('should not throw on DB error and return false', async () => {
      mockDb.execute.mockRejectedValueOnce(new Error('DB connection lost'));

      const event = makeEvent();

      // Should not throw, but return false
      const result = await dataSource.storeEvent(event);
      expect(result).toBe(false);
    });

    it('should return true on successful storage', async () => {
      mockDb.execute.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent();
      const result = await dataSource.storeEvent(event);
      expect(result).toBe(true);
    });

    it('should handle duplicate event_id gracefully (ON CONFLICT DO NOTHING)', async () => {
      mockDb.execute.mockResolvedValueOnce({ rows: [] }); // first insert
      mockDb.execute.mockResolvedValueOnce({ rows: [] }); // second insert (conflict)

      const event = makeEvent({ event_id: 'duplicate-evt' });
      await dataSource.storeEvent(event);
      await dataSource.storeEvent(event);

      expect(mockDb.execute).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // injectEvent (mock generator support)
  // =========================================================================
  describe('injectEvent', () => {
    it('should emit event and event:stored without Kafka', async () => {
      const eventSpy = vi.fn();
      const storedSpy = vi.fn();
      dataSource.on('event', eventSpy);
      dataSource.on('event:stored', storedSpy);
      mockDb.execute.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent();
      await dataSource.injectEvent(event);

      expect(eventSpy).toHaveBeenCalledTimes(1);
      expect(eventSpy.mock.calls[0][0]).toBe(event);
      expect(storedSpy).toHaveBeenCalledTimes(1);
    });

    it('should store injected event in database', async () => {
      mockDb.execute.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent();
      await dataSource.injectEvent(event);

      expect(mockDb.execute).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // stop
  // =========================================================================
  describe('stop', () => {
    it('should disconnect and emit "disconnected"', async () => {
      // Start first
      mockConsumerConnect.mockResolvedValueOnce(undefined);
      mockAdminConnect.mockResolvedValueOnce(undefined);
      mockAdminListTopics.mockResolvedValueOnce(['agent-actions']);
      mockAdminDisconnect.mockResolvedValueOnce(undefined);
      mockConsumerSubscribe.mockResolvedValueOnce(undefined);
      mockConsumerRun.mockResolvedValueOnce(undefined);
      mockConsumerDisconnect.mockResolvedValueOnce(undefined);

      await dataSource.start();

      const disconnectedSpy = vi.fn();
      dataSource.on('disconnected', disconnectedSpy);

      await dataSource.stop();

      expect(mockConsumerDisconnect).toHaveBeenCalled();
      expect(disconnectedSpy).toHaveBeenCalled();
      expect(dataSource.isActive()).toBe(false);
    });

    it('should be a no-op when not running', async () => {
      await dataSource.stop();
      expect(mockConsumerDisconnect).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // isActive
  // =========================================================================
  describe('isActive', () => {
    it('should return false before start', () => {
      expect(dataSource.isActive()).toBe(false);
    });

    it('should return true after start', async () => {
      mockConsumerConnect.mockResolvedValueOnce(undefined);
      mockAdminConnect.mockResolvedValueOnce(undefined);
      mockAdminListTopics.mockResolvedValueOnce(['agent-actions']);
      mockAdminDisconnect.mockResolvedValueOnce(undefined);
      mockConsumerSubscribe.mockResolvedValueOnce(undefined);
      mockConsumerRun.mockResolvedValueOnce(undefined);

      await dataSource.start();

      expect(dataSource.isActive()).toBe(true);
    });
  });

  // =========================================================================
  // Full pipeline: message → handleMessage → emit('event') → listener receives
  // =========================================================================
  describe('full pipeline integration', () => {
    let eachMessageHandler: (payload: any) => Promise<void>;

    beforeEach(async () => {
      mockConsumerConnect.mockResolvedValueOnce(undefined);
      mockAdminConnect.mockResolvedValueOnce(undefined);
      mockAdminListTopics.mockResolvedValueOnce(['dev.onex.evt.test.event.v1', 'agent-actions']);
      mockAdminDisconnect.mockResolvedValueOnce(undefined);
      mockConsumerSubscribe.mockResolvedValueOnce(undefined);
      mockConsumerRun.mockImplementation(async ({ eachMessage }) => {
        eachMessageHandler = eachMessage;
      });

      await dataSource.start();
    });

    it('should process multiple sequential messages correctly', async () => {
      const events: EventBusEvent[] = [];
      dataSource.on('event', (evt) => events.push(evt));

      for (let i = 0; i < 5; i++) {
        await eachMessageHandler({
          topic: 'agent-actions',
          partition: 0,
          message: {
            offset: String(i),
            value: Buffer.from(
              JSON.stringify({
                event_id: `batch-${i}`,
                event_type: 'agent.action',
                payload: { index: i },
              })
            ),
            headers: {},
          },
        });
      }

      expect(events).toHaveLength(5);
      expect(events.map((e) => e.event_id)).toEqual([
        'batch-0',
        'batch-1',
        'batch-2',
        'batch-3',
        'batch-4',
      ]);
    });

    it('should pass through all envelope fields from a well-formed event', async () => {
      const eventSpy = vi.fn();
      dataSource.on('event', eventSpy);

      const wellFormed = {
        event_type: 'code.analysis.completed',
        event_id: 'wf-001',
        timestamp: '2024-06-15T12:00:00Z',
        tenant_id: 'acme-corp',
        namespace: 'intelligence',
        source: 'archon-intelligence',
        correlation_id: 'corr-wf',
        causation_id: 'cause-wf',
        schema_ref: 'schemas/code-analysis/v2',
        payload: {
          analysis_id: 'a-123',
          patterns_found: 15,
          confidence: 0.92,
        },
      };

      await eachMessageHandler({
        topic: 'dev.onex.evt.test.event.v1',
        partition: 2,
        message: {
          offset: '500',
          value: Buffer.from(JSON.stringify(wellFormed)),
          headers: {},
        },
      });

      const emitted: EventBusEvent = eventSpy.mock.calls[0][0];
      expect(emitted.event_type).toBe('code.analysis.completed');
      expect(emitted.event_id).toBe('wf-001');
      expect(emitted.timestamp).toBe('2024-06-15T12:00:00Z');
      expect(emitted.tenant_id).toBe('acme-corp');
      expect(emitted.namespace).toBe('intelligence');
      expect(emitted.source).toBe('archon-intelligence');
      expect(emitted.correlation_id).toBe('corr-wf');
      expect(emitted.causation_id).toBe('cause-wf');
      expect(emitted.schema_ref).toBe('schemas/code-analysis/v2');
      expect(emitted.payload.patterns_found).toBe(15);
      expect(emitted.topic).toBe('dev.onex.evt.test.event.v1');
      expect(emitted.partition).toBe(2);
      expect(emitted.offset).toBe('500');
    });

    it('should handle mixed valid and invalid messages in sequence', async () => {
      const events: EventBusEvent[] = [];
      dataSource.on('event', (evt) => events.push(evt));

      // Valid
      await eachMessageHandler({
        topic: 'agent-actions',
        partition: 0,
        message: {
          offset: '0',
          value: Buffer.from(JSON.stringify({ event_id: 'ok-1', payload: {} })),
          headers: {},
        },
      });

      // Invalid JSON
      await eachMessageHandler({
        topic: 'agent-actions',
        partition: 0,
        message: {
          offset: '1',
          value: Buffer.from('not-json'),
          headers: {},
        },
      });

      // Whitespace-only (skipped)
      await eachMessageHandler({
        topic: 'agent-actions',
        partition: 0,
        message: {
          offset: '2',
          value: Buffer.from('   '),
          headers: {},
        },
      });

      // Internal topic (skipped)
      await eachMessageHandler({
        topic: '__consumer_offsets',
        partition: 0,
        message: {
          offset: '3',
          value: Buffer.from('binary'),
          headers: {},
        },
      });

      // Valid
      await eachMessageHandler({
        topic: 'agent-actions',
        partition: 0,
        message: {
          offset: '4',
          value: Buffer.from(JSON.stringify({ event_id: 'ok-2', payload: {} })),
          headers: {},
        },
      });

      expect(events).toHaveLength(2);
      expect(events[0].event_id).toBe('ok-1');
      expect(events[1].event_id).toBe('ok-2');
    });
  });

  // =========================================================================
  // EVENT_PATTERNS matching
  // =========================================================================
  describe('EVENT_PATTERNS topic matching', () => {
    // Access the private patterns for testing
    const patterns = (EventBusDataSource.prototype as any).EVENT_PATTERNS || [];

    // Create a fresh instance just to access patterns
    const testInstance = new EventBusDataSource();
    const eventPatterns: RegExp[] = (testInstance as any).EVENT_PATTERNS;

    function matchesSome(topic: string): boolean {
      return eventPatterns.some((p: RegExp) => p.test(topic));
    }

    it('should match ONEX canonical topics', () => {
      expect(matchesSome('dev.onex.evt.platform.node-heartbeat.v1')).toBe(true);
      expect(matchesSome('onex.cmd.platform.request-introspection.v1')).toBe(true);
      expect(matchesSome('prod.onex.snapshot.platform.registration-snapshots.v1')).toBe(true);
    });

    it('should match omninode domain topics', () => {
      expect(matchesSome('dev.omninode.intelligence.code-analysis.v1')).toBe(true);
      expect(matchesSome('prod.omninode.agent.routing-decision.v1')).toBe(true);
      expect(matchesSome('dev.omninode.kafka.topic-created.v1')).toBe(true);
    });

    it('should match omniclaude/omniintelligence/omnimemory topics', () => {
      expect(matchesSome('dev.omniclaude.session-started.v1')).toBe(true);
      expect(matchesSome('dev.omniintelligence.tool-content.v1')).toBe(true);
      expect(matchesSome('dev.omnimemory.context-stored.v1')).toBe(true);
    });

    it('should match archon-intelligence topics', () => {
      expect(matchesSome('dev.archon-intelligence.intelligence.code-analysis-requested.v1')).toBe(
        true
      );
    });

    it('should match omninode-bridge topics', () => {
      expect(matchesSome('dev.omninode-bridge.event.stored.v1')).toBe(true);
    });

    it('should match legacy flat agent topics', () => {
      expect(matchesSome('agent-routing-decisions')).toBe(true);
      expect(matchesSome('agent-actions')).toBe(true);
      expect(matchesSome('agent-transformation-events')).toBe(true);
      expect(matchesSome('agent-manifest-injections')).toBe(true);
      expect(matchesSome('router-performance-metrics')).toBe(true);
    });

    it('should NOT match Kafka internal topics', () => {
      expect(matchesSome('__consumer_offsets')).toBe(false);
      expect(matchesSome('__transaction_state')).toBe(false);
    });

    it('should NOT match random unrelated topics', () => {
      expect(matchesSome('random-topic')).toBe(false);
      expect(matchesSome('test-data')).toBe(false);
      expect(matchesSome('my.custom.topic')).toBe(false);
    });
  });
});

// =========================================================================
// Singleton / lazy initialization
// =========================================================================
describe('getEventBusDataSource lazy initialization', () => {
  // These tests verify the module-level singleton pattern.
  // Since the module is already loaded with mocks, we test the exported functions.

  it('should be importable', async () => {
    const mod = await import('../event-bus-data-source');
    expect(mod.getEventBusDataSource).toBeDefined();
    expect(mod.isEventBusDataSourceAvailable).toBeDefined();
    expect(mod.getEventBusDataSourceError).toBeDefined();
  });
});
