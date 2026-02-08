# Handoff Document -- DEMO_MODE / Preload Pipeline Session

**Date**: 2026-02-08
**Branch**: `jonah/omn-1933-canonical-topic-naming`
**Status**: Unstaged changes across 15 files, not yet committed

---

## Session Summary

Introduced a `DEMO_MODE` environment variable to gate all mock/fake data generators so they never run by default. Rewrote the event preload pipeline so the Event Bus Monitor dashboard populates on startup from PostgreSQL (`event_bus_events` table) instead of relying on live Kafka traffic. The client's `handleInitialState` handler was rewritten to prefer raw `eventBusEvents` (with correct topic/event_type metadata) over the legacy flattened arrays. The "Events Loaded" KPI was removed from the dashboard config. The `event_bus_data_source` consumer group was bumped to `v2` to avoid stale partition assignments.

---

## Changes Made

| File | Change |
|------|--------|
| `server/index.ts` | Gate mock event generator, mock registry events, and schema init behind `DEMO_MODE=true` |
| `server/event-consumer.ts` | Rewrite `preloadFromDatabase()` to query `event_bus_events` with per-topic windowing (200 rows/topic, 2000 total), strip env prefix before replay via `injectPlaybackEvent`; add `tool-content` handler in `injectPlaybackEvent`; extract `SQL_PRELOAD_LIMIT` constant |
| `server/agent-execution-tracker.ts` | Gate `generateMockExecutions()` auto-init behind `DEMO_MODE=true` (line 310) |
| `server/agent-run-tracker.ts` | Gate `generateMockData()` auto-init behind `DEMO_MODE=true` (line 395) |
| `server/registry-mock-data.ts` | `getNodes()` and `getInstances()` return empty arrays when `DEMO_MODE !== 'true'` |
| `server/event-bus-data-source.ts` | Bump consumer group from `omnidash-event-bus-datasource-v1` to `v2` |
| `server/websocket.ts` | `fetchRealEventsForInitialState()` now returns `eventBusEvents` alongside `recentActions`; INITIAL_STATE payload includes raw `eventBusEvents` array for the Event Bus Monitor |
| `client/src/hooks/useEventBusStream.ts` | Rewrite `handleInitialState` to prefer `eventBusEvents` (raw events with correct topic) over legacy `recentActions`/`routingDecisions`/`recentTransformations` |
| `client/src/hooks/useEventBusStream.utils.ts` | Minor adjustments to event processing for new data shape |
| `client/src/lib/configs/event-bus-dashboard.ts` | Remove "Events Loaded" metric card widget; keep Topics Active, Events/sec, Error Rate |
| `client/src/pages/EventBusMonitor.tsx` | Layout/UX updates for event bus dashboard |
| `client/src/components/event-bus/EventDetailPanel.tsx` | UI enhancements for event detail view |
| `client/src/components/event-bus/TopicSelector.tsx` | Refactored topic selector component |
| `client/src/components/event-bus/__tests__/EventDetailPanel.test.tsx` | Test updates for component changes |
| `.env.example` | Add `DEMO_MODE=false` with documentation; remove deprecated `ARCHON_*` variables |

---

## Architecture Decisions

### 1. DEMO_MODE as explicit opt-in
All mock data generators were previously running unconditionally at startup. This made it impossible to tell whether dashboard data was real or fake. `DEMO_MODE=true` must now be explicitly set to get any synthetic data. Default is `false`.

### 2. Preload from PostgreSQL, not Kafka
The `event_bus_events` table already contains all historical events (written by `EventBusDataSource`). Querying this table on startup is faster and more reliable than re-consuming from Kafka `fromBeginning`. The preload uses a windowed query (200 rows per topic, 2000 total) to prevent any single high-volume topic from drowning the rest.

### 3. Env prefix stripping in preload only
The `event_bus_events` table stores topics with env prefix (e.g., `dev.onex.evt.platform.node-heartbeat.v1`). The `preloadFromDatabase()` method strips this prefix before calling `injectPlaybackEvent()` so topics match the suffix-only constants. This fix was deliberately scoped to preload -- the live `eachMessage` handler still has the same mismatch (see Known Issues).

