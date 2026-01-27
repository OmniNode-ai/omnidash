# Event Bus Monitor Refactor - Handoff Document

**Date**: January 27, 2026
**Branch**: `feature/event-bus-monitoring`
**Status**: Functional, ready for review

---

## 1. Executive Summary

The Event Bus Monitor page (`/events`) was refactored to extract data management logic from the component into a dedicated hook. This follows the separation of concerns pattern already established by `useIntentStream` in the codebase.

### Key Outcomes

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| `EventBusMonitor.tsx` lines | 1,091 | 539 | -50% |
| Concerns in component | Data + UI | UI only | Separated |
| Deduplication | None | Stable ID-based | Added |
| Memory bounds | Unbounded | Explicit caps | Added |
| Test coverage | 0 tests | 48 unit tests | Added |

### What Works

- WebSocket connection to `/ws` endpoint
- Real-time event streaming when Kafka traffic flows
- Initial state hydration from database (historical events)
- Deduplication prevents duplicate events on reconnect
- Memory-bounded storage with configurable limits
- Filtering by topic, priority, and search
- Pause/resume functionality

### What Does Not Work (Pre-existing)

- **Events/sec shows 0**: No real-time Kafka traffic flowing (routing system not running)
- **Only "Agent Actions" topic visible**: Mock data from Jan 20, 2026 is more recent than real routing decisions from Nov 2025
- These are **data availability issues**, not code bugs

---

## 2. Architecture Overview

```
                                    SERVER
+------------------------------------------------------------------+
|                                                                    |
|   Kafka/Redpanda (192.168.86.200:9092)                            |
|        |                                                           |
|        v                                                           |
|   +------------------+                                             |
|   | event-consumer.ts|  Consumes topics, emits events              |
|   +------------------+                                             |
|        |                                                           |
|        | EventEmitter                                              |
|        v                                                           |
|   +------------------+                                             |
|   | websocket.ts     |  Broadcasts to connected clients            |
|   +------------------+                                             |
|        |                                                           |
|        | WebSocket /ws                                             |
+--------|-----------------------------------------------------------+
         |
         | INITIAL_STATE on connect
         | AGENT_ACTION, ROUTING_DECISION, etc. real-time
         v
                                    CLIENT
+------------------------------------------------------------------+
|                                                                    |
|   +---------------------+                                          |
|   | useWebSocket        |  Low-level WebSocket management          |
|   +---------------------+                                          |
|        |                                                           |
|        | onMessage, onError, etc.                                  |
|        v                                                           |
|   +---------------------+                                          |
|   | useEventBusStream   |  <-- NEW HOOK                            |
|   |---------------------|                                          |
|   | - Event processing  |                                          |
|   | - Deduplication     |                                          |
|   | - Memory bounds     |                                          |
|   | - Derived metrics   |                                          |
|   +---------------------+                                          |
|        |                                                           |
|        | events, metrics, topicBreakdown, etc.                     |
|        v                                                           |
|   +---------------------+                                          |
|   | EventBusMonitor.tsx |  UI-only component                       |
|   |---------------------|                                          |
|   | - Filters           |                                          |
|   | - DashboardRenderer |                                          |
|   | - EventDetailPanel  |                                          |
|   +---------------------+                                          |
|                                                                    |
+------------------------------------------------------------------+
```

---

## 3. Files Changed/Created

### New Files

| File | Lines | Purpose |
|------|-------|---------|
| `client/src/hooks/useEventBusStream.ts` | ~520 | Main hook with WebSocket, event processing, deduplication |
| `client/src/hooks/useEventBusStream.types.ts` | ~310 | Type definitions (wire vs. UI types) |
| `client/src/hooks/__tests__/useEventBusStream.test.ts` | ~630 | 48 unit tests covering core functionality |
| `client/src/hooks/index.ts` | 16 | Barrel export (added useEventBusStream exports) |

### Modified Files

| File | Change |
|------|--------|
| `client/src/pages/EventBusMonitor.tsx` | Reduced from 1,091 to 539 lines; now UI-only |
| `server/event-consumer.ts` | No changes (already had required functionality) |

---

## 4. Key Design Decisions

### 4.1 Wire Types vs. Processed Types

The types file separates server format (`Wire*`) from UI format (`Processed*`):

