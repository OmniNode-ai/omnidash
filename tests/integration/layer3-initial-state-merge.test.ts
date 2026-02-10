/**
 * Layer 3 Integration Test: INITIAL_STATE merge with real-time events
 *
 * Tests that handleInitialState() correctly MERGES with existing real-time
 * events instead of replacing them. This covers the race condition where:
 *
 *   1. WebSocket connects and real-time events start arriving immediately
 *   2. INITIAL_STATE arrives slightly later (delayed by DB preload on server)
 *   3. The 1-2 real-time events that arrived first must survive the hydration
 *
 * Previously, handleInitialState() called setEvents(processed) which replaced
 * the entire events array, wiping out any real-time events already received.
 *
 * @see useEventBusStream.ts - handleInitialState()
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks - vi.mock is hoisted, but declared here for clarity
// ---------------------------------------------------------------------------

/** Captured onMessage handler from useWebSocket mock */
let capturedOnMessage: ((msg: Record<string, unknown>) => void) | undefined;

vi.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: vi
    .fn()
    .mockImplementation(
      (opts: {
        onMessage?: (msg: Record<string, unknown>) => void;
        onOpen?: () => void;
        onClose?: () => void;
        onError?: (e: Event) => void;
      }) => {
        // Capture the latest onMessage so tests can invoke it
        capturedOnMessage = opts.onMessage;
        return {
          isConnected: true,
          connectionStatus: 'connected' as const,
          error: null,
          send: vi.fn(),
          subscribe: vi.fn(),
          unsubscribe: vi.fn(),
          reconnect: vi.fn(),
          close: vi.fn(),
        };
      }
    ),
}));

vi.mock('@/lib/configs/event-bus-dashboard', () => ({
  getTopicLabel: (topic: string) => topic,
  getEventTypeLabel: (et: string) => et,
  getEventMonitoringConfig: () => ({
    max_events: 500,
    max_events_options: [50, 100, 200, 500, 1000],
    throughput_cleanup_interval: 100,
    time_series_window_ms: 5 * 60 * 1000,
    throughput_window_ms: 60 * 1000,
    max_breakdown_items: 50,
    periodic_cleanup_interval_ms: 10 * 1000,
  }),
}));

vi.mock('@/components/event-bus/eventDetailUtils', () => ({
  extractParsedDetails: () => null,
}));

// ---------------------------------------------------------------------------
// Import under test (after mock declarations)
// ---------------------------------------------------------------------------

import { useEventBusStream } from '@/hooks/useEventBusStream';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Send a message through the captured WebSocket onMessage handler */
function sendMessage(msg: Record<string, unknown>): void {
  if (!capturedOnMessage) {
    throw new Error('onMessage not captured - hook not rendered yet');
  }
  capturedOnMessage(msg);
}

/** Build a minimal AGENT_ACTION WebSocket message */
function makeAgentAction(id: string, timestampMs: number): Record<string, unknown> {
  return {
    type: 'AGENT_ACTION',
    data: {
      id,
      actionType: 'tool_call',
      agentName: 'polymorphic',
      timestamp: new Date(timestampMs).toISOString(),
    },
  };
}