### 4. eventBusEvents as primary hydration source
The INITIAL_STATE WebSocket message now includes a `eventBusEvents` array with raw event data (event_type, topic, payload, timestamp, source, correlation_id, event_id). The client prefers this over the legacy flattened arrays because it preserves the original topic name and event type, which are needed for accurate topic/type breakdowns in the Event Bus Monitor.

### 5. Consumer group bump to v2
The `event_bus_data_source` Kafka consumer group was bumped from `v1` to `v2` to force a clean partition assignment. Zombie consumers from previous sessions were holding stale offsets.

---

## DEMO_MODE System

### How it works

`DEMO_MODE` is checked as `process.env.DEMO_MODE === 'true'` (string comparison, not truthy).

### What it gates

| Component | File | What happens when DEMO_MODE=false |
|-----------|------|----------------------------------|
| Mock event bus generator | `server/index.ts` L137-161 | `eventBusMockGenerator.start()` never called |
| Mock registry events | `server/index.ts` L154-159 | `startMockRegistryEvents()` never called |
| Agent execution tracker | `server/agent-execution-tracker.ts` L310 | `generateMockExecutions()` skipped -- empty array |
| Agent run tracker | `server/agent-run-tracker.ts` L395 | `generateMockData()` skipped -- empty array |
| Registry mock nodes | `server/registry-mock-data.ts` L239 | `getNodes()` returns `[]` |
| Registry mock instances | `server/registry-mock-data.ts` L255 | `getInstances()` returns `[]` |

### Not gated by DEMO_MODE (always real)

- Kafka consumer (`EventConsumer`) -- always connects and consumes
- Event Bus Data Source -- always persists events to PostgreSQL
- WebSocket server -- always runs
- Database preload -- controlled by `ENABLE_EVENT_PRELOAD` (separate flag)

---

## Preload Pipeline

### Data flow

```
PostgreSQL (event_bus_events)
    |
    | SQL: windowed query, 200 rows/topic, 2000 total, newest first
    v
EventConsumer.preloadFromDatabase()
    |
    | Strip env prefix: "dev.onex.evt..." -> "onex.evt..."
    | Replay in chronological order (oldest first)
    v
EventConsumer.injectPlaybackEvent(topic, event)
    |
    | Routes to same handlers as live Kafka events
    | (handleRoutingDecision, handleAgentAction, handleOmniclaudeLifecycleEvent, etc.)
    v
EventConsumer in-memory state populated
    |
    | emit('metricUpdate'), emit('actionUpdate'), etc.
    v
WebSocket: fetchRealEventsForInitialState()
    |
    | Queries event_bus_events AGAIN (1000 rows, desc)
    | Returns { recentActions, eventBusEvents }
    v
WebSocket INITIAL_STATE message
    |
    | Includes eventBusEvents array + legacy arrays
    v
Client: useEventBusStream.handleInitialState()
    |
    | Prefers eventBusEvents (raw, with correct topic)
    | Falls back to legacy arrays if eventBusEvents empty
    v
Dashboard renders with historical data
```

### Key constants

- `SQL_PRELOAD_LIMIT = 2000` -- max events loaded from DB at startup
- Per-topic window: 200 rows (via `ROW_NUMBER() OVER (PARTITION BY topic)`)
- `ENABLE_EVENT_PRELOAD` env var -- set to `false` to skip preload entirely

---

## Known Issues / Not Yet Done

### 1. Live Kafka eachMessage prefix mismatch
**File**: `server/event-consumer.ts` lines 1026-1145
**Issue**: The `eachMessage` handler uses `switch (topic)` where `topic` comes from Kafka with env prefix (e.g., `dev.onex.evt.platform.node-heartbeat.v1`), but `case` values are suffix-only constants (e.g., `onex.evt.platform.node-heartbeat.v1`). This means canonical ONEX topics delivered by Kafka will fall through to the `default` case and be silently ignored. Only legacy flat topics (`agent-actions`, `agent-routing-decisions`, etc.) match correctly because they have no prefix.
**Impact**: Node registry events, OmniClaude lifecycle events, and intent events from Kafka are not processed in real-time. They ARE processed during preload (where prefix is stripped), so dashboards show historical data but not live updates.
**Fix**: Strip env prefix from `topic` before the switch statement, matching the pattern used in `preloadFromDatabase()`.