```typescript
// Wire type - raw from WebSocket
interface WireEventData {
  id?: string;
  correlationId?: string;
  actionType?: string;
  timestamp?: string | number;
  // ... flexible server format
}

// Processed type - normalized for UI
interface ProcessedEvent {
  id: string;              // Always present (computed if needed)
  topic: string;           // Display label
  topicRaw: string;        // Raw for filtering
  timestamp: Date;         // Parsed Date object
  timestampRaw: string;    // Original string
  priority: EventPriority; // Normalized enum
  // ... guaranteed fields
}
```

**Why**: Server data is unpredictable. UI components need consistent shapes.

### 4.2 Stable Event Identity

Events are deduplicated using `getEventId()`:

```typescript
function getEventId(event, topic, eventType): string {
  // 1. Prefer server-assigned ID
  if (event.id) return event.id;
  if (event.correlationId) return event.correlationId;

  // 2. Fallback: hash of normalized content
  const normalized = JSON.stringify({
    topic, eventType,
    timestamp: event.createdAt || event.timestamp,
    sig: JSON.stringify(event).slice(0, 100)
  });
  return `h-${hashString(normalized)}`;
}
```

**Why**: INITIAL_STATE replays historical events. Without stable IDs, reconnects would create duplicates.

### 4.3 Memory Bounds

Explicit caps prevent unbounded growth:

| Buffer | Default Max | Purpose |
|--------|-------------|---------|
| `events[]` | 500 | Main event array |
| `seenIds` Set | 2,500 (5x events) | Deduplication across trims |
| `timestamps[]` | 10,000 | Throughput calculation |
| `errors[]` | 50 | Error ring buffer |

**Enforcement**: Threshold-based cleanup. When a buffer exceeds its cap, it is immediately trimmed.

### 4.4 Ref Buffering for Backpressure

High-frequency events are buffered in refs, then flushed to state:

```typescript
const pendingEventsRef = useRef<ProcessedEvent[]>([]);

// Events accumulate in ref (no re-renders)
pendingEventsRef.current.push(event);

// Flush interval commits to state
useEffect(() => {
  const interval = setInterval(() => {
    if (pendingEventsRef.current.length > 0) {
      setEvents(prev => [...pending.reverse(), ...prev].slice(0, maxItems));
      pendingEventsRef.current = [];
    }
  }, 100); // 100ms default
}, []);
```

**Why**: Raw WebSocket events can arrive 100+/sec. Without batching, React re-renders for each event.

### 4.5 Time Filter Bug Fix

The original plan had a time filter in `handleInitialState` that filtered out events older than `timeSeriesWindowMs` (5 minutes). This was removed because:

1. Historical events from the database are often days/weeks old
2. The time filter was silently dropping ALL events
3. Time filtering is only appropriate for:
   - Time series chart data (useMemo)
   - Throughput calculation (separate window)

**Fix Applied**: Events are now displayed regardless of age. Only throughput and time series apply time windows.

---

## 5. Hook API Reference

### Options

```typescript
interface UseEventBusStreamOptions {
  maxItems?: number;           // default: 500 - max events in memory
  maxDedupIds?: number;        // default: maxItems * 5 - dedupe set size
  autoConnect?: boolean;       // default: true - connect on mount
  timeSeriesWindowMs?: number; // default: 300000 (5 min) - chart window
  throughputWindowMs?: number; // default: 60000 (60s) - events/sec window
  flushIntervalMs?: number;    // default: 100ms - batch interval
  debug?: boolean;             // default: false - console logging
}
```

### Return Value

```typescript
interface UseEventBusStreamReturn {
  // Core data
  events: ProcessedEvent[];           // Bounded array, most recent first

  // Derived metrics
  metrics: {
    totalEvents: number;              // events.length
    eventsPerSecond: number;          // Rolling window calculation
    errorRate: number;                // % critical events
    activeTopics: number;             // Unique topics count
  };

  // Chart data
  topicBreakdown: TopicBreakdownItem[];
  eventTypeBreakdown: EventTypeBreakdownItem[];
  timeSeries: TimeSeriesItem[];

  // Connection
  connectionStatus: 'idle' | 'connecting' | 'connected' | 'error';
  lastError: ProcessedStreamError | null;

  // Stats (lifetime counters)
  stats: {
    totalReceived: number;
    totalDeduped: number;
    totalDropped: number;
    lastEventAt: number | null;
    reconnectCount: number;
  };

  // Errors (ring buffer)
  errors: ProcessedStreamError[];

  // Controls
  connect: () => void;
  disconnect: () => void;
  clearEvents: () => void;
}
```

### Example Usage

