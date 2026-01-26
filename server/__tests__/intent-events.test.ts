import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  toSnakeCase,
  IntentEventEmitter,
  getIntentEventEmitter,
  intentEventEmitter,
  emitIntentUpdate,
  emitIntentDistributionUpdate,
  IntentEventType,
  type IntentRecord,
  type IntentRecordPayload,
  type IntentCategoryDistribution,
  type IntentQueryResponseEvent,
} from '../intent-events';

// ============================================================================
// Test Data Helpers
// ============================================================================

/**
 * Create a mock IntentRecord (camelCase) for testing
 */
function createMockIntentRecord(overrides: Partial<IntentRecord> = {}): IntentRecord {
  return {
    intentId: 'intent-123',
    sessionRef: 'session-456',
    intentCategory: 'code_generation',
    confidence: 0.95,
    keywords: ['test', 'mock', 'example'],
    createdAt: '2026-01-25T10:30:00.000Z',
    ...overrides,
  };
}

/**
 * Create a mock IntentRecordPayload (snake_case) for testing
 */
function createMockIntentPayload(
  overrides: Partial<IntentRecordPayload> = {}
): IntentRecordPayload {
  return {
    intent_id: 'intent-123',
    session_ref: 'session-456',
    intent_category: 'code_generation',
    confidence: 0.95,
    keywords: ['test', 'mock', 'example'],
    created_at: '2026-01-25T10:30:00.000Z',
    ...overrides,
  };
}

// ============================================================================
// toSnakeCase Function Tests
// ============================================================================

describe('toSnakeCase', () => {
  it('should convert IntentRecord to IntentRecordPayload with correct field mapping', () => {
    const input: IntentRecord = {
      intentId: 'intent-abc123',
      sessionRef: 'session-xyz789',
      intentCategory: 'debugging',
      confidence: 0.92,
      keywords: ['error', 'fix', 'traceback'],
      createdAt: '2026-01-25T12:00:00.000Z',
    };

    const result = toSnakeCase(input);

    expect(result).toEqual({
      intent_id: 'intent-abc123',
      session_ref: 'session-xyz789',
      intent_category: 'debugging',
      confidence: 0.92,
      keywords: ['error', 'fix', 'traceback'],
      created_at: '2026-01-25T12:00:00.000Z',
    });
  });

  it('should preserve all field values during conversion', () => {
    const input = createMockIntentRecord();
    const result = toSnakeCase(input);

    // Verify values are preserved
    expect(result.intent_id).toBe(input.intentId);
    expect(result.session_ref).toBe(input.sessionRef);
    expect(result.intent_category).toBe(input.intentCategory);
    expect(result.confidence).toBe(input.confidence);
    expect(result.keywords).toEqual(input.keywords);
    expect(result.created_at).toBe(input.createdAt);
  });

  it('should handle empty keywords array', () => {
    const input = createMockIntentRecord({ keywords: [] });
    const result = toSnakeCase(input);

    expect(result.keywords).toEqual([]);
  });

  it('should handle single keyword', () => {
    const input = createMockIntentRecord({ keywords: ['solo'] });
    const result = toSnakeCase(input);

    expect(result.keywords).toEqual(['solo']);
  });

  it('should handle many keywords', () => {
    const manyKeywords = Array.from({ length: 50 }, (_, i) => `keyword-${i}`);
    const input = createMockIntentRecord({ keywords: manyKeywords });
    const result = toSnakeCase(input);

    expect(result.keywords).toHaveLength(50);
    expect(result.keywords).toEqual(manyKeywords);
  });

  it('should handle minimum confidence (0)', () => {
    const input = createMockIntentRecord({ confidence: 0 });
    const result = toSnakeCase(input);

    expect(result.confidence).toBe(0);
  });

  it('should handle maximum confidence (1)', () => {
    const input = createMockIntentRecord({ confidence: 1 });
    const result = toSnakeCase(input);

    expect(result.confidence).toBe(1);
  });

  it('should handle various date formats', () => {
    const dates = [
      '2026-01-25T00:00:00.000Z',
      '2026-12-31T23:59:59.999Z',
      '2026-06-15T12:30:45.123Z',
    ];

    dates.forEach((date) => {
      const input = createMockIntentRecord({ createdAt: date });
      const result = toSnakeCase(input);
      expect(result.created_at).toBe(date);
    });
  });

  it('should handle special characters in string fields', () => {
    const input = createMockIntentRecord({
      intentId: 'intent-with-special-chars-!@#$%',
      sessionRef: 'session/with/slashes',
      intentCategory: 'category with spaces',
      keywords: ['keyword with space', 'emoji-keyword-\u{1F600}'],
    });

    const result = toSnakeCase(input);

    expect(result.intent_id).toBe('intent-with-special-chars-!@#$%');
    expect(result.session_ref).toBe('session/with/slashes');
    expect(result.intent_category).toBe('category with spaces');
    expect(result.keywords).toContain('keyword with space');
    expect(result.keywords).toContain('emoji-keyword-\u{1F600}');
  });

  it('should not mutate the original input object', () => {
    const input = createMockIntentRecord();
    const originalInput = { ...input, keywords: [...input.keywords] };

    toSnakeCase(input);

    expect(input).toEqual(originalInput);
  });

  it('should create a new object (not reference original)', () => {
    const input = createMockIntentRecord();
    const result = toSnakeCase(input);

    // Modify result and verify input is unchanged
    result.intent_id = 'modified';
    expect(input.intentId).toBe('intent-123');
  });
});