### 2. tool-content events not handled in live Kafka consumer
**File**: `server/event-consumer.ts` eachMessage handler
**Issue**: Events with topic `onex.cmd.omniintelligence.tool-content.v1` (or `dev.onex.cmd.omniintelligence.tool-content.v1`) have no case in the live `eachMessage` switch statement. They are only handled in `injectPlaybackEvent()` (line 3292) for preload/playback.
**Impact**: Tool content events appear on dashboard from historical preload but not from live Kafka stream.
**Fix**: Add a case for tool-content topic in the eachMessage handler (after fixing issue #1).

### 3. Redundant database query in fetchRealEventsForInitialState
**File**: `server/websocket.ts` lines 170-198
**Issue**: `fetchRealEventsForInitialState()` queries `event_bus_events` separately (1000 rows) even though `EventConsumer.preloadFromDatabase()` already loaded events into memory from the same table. The WebSocket could use EventConsumer's in-memory data instead of querying the DB again.
**Impact**: Redundant DB query on every WebSocket connection. Performance cost is low (single query, indexed) but it's unnecessary work.
**Fix**: Have `EventConsumer` expose a `getPreloadedEvents()` method that returns the raw event bus rows, and use that in the WebSocket INITIAL_STATE instead of re-querying.

### 4. No active Kafka producers running
**Issue**: Heartbeat, session, and tool events have stopped being produced. The Kafka topics have no new messages. This is an upstream infrastructure issue (producers in omninode_bridge / omniclaude are not currently running), not an omnidash bug.
**Impact**: Dashboards rely entirely on preloaded historical data. No live events appear after startup.
**Workaround**: Historical data from `event_bus_events` provides a reasonable baseline. When producers resume, live events will flow automatically (modulo issues #1 and #2 above).

### 5. Validation topic names are a BREAKING CHANGE
**File**: `shared/validation-types.ts` lines 22-35
**Issue**: Validation topic names changed from non-canonical format (`onex.validation.cross_repo.run.started.v1`) to canonical ONEX format (`onex.evt.validation.cross-repo-run-started.v1`, resolved with env prefix via `resolveTopicName()`). No dual-subscription fallback is implemented — this is an atomic cutover.
**Deployment**: The upstream producer (`omnibase_infra` `topic_resolver.py`) MUST be deployed before or simultaneously with this omnidash change. If omnidash subscribes to the new topic names before the producer emits on them, validation events will be silently lost.
**Tracking**: See OMN-1933 for coordinated deployment.

### 6. Consumer group bumped to v2
**File**: `server/event-bus-data-source.ts` line 147
**Issue**: Consumer group was bumped from `omnidash-event-bus-datasource-v1` to `v2` to escape stale partition assignments from zombie consumers. This is a one-time fix.
**Impact**: On first startup with v2, the consumer will re-read from latest offsets (not from beginning). Historical data comes from preload, not from Kafka replay.

---

## How to Verify

### 1. Start without DEMO_MODE (default)
```bash
# Ensure DEMO_MODE is not set or is false
grep DEMO_MODE .env
# Should show: DEMO_MODE=false

PORT=3000 npm run dev
```
Expected: No "DEMO MODE enabled" log line. Registry mock data returns empty. Agent execution/run trackers have no mock data.

### 2. Verify preload works
```bash
PORT=3000 npm run dev
# Watch server logs for:
#   "Preloaded N/M events from event_bus_events — topic1(count), topic2(count), ..."
```
Expected: Preload log shows events loaded from PostgreSQL. Dashboard shows historical events immediately.

### 3. Verify Event Bus Monitor hydration
1. Open http://localhost:3000/event-bus
2. Events table should populate with historical data
3. Topic breakdown chart should show topics with correct labels
4. Event type breakdown should show meaningful types (not "dev" or "Unknown Type")

### 4. Run tests
```bash
npm run test
npm run check  # TypeScript type checking
```

### 5. Verify DEMO_MODE works when enabled
```bash
DEMO_MODE=true PORT=3000 npm run dev
# Watch for: "DEMO MODE enabled — starting mock data generators"
```
Expected: Mock event chains generated, mock registry heartbeats flowing.