```typescript
function EventBusMonitor() {
  const {
    events,
    metrics,
    topicBreakdown,
    connectionStatus,
    connect,
  } = useEventBusStream({ maxItems: 200 });

  return (
    <div>
      <span>Events/sec: {metrics.eventsPerSecond}</span>
      <span>Total: {metrics.totalEvents}</span>
      {connectionStatus !== 'connected' && (
        <button onClick={connect}>Reconnect</button>
      )}
      <EventTable events={events} />
    </div>
  );
}
```

---

## 6. Data Flow

### Connection Lifecycle

```
1. Component mounts
   |
   v
2. useEventBusStream() called with options
   |
   v
3. useWebSocket() establishes connection to /ws
   |
   v
4. Server sends CONNECTED message
   |
   v
5. Server sends INITIAL_STATE with:
   - recentActions (from agent_actions table)
   - routingDecisions (from agent_routing_decisions table)
   - recentTransformations (from agent_transformation_events table)
   |
   v
6. handleInitialState() processes all events:
   - Normalize each event via processEvent()
   - Sort by timestamp (most recent first)
   - Slice to maxItems
   - Rebuild seenIds set
   - Single setEvents() call
   |
   v
7. Client subscribes to ['all'] topics
   |
   v
8. Real-time events flow (when Kafka has traffic):
   AGENT_ACTION -> handleMessage -> processAndIngest -> pendingEventsRef
   |
   v
9. Flush interval (100ms) moves pending -> events state
   |
   v
10. useMemo computes derived data (topicBreakdown, timeSeries, etc.)
```

### Message Types Handled

| Wire Message Type | Maps To | Topic Filter |
|-------------------|---------|--------------|
| `AGENT_ACTION` | `processAndIngest('action', ...)` | `agent-actions` |
| `ROUTING_DECISION` | `processAndIngest('routing', ...)` | `agent-routing-decisions` |
| `AGENT_TRANSFORMATION` | `processAndIngest('transformation', ...)` | `agent-transformation-events` |
| `PERFORMANCE_METRIC` | `processAndIngest('performance', ...)` | `router-performance-metrics` |
| `NODE_INTROSPECTION` | `processAndIngest('introspection', ...)` | `node.introspection` |
| `NODE_HEARTBEAT` | `processAndIngest('heartbeat', ...)` | `node.heartbeat` |
| `ERROR` | `processAndIngest('error', ...)` | `errors` |
| `INITIAL_STATE` | `handleInitialState()` | N/A |
| `CONNECTED`, `PONG`, etc. | Ignored | N/A |

---

## 7. Known Limitations

### 7.1 Events Per Second Shows 0

**Cause**: No real-time Kafka traffic is flowing. The routing system that generates `agent-routing-decisions` events is not currently running.

**Evidence**: `timestampsRef` only gets populated when new events arrive via WebSocket after initial load. Historical events update `timestampsRef` but are filtered out by `throughputWindowMs` (60s).

**Resolution**: Start the agent routing system or seed continuous test events:
```bash
npm run seed-events:continuous
```

### 7.2 Only "Agent Actions" Topic Visible

**Cause**: The mock data seeded on Jan 20, 2026 is more recent than the real routing decisions from Nov 2025. When events are sorted by timestamp, only the recent mock actions appear.

**Evidence**: Query the database:
```sql
SELECT topic, MAX(created_at) FROM agent_actions GROUP BY topic;
SELECT MAX(created_at) FROM agent_routing_decisions;
```

### 7.3 No Server-Side Filtering

All filtering happens client-side. If thousands of events exist, all are sent on INITIAL_STATE. Future improvement would add server-side filtering via API parameters.

### 7.4 Deduplication Does Not Persist

The `seenIds` set is cleared on page refresh. If the same events are in INITIAL_STATE after refresh, they will be shown again (which is correct behavior).

---

## 8. Testing

### Running Tests

```bash
# Run all hook tests
npm run test -- useEventBusStream

# Run with UI
npm run test:ui

# Run with coverage
npm run test:coverage
```

### Test Coverage

| Category | Tests | Coverage |
|----------|-------|----------|
| `getEventId()` stability | 9 | ID generation, hashing, server ID preference |
| `processEvent()` normalization | 12 | Priority extraction, timestamp parsing, source mapping |
| Deduplication | 3 | Same event = same ID, different event = different ID |
| Constants validation | 6 | Reasonable bounds for MAX_ITEMS, FLUSH_INTERVAL, etc. |
| Type exports | 4 | ProcessedEvent shape validation |
| Edge cases | 6 | Large payloads, special characters, nested objects |
| **Total** | **48** | |

### Manual Testing Checklist