// ============================================================================
// IntentEventEmitter Class Tests
// ============================================================================

describe('IntentEventEmitter', () => {
  let emitter: IntentEventEmitter;

  beforeEach(() => {
    emitter = new IntentEventEmitter();
  });

  afterEach(() => {
    emitter.removeAllListeners();
  });

  describe('constructor', () => {
    it('should set max listeners to 100', () => {
      const newEmitter = new IntentEventEmitter();
      expect(newEmitter.getMaxListeners()).toBe(100);
    });
  });

  describe('emitIntentEvent', () => {
    it('should emit to both general intentEvent topic and specific event type', () => {
      const generalHandler = vi.fn();
      const specificHandler = vi.fn();

      emitter.on('intentEvent', generalHandler);
      emitter.on(IntentEventType.INTENT_STORED, specificHandler);

      const payload = {
        intent: createMockIntentPayload(),
        timestamp: new Date().toISOString(),
      };

      emitter.emitIntentEvent(IntentEventType.INTENT_STORED, payload);

      expect(generalHandler).toHaveBeenCalledTimes(1);
      expect(generalHandler).toHaveBeenCalledWith(IntentEventType.INTENT_STORED, payload);

      expect(specificHandler).toHaveBeenCalledTimes(1);
      expect(specificHandler).toHaveBeenCalledWith(payload);
    });

    it('should work with all event types', () => {
      const handler = vi.fn();
      emitter.on('intentEvent', handler);

      const eventTypes = [
        IntentEventType.INTENT_STORED,
        IntentEventType.INTENT_DISTRIBUTION,
        IntentEventType.INTENT_SESSION,
        IntentEventType.INTENT_RECENT,
      ];

      eventTypes.forEach((eventType) => {
        emitter.emitIntentEvent(eventType, { timestamp: new Date().toISOString() } as any);
      });

      expect(handler).toHaveBeenCalledTimes(4);
    });
  });

  describe('emitIntentStored', () => {
    it('should emit intentStored event with correct payload structure', () => {
      const handler = vi.fn();
      emitter.on(IntentEventType.INTENT_STORED, handler);

      const intent = createMockIntentPayload();
      emitter.emitIntentStored(intent);

      expect(handler).toHaveBeenCalledTimes(1);
      const calledPayload = handler.mock.calls[0][0];

      expect(calledPayload).toHaveProperty('intent');
      expect(calledPayload).toHaveProperty('timestamp');
      expect(calledPayload.intent).toEqual(intent);
      expect(typeof calledPayload.timestamp).toBe('string');
    });

    it('should include valid ISO timestamp', () => {
      const handler = vi.fn();
      emitter.on(IntentEventType.INTENT_STORED, handler);

      emitter.emitIntentStored(createMockIntentPayload());

      const calledPayload = handler.mock.calls[0][0];
      const timestamp = new Date(calledPayload.timestamp);
      expect(timestamp.toISOString()).toBe(calledPayload.timestamp);
    });
  });

  describe('emitDistributionUpdate', () => {
    it('should emit intentDistribution event with correct payload', () => {
      const handler = vi.fn();
      emitter.on(IntentEventType.INTENT_DISTRIBUTION, handler);

      const distribution: IntentCategoryDistribution[] = [
        { category: 'code_generation', count: 150, percentage: 45.5 },
        { category: 'debugging', count: 100, percentage: 30.3 },
        { category: 'documentation', count: 80, percentage: 24.2 },
      ];

      emitter.emitDistributionUpdate(distribution, 330);

      expect(handler).toHaveBeenCalledTimes(1);
      const calledPayload = handler.mock.calls[0][0];

      expect(calledPayload.distribution).toEqual(distribution);
      expect(calledPayload.total_count).toBe(330);
      expect(calledPayload).toHaveProperty('timestamp');
    });

    it('should calculate total from distribution if not provided', () => {
      const handler = vi.fn();
      emitter.on(IntentEventType.INTENT_DISTRIBUTION, handler);

      const distribution: IntentCategoryDistribution[] = [
        { category: 'a', count: 10, percentage: 50 },
        { category: 'b', count: 10, percentage: 50 },
      ];

      emitter.emitDistributionUpdate(distribution);

      const calledPayload = handler.mock.calls[0][0];
      expect(calledPayload.total_count).toBe(20);
    });

    it('should use provided totalCount over calculated', () => {
      const handler = vi.fn();
      emitter.on(IntentEventType.INTENT_DISTRIBUTION, handler);

      const distribution: IntentCategoryDistribution[] = [
        { category: 'a', count: 10, percentage: 50 },
      ];

      emitter.emitDistributionUpdate(distribution, 100);

      const calledPayload = handler.mock.calls[0][0];
      expect(calledPayload.total_count).toBe(100);
    });

    it('should handle empty distribution array', () => {
      const handler = vi.fn();
      emitter.on(IntentEventType.INTENT_DISTRIBUTION, handler);

      emitter.emitDistributionUpdate([]);

      const calledPayload = handler.mock.calls[0][0];
      expect(calledPayload.distribution).toEqual([]);
      expect(calledPayload.total_count).toBe(0);
    });
  });

  describe('emitSessionUpdate', () => {
    it('should emit intentSession event with session summary', () => {
      const handler = vi.fn();
      emitter.on(IntentEventType.INTENT_SESSION, handler);

      const session = {
        session_ref: 'sess-123',
        intent_count: 5,
        categories: ['code_generation', 'debugging'],
        first_intent_at: '2026-01-25T10:00:00Z',
        last_intent_at: '2026-01-25T10:30:00Z',
      };

      emitter.emitSessionUpdate(session);

      expect(handler).toHaveBeenCalledTimes(1);
      const calledPayload = handler.mock.calls[0][0];

      expect(calledPayload.session).toEqual(session);
      expect(calledPayload.intents).toBeUndefined();
      expect(calledPayload).toHaveProperty('timestamp');
    });

    it('should include intents when provided', () => {
      const handler = vi.fn();
      emitter.on(IntentEventType.INTENT_SESSION, handler);

      const session = {
        session_ref: 'sess-123',
        intent_count: 2,
        categories: ['debugging'],
        first_intent_at: '2026-01-25T10:00:00Z',
        last_intent_at: '2026-01-25T10:30:00Z',
      };

      const intents = [
        createMockIntentPayload(),
        createMockIntentPayload({ intent_id: 'intent-2' }),
      ];

      emitter.emitSessionUpdate(session, intents);

      const calledPayload = handler.mock.calls[0][0];
      expect(calledPayload.intents).toEqual(intents);
    });
  });

  describe('emitRecentIntents', () => {
    it('should emit intentRecent event with intents and total count', () => {
      const handler = vi.fn();
      emitter.on(IntentEventType.INTENT_RECENT, handler);

      const intents = [
        createMockIntentPayload({ intent_id: '1' }),
        createMockIntentPayload({ intent_id: '2' }),
      ];

      emitter.emitRecentIntents(intents, 1500);

      expect(handler).toHaveBeenCalledTimes(1);
      const calledPayload = handler.mock.calls[0][0];

      expect(calledPayload.intents).toEqual(intents);
      expect(calledPayload.total_count).toBe(1500);
      expect(calledPayload).toHaveProperty('timestamp');
    });

    it('should handle empty intents array', () => {
      const handler = vi.fn();
      emitter.on(IntentEventType.INTENT_RECENT, handler);

      emitter.emitRecentIntents([], 0);

      const calledPayload = handler.mock.calls[0][0];
      expect(calledPayload.intents).toEqual([]);
      expect(calledPayload.total_count).toBe(0);
    });
  });

  describe('emitFromQueryResponse', () => {
    it('should route distribution query response correctly', () => {
      const handler = vi.fn();
      emitter.on(IntentEventType.INTENT_DISTRIBUTION, handler);

      const response: IntentQueryResponseEvent = {
        query_id: 'q-123',
        query_type: 'distribution',
        status: 'success',
        distribution: [{ category: 'test', count: 10, percentage: 100 }],
        total_count: 10,
      };

      emitter.emitFromQueryResponse(response);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should route recent query response correctly', () => {
      const handler = vi.fn();
      emitter.on(IntentEventType.INTENT_RECENT, handler);

      const response: IntentQueryResponseEvent = {
        query_id: 'q-123',
        query_type: 'recent',
        status: 'success',
        intents: [createMockIntentPayload()],
        total_count: 1,
      };

      emitter.emitFromQueryResponse(response);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should route session query response correctly', () => {
      const handler = vi.fn();
      emitter.on(IntentEventType.INTENT_SESSION, handler);

      const response: IntentQueryResponseEvent = {
        query_id: 'q-123',
        query_type: 'session',
        status: 'success',
        intents: [
          createMockIntentPayload({ created_at: '2026-01-25T10:00:00Z' }),
          createMockIntentPayload({ created_at: '2026-01-25T09:00:00Z' }),
        ],
        total_count: 2,
      };

      emitter.emitFromQueryResponse(response);

      expect(handler).toHaveBeenCalledTimes(1);
      const calledPayload = handler.mock.calls[0][0];
      expect(calledPayload.session.intent_count).toBe(2);
    });

    it('should route search query response as recent intents', () => {
      const handler = vi.fn();
      emitter.on(IntentEventType.INTENT_RECENT, handler);

      const response: IntentQueryResponseEvent = {
        query_id: 'q-123',
        query_type: 'search',
        status: 'success',
        intents: [createMockIntentPayload()],
        total_count: 1,
      };

      emitter.emitFromQueryResponse(response);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should not emit for error responses', () => {
      const handler = vi.fn();
      emitter.on('intentEvent', handler);

      const response: IntentQueryResponseEvent = {
        query_id: 'q-123',
        query_type: 'distribution',
        status: 'error',
        error_message: 'Something went wrong',
        total_count: 0,
      };

      emitter.emitFromQueryResponse(response);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle distribution response without data', () => {
      const handler = vi.fn();
      emitter.on(IntentEventType.INTENT_DISTRIBUTION, handler);

      const response: IntentQueryResponseEvent = {
        query_id: 'q-123',
        query_type: 'distribution',
        status: 'success',
        total_count: 0,
      };

      emitter.emitFromQueryResponse(response);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle session response with empty intents', () => {
      const handler = vi.fn();
      emitter.on(IntentEventType.INTENT_SESSION, handler);

      const response: IntentQueryResponseEvent = {
        query_id: 'q-123',
        query_type: 'session',
        status: 'success',
        intents: [],
        total_count: 0,
      };

      emitter.emitFromQueryResponse(response);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('listener management', () => {
    it('should allow multiple listeners for the same event', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      emitter.on(IntentEventType.INTENT_STORED, handler1);
      emitter.on(IntentEventType.INTENT_STORED, handler2);

      emitter.emitIntentStored(createMockIntentPayload());

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should support once listeners', () => {
      const handler = vi.fn();
      emitter.once(IntentEventType.INTENT_STORED, handler);

      emitter.emitIntentStored(createMockIntentPayload());
      emitter.emitIntentStored(createMockIntentPayload());

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should support removing specific listeners', () => {
      const handler = vi.fn();
      emitter.on(IntentEventType.INTENT_STORED, handler);

      emitter.emitIntentStored(createMockIntentPayload());
      expect(handler).toHaveBeenCalledTimes(1);

      emitter.removeListener(IntentEventType.INTENT_STORED, handler);
      emitter.emitIntentStored(createMockIntentPayload());

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });
});

// ============================================================================
// Singleton and Helper Function Tests
// ============================================================================

describe('Singleton Instance', () => {
  it('getIntentEventEmitter should return the same instance', () => {
    const instance1 = getIntentEventEmitter();
    const instance2 = getIntentEventEmitter();

    expect(instance1).toBe(instance2);
  });

  it('intentEventEmitter export should be the same as getIntentEventEmitter()', () => {
    const fromGetter = getIntentEventEmitter();
    expect(intentEventEmitter).toBe(fromGetter);
  });
});

describe('emitIntentUpdate helper', () => {
  let handler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    handler = vi.fn();
    intentEventEmitter.on(IntentEventType.INTENT_STORED, handler);
  });

  afterEach(() => {
    intentEventEmitter.removeListener(IntentEventType.INTENT_STORED, handler);
  });

  it('should convert IntentRecord to snake_case and emit', () => {
    const camelCaseIntent = createMockIntentRecord({
      intentId: 'test-id',
      sessionRef: 'test-session',
    });

    emitIntentUpdate(camelCaseIntent);

    expect(handler).toHaveBeenCalledTimes(1);
    const payload = handler.mock.calls[0][0];

    // Verify the intent was converted to snake_case
    expect(payload.intent.intent_id).toBe('test-id');
    expect(payload.intent.session_ref).toBe('test-session');
    expect(payload.intent).not.toHaveProperty('intentId');
    expect(payload.intent).not.toHaveProperty('sessionRef');
  });

  it('should include timestamp in payload', () => {
    emitIntentUpdate(createMockIntentRecord());

    const payload = handler.mock.calls[0][0];
    expect(payload).toHaveProperty('timestamp');
    expect(typeof payload.timestamp).toBe('string');
  });
});

describe('emitIntentDistributionUpdate helper', () => {
  let handler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    handler = vi.fn();
    intentEventEmitter.on(IntentEventType.INTENT_DISTRIBUTION, handler);
  });

  afterEach(() => {
    intentEventEmitter.removeListener(IntentEventType.INTENT_DISTRIBUTION, handler);
  });

  it('should convert Record distribution to IntentCategoryDistribution array', () => {
    const distribution = {
      distribution: {
        code_generation: 100,
        debugging: 50,
        documentation: 30,
      },
      total_intents: 180,
      time_range_hours: 24,
    };

    emitIntentDistributionUpdate(distribution);

    expect(handler).toHaveBeenCalledTimes(1);
    const payload = handler.mock.calls[0][0];

    expect(payload.distribution).toHaveLength(3);
    expect(payload.total_count).toBe(180);

    // Verify structure of converted distribution
    const codeGenEntry = payload.distribution.find(
      (d: IntentCategoryDistribution) => d.category === 'code_generation'
    );
    expect(codeGenEntry).toBeDefined();
    expect(codeGenEntry.count).toBe(100);
    expect(codeGenEntry.percentage).toBeCloseTo(55.56, 1);
  });

  it('should calculate correct percentages', () => {
    const distribution = {
      distribution: {
        a: 25,
        b: 75,
      },
      total_intents: 100,
      time_range_hours: 24,
    };

    emitIntentDistributionUpdate(distribution);

    const payload = handler.mock.calls[0][0];

    const entryA = payload.distribution.find((d: IntentCategoryDistribution) => d.category === 'a');
    const entryB = payload.distribution.find((d: IntentCategoryDistribution) => d.category === 'b');

    expect(entryA.percentage).toBe(25);
    expect(entryB.percentage).toBe(75);
  });

  it('should handle zero total intents', () => {
    const distribution = {
      distribution: {},
      total_intents: 0,
      time_range_hours: 24,
    };

    emitIntentDistributionUpdate(distribution);

    const payload = handler.mock.calls[0][0];
    expect(payload.distribution).toEqual([]);
    expect(payload.total_count).toBe(0);
  });

  it('should handle single category', () => {
    const distribution = {
      distribution: {
        only_category: 100,
      },
      total_intents: 100,
      time_range_hours: 24,
    };

    emitIntentDistributionUpdate(distribution);

    const payload = handler.mock.calls[0][0];
    expect(payload.distribution).toHaveLength(1);
    expect(payload.distribution[0].category).toBe('only_category');
    expect(payload.distribution[0].percentage).toBe(100);
  });
});

// ============================================================================
// IntentEventType Constants Tests
// ============================================================================

describe('IntentEventType constants', () => {
  it('should have correct event type values', () => {
    expect(IntentEventType.INTENT_STORED).toBe('intentStored');
    expect(IntentEventType.INTENT_DISTRIBUTION).toBe('intentDistribution');
    expect(IntentEventType.INTENT_SESSION).toBe('intentSession');
    expect(IntentEventType.INTENT_RECENT).toBe('intentRecent');
  });

  it('should have all 4 event types', () => {
    const eventTypes = Object.values(IntentEventType);
    expect(eventTypes).toHaveLength(4);
  });
});
