/**
 * Tests for useIntentStream hook
 *
 * Tests WebSocket connection management, event processing,
 * deduplication, and state management for intent classification events.
 *
 * @see OMN-1458 - Real-time Intent Dashboard Panel
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useIntentStream,
  DEFAULT_MAX_INTENTS,
  SEEN_EVENT_IDS_CLEANUP_MULTIPLIER,
  SEEN_EVENT_IDS_CLEANUP_INTERVAL_MS,
} from '@/hooks/useIntentStream';
import type { IntentClassifiedEvent, IntentStoredEvent } from '@shared/intent-types';

// Mock useWebSocket hook
const mockSubscribe = vi.fn();
const mockUnsubscribe = vi.fn();
const mockReconnect = vi.fn();
const mockClose = vi.fn();
let mockIsConnected: boolean; // initialized in beforeEach
let mockOnMessage:
  | ((message: { type: string; data?: unknown; timestamp: string }) => void)
  | undefined;
let mockOnError: ((event: Event) => void) | undefined;

vi.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: vi.fn(
    (options: {
      onMessage?: (message: { type: string; data?: unknown; timestamp: string }) => void;
      onError?: (event: Event) => void;
      debug?: boolean;
    }) => {
      // Capture callbacks to trigger them in tests
      mockOnMessage = options?.onMessage;
      mockOnError = options?.onError;

      return {
        isConnected: mockIsConnected,
        connectionStatus: mockIsConnected ? 'connected' : 'disconnected',
        error: null,
        subscribe: mockSubscribe,
        unsubscribe: mockUnsubscribe,
        reconnect: mockReconnect,
        close: mockClose,
      };
    }
  ),
}));

// UUID counter for deterministic test IDs (initialized in beforeEach)
let uuidCounter: number;

describe('useIntentStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    uuidCounter = 0;
    mockIsConnected = true;
    mockOnMessage = undefined;
    mockOnError = undefined;

    // Mock crypto.randomUUID in beforeEach for deterministic UUIDs across all tests
    // This ensures consistent behavior when tests run in different orders
    vi.stubGlobal('crypto', {
      randomUUID: () => `test-uuid-${++uuidCounter}`,
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // Helper to create a mock INTENT_CLASSIFIED message
  function createClassifiedMessage(overrides: Partial<IntentClassifiedEvent> = {}): {
    type: string;
    data: IntentClassifiedEvent;
    timestamp: string;
  } {
    return {
      type: 'INTENT_CLASSIFIED',
      data: {
        event_type: 'IntentClassified',
        session_id: 'session-123',
        correlation_id: `corr-${++uuidCounter}`,
        intent_category: 'debugging',
        confidence: 0.85,
        timestamp: new Date().toISOString(),
        ...overrides,
      },
      timestamp: new Date().toISOString(),
    };
  }

  // Helper to create a mock INTENT_STORED message
  function createStoredMessage(overrides: Partial<IntentStoredEvent> = {}): {
    type: string;
    data: IntentStoredEvent;
    timestamp: string;
  } {
    return {
      type: 'INTENT_STORED',
      data: {
        event_type: 'INTENT_STORED',
        correlation_id: `corr-${++uuidCounter}`,
        intent_id: `intent-${++uuidCounter}`,
        session_ref: 'session-456',
        intent_category: 'code_generation',
        confidence: 0.92,
        keywords: ['react', 'typescript'],
        created: true,
        stored_at: new Date().toISOString(),
        execution_time_ms: 15,
        status: 'success',
        ...overrides,
      },
      timestamp: new Date().toISOString(),
    };
  }

  describe('Event Processing', () => {
    it('should process INTENT_CLASSIFIED events correctly', () => {
      const { result } = renderHook(() => useIntentStream());

      // Simulate receiving an INTENT_CLASSIFIED message
      const message = createClassifiedMessage({
        intent_category: 'debugging',
        confidence: 0.85,
        session_id: 'session-abc',
      });

      act(() => {
        mockOnMessage?.(message);
      });

      expect(result.current.intents).toHaveLength(1);
      expect(result.current.intents[0].category).toBe('debugging');
      expect(result.current.intents[0].confidence).toBe(0.85);
      expect(result.current.intents[0].sessionId).toBe('session-abc');
    });

    it('should process INTENT_STORED events correctly', () => {
      const { result } = renderHook(() => useIntentStream());

      const message = createStoredMessage({
        intent_category: 'code_generation',
        confidence: 0.92,
        session_ref: 'session-xyz',
      });

      act(() => {
        mockOnMessage?.(message);
      });

      expect(result.current.intents).toHaveLength(1);
      expect(result.current.intents[0].category).toBe('code_generation');
      expect(result.current.intents[0].confidence).toBe(0.92);
      expect(result.current.intents[0].sessionId).toBe('session-xyz');
    });

    it('should process IntentClassified event type (alternative naming)', () => {
      const { result } = renderHook(() => useIntentStream());

      // Alternative event type naming
      const message = {
        type: 'IntentClassified',
        data: {
          event_type: 'IntentClassified',
          session_id: 'session-alt',
          correlation_id: 'corr-alt-1',
          intent_category: 'research',
          confidence: 0.78,
          timestamp: new Date().toISOString(),
        } as IntentClassifiedEvent,
        timestamp: new Date().toISOString(),
      };

      act(() => {
        mockOnMessage?.(message);
      });

      expect(result.current.intents).toHaveLength(1);
      expect(result.current.intents[0].category).toBe('research');
    });

    it('should ignore non-intent events', () => {
      const { result } = renderHook(() => useIntentStream());

      // Send non-intent event types
      const nonIntentMessages = [
        { type: 'AGENT_ACTION', data: { action: 'test' }, timestamp: new Date().toISOString() },
        { type: 'METRIC_UPDATE', data: { metric: 'cpu' }, timestamp: new Date().toISOString() },
        { type: 'CONNECTION_STATUS', data: {}, timestamp: new Date().toISOString() },
      ];

      act(() => {
        nonIntentMessages.forEach((msg) => mockOnMessage?.(msg));
      });

      expect(result.current.intents).toHaveLength(0);
      expect(result.current.stats.totalReceived).toBe(0);
    });

    it('should deduplicate events with same ID', () => {
      const { result } = renderHook(() => useIntentStream());

      // Create two messages with the same correlation_id
      const sharedCorrelationId = 'duplicate-corr-id';
      const message1 = createClassifiedMessage({ correlation_id: sharedCorrelationId });
      const message2 = createClassifiedMessage({ correlation_id: sharedCorrelationId });

      act(() => {
        mockOnMessage?.(message1);
        mockOnMessage?.(message2);
      });

      // Should only have one intent due to deduplication
      expect(result.current.intents).toHaveLength(1);
      expect(result.current.stats.totalReceived).toBe(1);
    });

    it('should handle events with missing optional fields (confidence, timestamp) but valid identifier', () => {
      const { result } = renderHook(() => useIntentStream());

      // Message with minimal required fields (at least one identifier required)
      // Missing: correlation_id, timestamp, confidence
      const message = {
        type: 'INTENT_CLASSIFIED',
        data: {
          event_type: 'IntentClassified',
          session_id: 'session-with-missing-optionals', // Required: at least one identifier
          intent_category: 'unknown_category',
          // Missing: correlation_id, timestamp, confidence
        } as Partial<IntentClassifiedEvent>,
        timestamp: new Date().toISOString(),
      };

      act(() => {
        mockOnMessage?.(
          message as { type: string; data: IntentClassifiedEvent; timestamp: string }
        );
      });

      expect(result.current.intents).toHaveLength(1);
      expect(result.current.intents[0].category).toBe('unknown_category');
      expect(result.current.intents[0].confidence).toBe(0); // Default when missing
      expect(result.current.intents[0].sessionId).toBe('session-with-missing-optionals');
    });

    it('should ignore events without data payload', () => {
      const { result } = renderHook(() => useIntentStream());

      // Message without data
      const message = {
        type: 'INTENT_CLASSIFIED',
        timestamp: new Date().toISOString(),
      };

      act(() => {
        mockOnMessage?.(message as { type: string; data?: unknown; timestamp: string });
      });

      expect(result.current.intents).toHaveLength(0);
    });
  });

  describe('State Management', () => {
    it('should add new intents to the front of the array', () => {
      const { result } = renderHook(() => useIntentStream());

      // Add first intent
      const message1 = createClassifiedMessage({ intent_category: 'first' });
      act(() => {
        mockOnMessage?.(message1);
      });

      // Add second intent
      const message2 = createClassifiedMessage({ intent_category: 'second' });
      act(() => {
        mockOnMessage?.(message2);
      });

      expect(result.current.intents).toHaveLength(2);
      expect(result.current.intents[0].category).toBe('second'); // Most recent first
      expect(result.current.intents[1].category).toBe('first');
    });

    it('should respect maxItems limit', () => {
      const maxItems = 3;
      const { result } = renderHook(() => useIntentStream({ maxItems }));

      // Add more intents than maxItems
      for (let i = 0; i < 5; i++) {
        const message = createClassifiedMessage({ intent_category: `category-${i}` });
        act(() => {
          mockOnMessage?.(message);
        });
      }

      expect(result.current.intents).toHaveLength(maxItems);
      // Should have the most recent 3 (4, 3, 2)
      expect(result.current.intents[0].category).toBe('category-4');
      expect(result.current.intents[1].category).toBe('category-3');
      expect(result.current.intents[2].category).toBe('category-2');
    });

    it('should update distribution counts', () => {
      const { result } = renderHook(() => useIntentStream());

      // Add intents with different categories
      act(() => {
        mockOnMessage?.(createClassifiedMessage({ intent_category: 'debugging' }));
        mockOnMessage?.(createClassifiedMessage({ intent_category: 'debugging' }));
        mockOnMessage?.(createClassifiedMessage({ intent_category: 'code_generation' }));
      });

      expect(result.current.distribution).toEqual({
        debugging: 2,
        code_generation: 1,
      });
    });

    it('should update stats on new events', () => {
      const { result } = renderHook(() => useIntentStream());

      expect(result.current.stats.totalReceived).toBe(0);
      expect(result.current.stats.lastEventTime).toBeNull();

      // Add an intent
      act(() => {
        mockOnMessage?.(createClassifiedMessage({ intent_category: 'debugging' }));
      });

      expect(result.current.stats.totalReceived).toBe(1);
      expect(result.current.stats.byCategory).toEqual({ debugging: 1 });
      expect(result.current.stats.lastEventTime).toBeInstanceOf(Date);

      // Add another
      act(() => {
        mockOnMessage?.(createClassifiedMessage({ intent_category: 'research' }));
      });

      expect(result.current.stats.totalReceived).toBe(2);
      expect(result.current.stats.byCategory).toEqual({
        debugging: 1,
        research: 1,
      });
    });
  });

  describe('Memory Management', () => {
    it('should cleanup seenEventIds when exceeding threshold', () => {
      // Use small maxItems to trigger cleanup threshold easily
      const maxItems = 2;
      const cleanupThreshold = maxItems * SEEN_EVENT_IDS_CLEANUP_MULTIPLIER; // 6

      const { result } = renderHook(() => useIntentStream({ maxItems }));

      // Add enough events to exceed cleanup threshold (>6 unique IDs)
      for (let i = 0; i < cleanupThreshold + 2; i++) {
        const message = createClassifiedMessage({
          correlation_id: `unique-id-${i}`,
          intent_category: `cat-${i}`,
        });
        act(() => {
          mockOnMessage?.(message);
        });
      }

      // Should still only have maxItems intents
      expect(result.current.intents).toHaveLength(maxItems);

      // After cleanup, duplicates should work for recently seen IDs
      // but new events should still be accepted
      const newMessage = createClassifiedMessage({
        correlation_id: 'brand-new-id',
        intent_category: 'new-category',
      });

      act(() => {
        mockOnMessage?.(newMessage);
      });

      expect(result.current.intents).toHaveLength(maxItems);
      expect(result.current.intents[0].category).toBe('new-category');
    });

    it('should perform periodic cleanup of seenEventIds', () => {
      const maxItems = 5;
      const { result } = renderHook(() => useIntentStream({ maxItems }));

      // Add some events
      for (let i = 0; i < 10; i++) {
        act(() => {
          mockOnMessage?.(
            createClassifiedMessage({
              correlation_id: `periodic-id-${i}`,
              intent_category: `periodic-cat-${i}`,
            })
          );
        });
      }

      expect(result.current.intents).toHaveLength(maxItems);

      // Advance time to trigger periodic cleanup
      act(() => {
        vi.advanceTimersByTime(SEEN_EVENT_IDS_CLEANUP_INTERVAL_MS);
      });

      // After cleanup, old IDs should no longer be tracked
      // We can verify by re-adding an old ID that was pruned
      // (since intents array only has 5 items, IDs 0-4 should be pruned)
      const readdedMessage = createClassifiedMessage({
        correlation_id: 'periodic-id-0', // This was the first one, now pruned
        intent_category: 'readded-category',
      });

      act(() => {
        mockOnMessage?.(readdedMessage);
      });

      // If cleanup worked, this should be treated as a new event
      expect(result.current.intents[0].category).toBe('readded-category');
    });

    it('should clear all state when clearIntents called', () => {
      const { result } = renderHook(() => useIntentStream());

      // Add some intents
      act(() => {
        mockOnMessage?.(createClassifiedMessage({ intent_category: 'debugging' }));
        mockOnMessage?.(createClassifiedMessage({ intent_category: 'research' }));
      });

      expect(result.current.intents).toHaveLength(2);
      expect(Object.keys(result.current.distribution).length).toBe(2);
      expect(result.current.stats.totalReceived).toBe(2);

      // Clear intents
      act(() => {
        result.current.clearIntents();
      });

      expect(result.current.intents).toHaveLength(0);
      expect(result.current.distribution).toEqual({});
      expect(result.current.stats.totalReceived).toBe(0);
      expect(result.current.stats.byCategory).toEqual({});
      expect(result.current.stats.lastEventTime).toBeNull();
      expect(result.current.error).toBeNull();

      // After clearing, old IDs should be accepted again (seenEventIds cleared)
      // Create a message with the same correlation_id as one that was previously added
      const sameIdMessage = createClassifiedMessage({
        correlation_id: 'corr-1', // Same as the first message created
        intent_category: 'after-clear',
      });
      act(() => {
        mockOnMessage?.(sameIdMessage);
      });

      expect(result.current.intents).toHaveLength(1);
    });
  });

  describe('Configuration', () => {
    it('should use default maxItems of 100', () => {
      expect(DEFAULT_MAX_INTENTS).toBe(100);

      const { result } = renderHook(() => useIntentStream());

      // Add more than 100 intents
      for (let i = 0; i < 110; i++) {
        act(() => {
          mockOnMessage?.(
            createClassifiedMessage({
              correlation_id: `default-max-${i}`,
              intent_category: `cat-${i}`,
            })
          );
        });
      }

      expect(result.current.intents).toHaveLength(DEFAULT_MAX_INTENTS);
    });

    it('should respect custom maxItems option', () => {
      const customMaxItems = 10;
      const { result } = renderHook(() => useIntentStream({ maxItems: customMaxItems }));

      // Add more than custom limit
      for (let i = 0; i < 15; i++) {
        act(() => {
          mockOnMessage?.(
            createClassifiedMessage({
              correlation_id: `custom-max-${i}`,
              intent_category: `cat-${i}`,
            })
          );
        });
      }

      expect(result.current.intents).toHaveLength(customMaxItems);
    });

    it('should call onIntent callback when provided', () => {
      const onIntentCallback = vi.fn();
      renderHook(() => useIntentStream({ onIntent: onIntentCallback, onIntentThrottleMs: 0 }));

      const message = createClassifiedMessage({
        intent_category: 'callback-test',
        confidence: 0.77,
      });

      act(() => {
        mockOnMessage?.(message);
      });

      expect(onIntentCallback).toHaveBeenCalledTimes(1);
      expect(onIntentCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'callback-test',
          confidence: 0.77,
        })
      );
    });

    it('should not call onIntent for duplicate events', () => {
      const onIntentCallback = vi.fn();
      renderHook(() => useIntentStream({ onIntent: onIntentCallback, onIntentThrottleMs: 0 }));

      const sharedId = 'callback-dedupe-id';
      const message1 = createClassifiedMessage({ correlation_id: sharedId });
      const message2 = createClassifiedMessage({ correlation_id: sharedId });

      act(() => {
        mockOnMessage?.(message1);
        mockOnMessage?.(message2);
      });

      // Should only be called once due to deduplication
      expect(onIntentCallback).toHaveBeenCalledTimes(1);
    });

    it('should throttle onIntent callback to prevent excessive calls', () => {
      const onIntentCallback = vi.fn();
      // Use default throttle of 100ms
      renderHook(() => useIntentStream({ onIntent: onIntentCallback, onIntentThrottleMs: 100 }));

      // Send 5 events in rapid succession
      act(() => {
        for (let i = 0; i < 5; i++) {
          mockOnMessage?.(createClassifiedMessage({ intent_category: `event-${i}` }));
        }
      });

      // First call should happen immediately
      expect(onIntentCallback).toHaveBeenCalledTimes(1);
      expect(onIntentCallback).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'event-0' })
      );

      // Advance time to trigger trailing call
      act(() => {
        vi.advanceTimersByTime(100);
      });

      // Trailing call should happen with most recent event
      expect(onIntentCallback).toHaveBeenCalledTimes(2);
      expect(onIntentCallback).toHaveBeenLastCalledWith(
        expect.objectContaining({ category: 'event-4' })
      );
    });

    it('should handle updated onIntent callback (not stale closure)', () => {
      const onIntentCallback1 = vi.fn();
      const onIntentCallback2 = vi.fn();

      const { rerender } = renderHook(
        ({ onIntent }) => useIntentStream({ onIntent, onIntentThrottleMs: 0 }),
        {
          initialProps: { onIntent: onIntentCallback1 },
        }
      );

      // Send first event
      act(() => {
        mockOnMessage?.(createClassifiedMessage({ intent_category: 'first' }));
      });

      expect(onIntentCallback1).toHaveBeenCalledTimes(1);
      expect(onIntentCallback2).toHaveBeenCalledTimes(0);

      // Update callback
      rerender({ onIntent: onIntentCallback2 });

      // Send second event
      act(() => {
        mockOnMessage?.(createClassifiedMessage({ intent_category: 'second' }));
      });

      // New callback should be called for new events
      expect(onIntentCallback1).toHaveBeenCalledTimes(1); // Still 1
      expect(onIntentCallback2).toHaveBeenCalledTimes(1); // Now called
    });
  });

  describe('WebSocket Integration', () => {
    it('should subscribe to intent topics when connected', () => {
      renderHook(() => useIntentStream());

      expect(mockSubscribe).toHaveBeenCalledWith(['intents', 'intents-stored']);
    });

    it('should not subscribe when autoConnect is false', () => {
      renderHook(() => useIntentStream({ autoConnect: false }));

      expect(mockSubscribe).not.toHaveBeenCalled();
    });

    it('should expose connect and disconnect methods', () => {
      const { result } = renderHook(() => useIntentStream());

      expect(typeof result.current.connect).toBe('function');
      expect(typeof result.current.disconnect).toBe('function');

      // connect should trigger reconnect
      act(() => {
        result.current.connect();
      });

      expect(mockReconnect).toHaveBeenCalled();
    });

    it('should disconnect by unsubscribing from topics and closing WebSocket connection', () => {
      const { result } = renderHook(() => useIntentStream());

      // Verify we're subscribed first
      expect(mockSubscribe).toHaveBeenCalledWith(['intents', 'intents-stored']);

      // Call disconnect
      act(() => {
        result.current.disconnect();
      });

      // Should unsubscribe from topics
      expect(mockUnsubscribe).toHaveBeenCalledWith(['intents', 'intents-stored']);

      // Should close the WebSocket connection
      expect(mockClose).toHaveBeenCalled();
    });

    it('should not attempt unsubscribe when WebSocket is already disconnected', () => {
      // Start with disconnected state
      mockIsConnected = false;

      const { result } = renderHook(() => useIntentStream());

      // Clear mocks to check fresh calls
      vi.clearAllMocks();

      // Call disconnect when already disconnected
      act(() => {
        result.current.disconnect();
      });

      // Should NOT call unsubscribe since WebSocket is already disconnected
      expect(mockUnsubscribe).not.toHaveBeenCalled();

      // Should still close to ensure cleanup
      expect(mockClose).toHaveBeenCalled();
    });

    it('should handle multiple disconnect calls safely', () => {
      const { result } = renderHook(() => useIntentStream());

      // Call disconnect multiple times
      act(() => {
        result.current.disconnect();
        result.current.disconnect();
        result.current.disconnect();
      });

      // close should be called for each disconnect call (idempotent)
      expect(mockClose).toHaveBeenCalledTimes(3);
    });

    it('should expose connection status from useWebSocket', () => {
      const { result } = renderHook(() => useIntentStream());

      expect(result.current.isConnected).toBe(true);
      expect(result.current.connectionStatus).toBe('connected');
    });
  });

  describe('Error Handling', () => {
    it('should set error on WebSocket error', () => {
      const { result } = renderHook(() => useIntentStream());

      // Simulate WebSocket error
      const errorEvent = new Event('error');
      act(() => {
        mockOnError?.(errorEvent);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('WebSocket connection error');
    });

    it('should clear error on successful event processing', () => {
      const { result } = renderHook(() => useIntentStream());

      // Set an error first
      act(() => {
        mockOnError?.(new Event('error'));
      });

      expect(result.current.error).not.toBeNull();

      // Process a successful event
      act(() => {
        mockOnMessage?.(createClassifiedMessage());
      });

      expect(result.current.error).toBeNull();
    });

    it('should reject malformed message data with string instead of object', () => {
      const { result } = renderHook(() => useIntentStream());

      // Message with invalid data structure (string instead of object)
      const malformedMessage = {
        type: 'INTENT_CLASSIFIED',
        data: 'not-an-object',
        timestamp: new Date().toISOString(),
      };

      // Should not throw and should not add intent
      act(() => {
        mockOnMessage?.(
          malformedMessage as unknown as { type: string; data?: unknown; timestamp: string }
        );
      });

      // Malformed data should be rejected by validation
      expect(result.current.intents).toHaveLength(0);
    });

    it('should reject message data that is an array instead of object', () => {
      const { result } = renderHook(() => useIntentStream());

      const arrayDataMessage = {
        type: 'INTENT_CLASSIFIED',
        data: ['not', 'an', 'object'],
        timestamp: new Date().toISOString(),
      };

      act(() => {
        mockOnMessage?.(
          arrayDataMessage as unknown as { type: string; data?: unknown; timestamp: string }
        );
      });

      expect(result.current.intents).toHaveLength(0);
    });

    it('should reject message data missing all identifier fields', () => {
      const { result } = renderHook(() => useIntentStream());

      // Object but missing all identifier fields (correlation_id, intent_id, session_id, session_ref)
      const noIdentifierMessage = {
        type: 'INTENT_CLASSIFIED',
        data: {
          event_type: 'IntentClassified',
          intent_category: 'debugging',
          confidence: 0.85,
        },
        timestamp: new Date().toISOString(),
      };

      act(() => {
        mockOnMessage?.(
          noIdentifierMessage as unknown as { type: string; data?: unknown; timestamp: string }
        );
      });

      // Should be rejected due to missing identifier fields
      expect(result.current.intents).toHaveLength(0);
    });

    it('should accept message with only session_id as identifier', () => {
      const { result } = renderHook(() => useIntentStream());

      // Valid message with only session_id (no correlation_id)
      const sessionOnlyMessage = {
        type: 'INTENT_CLASSIFIED',
        data: {
          event_type: 'IntentClassified',
          session_id: 'session-only-test',
          intent_category: 'debugging',
          confidence: 0.85,
          timestamp: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      };

      act(() => {
        mockOnMessage?.(sessionOnlyMessage as { type: string; data?: unknown; timestamp: string });
      });

      expect(result.current.intents).toHaveLength(1);
    });

    it('should handle null message data gracefully', () => {
      const { result } = renderHook(() => useIntentStream());

      const nullDataMessage = {
        type: 'INTENT_CLASSIFIED',
        data: null,
        timestamp: new Date().toISOString(),
      };

      act(() => {
        mockOnMessage?.(
          nullDataMessage as unknown as { type: string; data?: unknown; timestamp: string }
        );
      });

      expect(result.current.intents).toHaveLength(0);
    });
  });

  describe('Exported Constants', () => {
    it('should export correct constant values', () => {
      expect(DEFAULT_MAX_INTENTS).toBe(100);
      expect(SEEN_EVENT_IDS_CLEANUP_MULTIPLIER).toBe(3);
      expect(SEEN_EVENT_IDS_CLEANUP_INTERVAL_MS).toBe(60_000);
    });
  });
});