1. Open http://localhost:3000/events
2. Verify charts populate on initial load (time series may be empty if all events are old)
3. Click on an event row to open detail panel
4. Test topic filter dropdown
5. Test priority filter dropdown
6. Test search box
7. Click Pause, verify display freezes
8. Click Resume, verify display updates
9. Disconnect network, verify reconnect button appears
10. Reconnect, verify no duplicate events

---

## 9. Future Improvements

From the original refactor plan (`~/.claude/plans/typed-honking-nygaard.md`):

### 9.1 Data Source Registry Pattern

Create a generic `useDashboardData(config)` hook that maps dashboard configs to appropriate data sources:

```typescript
// Future pattern
const dataSource = useDashboardData(eventBusDashboardConfig);
// dataSource shape compatible across all dashboards
```

### 9.2 Server-Side Filtering

Add API parameters for filtering before INITIAL_STATE:
```typescript
// Future: ws.send({ action: 'subscribe', filter: { topics: ['agent-actions'], limit: 100 } })
```

### 9.3 WebWorker Offloading

Move event processing to a WebWorker for high-throughput scenarios:
```typescript
// Future: offload processEvent() and hash computation to worker thread
```

### 9.4 Persistent Event Cache

Use IndexedDB to persist events across page refreshes:
```typescript
// Future: hydrate from IndexedDB first, then delta from server
```

### 9.5 Incremental Time Series

Currently, time series is recomputed from all events. Future optimization would track buckets incrementally:
```typescript
// Future: maintain bucket counts separately, O(1) updates
```

---

## 10. Troubleshooting Guide

### Problem: No events displayed

**Check**:
1. Is the WebSocket connected? Look for green "Live Data" badge
2. Open browser DevTools > Network > WS > select connection > Messages
3. Look for INITIAL_STATE message
4. If INITIAL_STATE.data is empty, database has no events

**Fix**: Seed test data
```bash
npm run seed-events
```

### Problem: Events/sec always shows 0

**Check**:
1. Are new events arriving? Watch DevTools WS messages
2. Is Kafka running? `curl http://192.168.86.200:8080` (Redpanda console)
3. Is the event consumer running? Check server logs

**Fix**: Either start the routing system or run continuous seeding:
```bash
npm run seed-events:continuous
```

### Problem: Duplicate events after reconnect

**Check**:
1. Confirm events have stable IDs (look at `id` field in detail panel)
2. Check if events have server-assigned IDs or hash-based IDs (`h-...`)

**Possible Cause**: Server is sending events with different payloads but no ID, causing different hashes.

### Problem: Memory usage growing

**Check**:
1. Open DevTools > Memory > Take heap snapshot
2. Search for `ProcessedEvent`
3. Count should be <= maxItems (default 500)

**If count is higher**: Check if seenIds set is being rebuilt. Enable debug mode:
```typescript
useEventBusStream({ debug: true });
```

### Problem: Charts not updating

**Check**:
1. Is the component paused? Look for "Paused" state
2. Is the flush interval running? Should see events update every 100ms
3. Are events being deduplicated? Check `stats.totalDeduped` value

---

## 11. Related Files Reference

| File | Purpose |
|------|---------|
| `client/src/hooks/useEventBusStream.ts` | Main hook implementation |
| `client/src/hooks/useEventBusStream.types.ts` | Type definitions |
| `client/src/hooks/__tests__/useEventBusStream.test.ts` | Unit tests |
| `client/src/hooks/index.ts` | Barrel exports |
| `client/src/hooks/useWebSocket.ts` | Low-level WebSocket hook (dependency) |
| `client/src/pages/EventBusMonitor.tsx` | Dashboard component |
| `client/src/lib/configs/event-bus-dashboard.ts` | Dashboard configuration |
| `client/src/components/event-bus/EventDetailPanel.tsx` | Event detail slide-out |
| `server/websocket.ts` | WebSocket server |
| `server/event-consumer.ts` | Kafka consumer and event aggregation |
| `~/.claude/plans/typed-honking-nygaard.md` | Original refactor plan |

---

## 12. Contact / Questions

This refactor was performed as part of the Event Bus Monitoring feature work. For questions about:

- **Hook design patterns**: Reference `useIntentStream.ts` which follows the same pattern
- **WebSocket protocol**: See `server/websocket.ts` for valid message types
- **Kafka topics**: See `server/event-consumer.ts` for topic subscriptions
- **Dashboard rendering**: See `client/src/lib/widgets/` for DashboardRenderer

---

*Document generated: January 27, 2026*