/** Build a minimal INITIAL_STATE WebSocket message with legacy arrays */
function makeInitialState(
  actions: Array<{ id: string; timestampMs: number }>
): Record<string, unknown> {
  return {
    type: 'INITIAL_STATE',
    data: {
      recentActions: actions.map((a) => ({
        id: a.id,
        actionType: 'action',
        agentName: 'router',
        timestamp: new Date(a.timestampMs).toISOString(),
      })),
      routingDecisions: [],
      recentTransformations: [],
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Layer 3: INITIAL_STATE merge with real-time events', () => {
  /** Anchor for relative timestamps */
  let baseTime: number;

  beforeEach(() => {
    vi.useFakeTimers();
    // Set a stable base time so relative offsets are predictable
    baseTime = new Date('2026-02-09T12:00:00Z').getTime();
    vi.setSystemTime(baseTime);
    capturedOnMessage = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Core merge behavior
  // -------------------------------------------------------------------------

  it('preserves flushed real-time events when INITIAL_STATE arrives later', () => {
    const { result } = renderHook(() => useEventBusStream({ maxItems: 100, flushIntervalMs: 50 }));

    // Step 1: Two real-time events arrive
    act(() => {
      sendMessage(makeAgentAction('rt-1', baseTime - 1000));
      sendMessage(makeAgentAction('rt-2', baseTime - 500));
    });

    // Step 2: Advance timer to flush pending events into React state
    act(() => {
      vi.advanceTimersByTime(60);
    });

    // Confirm the 2 events were flushed
    expect(result.current.events).toHaveLength(2);
    expect(result.current.events.map((e) => e.id)).toContain('rt-1');
    expect(result.current.events.map((e) => e.id)).toContain('rt-2');

    // Step 3: INITIAL_STATE arrives with 2 OLDER events from DB preload
    act(() => {
      sendMessage(
        makeInitialState([
          { id: 'old-1', timestampMs: baseTime - 60_000 },
          { id: 'old-2', timestampMs: baseTime - 30_000 },
        ])
      );
    });

    // All 4 events must be present
    const ids = result.current.events.map((e) => e.id);
    expect(ids).toContain('rt-1');
    expect(ids).toContain('rt-2');
    expect(ids).toContain('old-1');
    expect(ids).toContain('old-2');
    expect(result.current.events).toHaveLength(4);
  });

  it('preserves PENDING (unflushed) real-time events when INITIAL_STATE arrives', () => {
    const { result } = renderHook(() => useEventBusStream({ maxItems: 100, flushIntervalMs: 50 }));

    // Step 1: Real-time event arrives but NO flush yet (timer not advanced)
    act(() => {
      sendMessage(makeAgentAction('pending-1', baseTime - 200));
    });

    // Events are still in pendingEventsRef, not in React state
    expect(result.current.events).toHaveLength(0);

    // Step 2: INITIAL_STATE arrives before the flush interval fires
    act(() => {
      sendMessage(makeInitialState([{ id: 'old-1', timestampMs: baseTime - 60_000 }]));
    });

    // Both events must be present (pending was drained and merged)
    const ids = result.current.events.map((e) => e.id);
    expect(ids).toContain('pending-1');
    expect(ids).toContain('old-1');
    expect(result.current.events).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // Deduplication
  // -------------------------------------------------------------------------

  it('deduplicates events present in both real-time stream and INITIAL_STATE', () => {
    const { result } = renderHook(() => useEventBusStream({ maxItems: 100, flushIntervalMs: 50 }));

    // Step 1: Real-time event with id "shared-1"
    act(() => {
      sendMessage(makeAgentAction('shared-1', baseTime - 1000));
    });

    // Flush to state
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(result.current.events).toHaveLength(1);

    // Step 2: INITIAL_STATE includes the SAME "shared-1" plus a new "old-1"
    act(() => {
      sendMessage(
        makeInitialState([
          { id: 'shared-1', timestampMs: baseTime - 1000 },
          { id: 'old-1', timestampMs: baseTime - 60_000 },
        ])
      );
    });

    // "shared-1" must NOT be duplicated
    const ids = result.current.events.map((e) => e.id);
    expect(ids.filter((id) => id === 'shared-1')).toHaveLength(1);
    expect(ids).toContain('old-1');
    expect(result.current.events).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // Sort order
  // -------------------------------------------------------------------------

  it('sorts merged events newest-first', () => {
    const { result } = renderHook(() => useEventBusStream({ maxItems: 100, flushIntervalMs: 50 }));

    // Real-time event (very recent)
    act(() => {
      sendMessage(makeAgentAction('rt-new', baseTime - 100));
    });
    act(() => {
      vi.advanceTimersByTime(60);
    });

    // INITIAL_STATE with progressively older events
    act(() => {
      sendMessage(
        makeInitialState([
          { id: 'old-mid', timestampMs: baseTime - 30_000 },
          { id: 'old-oldest', timestampMs: baseTime - 120_000 },
        ])
      );
    });

    // Verify sorted newest-first
    const timestamps = result.current.events.map((e) => e.timestamp.getTime());
    for (let i = 0; i < timestamps.length - 1; i++) {
      expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i + 1]);
    }

    // Verify the newest is the real-time event
    expect(result.current.events[0].id).toBe('rt-new');
    expect(result.current.events[result.current.events.length - 1].id).toBe('old-oldest');
  });

  // -------------------------------------------------------------------------
  // maxItems cap
  // -------------------------------------------------------------------------

  it('respects maxItems cap after merge, keeping the newest events', () => {
    const { result } = renderHook(() => useEventBusStream({ maxItems: 3, flushIntervalMs: 50 }));

    // 2 real-time events (newest)
    act(() => {
      sendMessage(makeAgentAction('rt-1', baseTime - 100));
      sendMessage(makeAgentAction('rt-2', baseTime - 200));
    });
    act(() => {
      vi.advanceTimersByTime(60);
    });

    // INITIAL_STATE with 3 more events (total would be 5, exceeding maxItems=3)
    act(() => {
      sendMessage(
        makeInitialState([
          { id: 'old-1', timestampMs: baseTime - 1_000 },
          { id: 'old-2', timestampMs: baseTime - 2_000 },
          { id: 'old-3', timestampMs: baseTime - 3_000 },
        ])
      );
    });

    // Capped at 3, keeping the newest
    expect(result.current.events).toHaveLength(3);
    const ids = result.current.events.map((e) => e.id);

    // The 2 real-time events are the newest, so they must survive
    expect(ids).toContain('rt-1');
    expect(ids).toContain('rt-2');
    // Only the first (newest) INITIAL_STATE event fits
    expect(ids).toContain('old-1');
    // Oldest events are dropped
    expect(ids).not.toContain('old-2');
    expect(ids).not.toContain('old-3');
  });

  // -------------------------------------------------------------------------
  // Multiple real-time events + unflushed combo
  // -------------------------------------------------------------------------

  it('handles mix of flushed and pending real-time events with INITIAL_STATE', () => {
    const { result } = renderHook(() => useEventBusStream({ maxItems: 100, flushIntervalMs: 50 }));

    // First real-time event
    act(() => {
      sendMessage(makeAgentAction('rt-flushed', baseTime - 2000));
    });

    // Flush it to state
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(result.current.events).toHaveLength(1);

    // Second real-time event arrives (NOT flushed yet)
    act(() => {
      sendMessage(makeAgentAction('rt-pending', baseTime - 500));
    });

    // INITIAL_STATE arrives while "rt-pending" is still in the pending buffer
    act(() => {
      sendMessage(makeInitialState([{ id: 'old-1', timestampMs: baseTime - 60_000 }]));
    });

    // All 3 events must be present
    const ids = result.current.events.map((e) => e.id);
    expect(ids).toContain('rt-flushed');
    expect(ids).toContain('rt-pending');
    expect(ids).toContain('old-1');
    expect(result.current.events).toHaveLength(3);
  });
});
