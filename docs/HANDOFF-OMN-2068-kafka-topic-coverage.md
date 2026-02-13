# Handoff: OMN-2068 Kafka Topic Coverage & Event Pipeline Fixes

**Date**: 2026-02-12
**Ticket**: OMN-2068 -- DB-SPLIT-03: FK scan -- verify all REFERENCES are intra-service
**Repository**: omnidash2
**Branch**: main (changes uncommitted)

---

## Summary

This session closed a coverage gap between the 18 Kafka topics used by the
ONEX node registration pipeline and the topics omnidash2 actually subscribes
to, handles, and displays. Along the way we fixed two operational issues: a
silent 400-error storm caused by a client/server query-limit mismatch, and a
dead emit daemon that had been silently dropping events for four days.

---

## 1. Registration Workflow Topic Gap Analysis

The ONEX node registration pipeline uses 18 Kafka topics (5 subscribed,
8 published, 5 supporting infrastructure). We audited three files:

- `shared/topics.ts` (topic constant definitions)
- `server/event-consumer.ts` (Kafka consumer routing)
- `client/src/lib/configs/event-bus-dashboard.ts` (dashboard UI config)

**Result**: 11 of 18 topics were already covered. 7 gaps identified:

| Gap | Topic | Issue |
|-----|-------|-------|
| 1 | `onex.cmd.platform.node-registration-acked.v1` | Not defined |
| 2 | `onex.evt.platform.node-registration-result.v1` | Not defined |
| 3 | `onex.evt.platform.node-registration-ack-received.v1` | Not defined |
| 4 | `onex.evt.platform.node-registration-ack-timed-out.v1` | Not defined |
| 5 | `onex.evt.platform.registry-request-introspection.v1` | Not defined (distinct from existing cmd variant) |
| 6 | `onex.evt.platform.fsm-state-transitions.v1` | Defined but not subscribed |
| 7 | `onex.evt.platform.runtime-tick.v1` | Defined but not subscribed |

**Clarification on introspection topics**: Both are valid and serve different
purposes. The existing `onex.cmd.platform.request-introspection.v1` tells
nodes to introspect themselves. The new
`onex.evt.platform.registry-request-introspection.v1` is an event the
registry emits to announce it wants re-introspection.

---

## 2. Changes Made

### 2.1 `shared/topics.ts` -- New Constants and Subscription Expansion

Added 5 new topic suffix constants:

```typescript
SUFFIX_NODE_REGISTRATION_ACKED        // onex.cmd.platform.node-registration-acked.v1
SUFFIX_NODE_REGISTRATION_RESULT       // onex.evt.platform.node-registration-result.v1
SUFFIX_NODE_REGISTRATION_ACK_RECEIVED // onex.evt.platform.node-registration-ack-received.v1
SUFFIX_NODE_REGISTRATION_ACK_TIMED_OUT// onex.evt.platform.node-registration-ack-timed-out.v1
SUFFIX_REGISTRY_REQUEST_INTROSPECTION // onex.evt.platform.registry-request-introspection.v1
```

Expanded `PLATFORM_NODE_SUFFIXES` array from 12 to 19 entries by adding all
5 new constants plus the 2 previously-defined-but-unsubscribed suffixes
(`SUFFIX_FSM_STATE_TRANSITIONS`, `SUFFIX_RUNTIME_TICK`). This array feeds
directly into `buildSubscriptionTopics()`, which the Kafka consumer calls at
startup.

### 2.2 `server/event-consumer.ts` -- Consumer Routing

- Added imports for all 7 new topic constants
- Added entries to the `TOPIC` lookup object
- Added switch-case blocks routing new topics through
  `handleCanonicalNodeIntrospection` (same handler pattern used by existing
  registration lifecycle events)

### 2.3 `client/src/lib/configs/event-bus-dashboard.ts` -- Dashboard Config

- Added imports for all new topic constants
- Expanded `NODE_TOPICS` array from 10 to 17 entries
- Added `TOPIC_METADATA` entries with human-readable labels and descriptions
  for all 7 new topics:
  - Registration ACKed
  - Registration Result
  - ACK Received
  - ACK Timed Out
  - Registry Re-Introspect
  - FSM Transitions
  - Runtime Tick

### 2.4 `server/projection-routes.ts` -- Snapshot Query Limit Fix

**Root cause**: The client's `max_events` config allowed values up to 5000
(with a default of 2000), but the server's `SnapshotQuerySchema` enforced
`.max(500)`. Every 2-second poll sent `?limit=2000`, Zod rejected it with a
400, TanStack Query silently retried, and the server logged only a truncated
response body -- making the error storm invisible.

**Fix**:
- Raised `SnapshotQuerySchema.limit.max()` from 500 to 5000 to match the
  client's `max_events_options`
- Added `console.error()` calls with full Zod validation details and
  `req.query` dump to both the snapshot and events 400-response paths, so
  validation failures are never silently swallowed again

---

## 3. Emit Daemon Diagnosis and Runtime Fix

**Root cause chain**:

1. The `omniclaude.publisher` emit daemon died on Feb 9 but left its Unix
   socket file (`omniclaude-emit.sock`) and PID file behind
2. `check_socket_responsive()` in `session-start.sh` only tests
   `[[ -S "$socket" && -w "$socket" ]]` -- file existence, not an actual
   connection
3. Every new Claude Code session reported "Publisher already running and
   responsive" -- a false positive
4. Every `emit_via_daemon()` call silently failed with "Emit daemon failed
   (non-fatal)"
5. All tool-executed, prompt-submitted, and session-started events were lost
   for 4 days

**Runtime fix applied** (not a code change in this repo):

```bash
# Killed stale publisher processes
# Removed stale socket: /var/folders/.../omniclaude-emit.sock
# Removed stale PID:    /var/folders/.../omniclaude-emit.pid
# Restarted daemon:
python -m omniclaude.publisher start \
  --kafka-servers 192.168.86.200:29092 \
  --socket-path $SOCKET
# Verified: 82 events ingested, 6 active topics within seconds
```

**Underlying bug** (not fixed -- belongs in the omniclaude repo):

`check_socket_responsive()` in
`~/.claude/plugins/cache/omninode-tools/onex/2.2.3/hooks/scripts/session-start.sh`
should perform a real protocol ping (connect, send `{"type":"ping"}`, verify
response) instead of a filesystem-only check. A follow-up ticket should be
filed in the omniclaude repository.

---

## 4. Files Modified

| File | What Changed |
|------|-------------|
| `shared/topics.ts` | +5 new constants, `PLATFORM_NODE_SUFFIXES` expanded 12 to 19, updated comment |
| `server/event-consumer.ts` | +7 imports, +10 TOPIC entries, +4 switch-case blocks |
| `client/src/lib/configs/event-bus-dashboard.ts` | +7 imports, `NODE_TOPICS` expanded 10 to 17, +8 TOPIC_METADATA entries |
| `server/projection-routes.ts` | Limit max raised 500 to 5000, error logging added to both validation paths |

---

## 5. Verification

| Check | Result |
|-------|--------|
| TypeScript type check (`npm run check`) | Passed |
| Vitest test suite | 2488 passed, 0 failed |
| Dashboard serving on port 3000 | Live events flowing |

---

## 6. Known Issues and Follow-ups

### Must Do

1. **Commit and PR** -- All code changes are uncommitted on the main branch.
   They need to be committed and pushed as a PR.

### Should Do

2. **Emit daemon socket check** -- File a ticket in the omniclaude repo for
   `check_socket_responsive()` to perform a real protocol-level ping instead
   of relying on `[[ -S ... ]]`. Without this fix, any future daemon crash
   will silently drop events until someone manually notices.

### Nice to Have

3. **Consumer group offset lag** -- After a restart, the consumer starts from
   committed offsets. Events produced while the consumer was down during the
   same session are already consumed. No data loss occurs for new events
   after restart, but there is a brief gap in historical continuity.

---

## 7. Architecture Context

The topic subscription flow in omnidash2 works as follows:

```
shared/topics.ts
  PLATFORM_NODE_SUFFIXES[]        -- canonical list of topic suffixes
        |
        v
  buildSubscriptionTopics()       -- prepends environment prefix
        |
        v
server/event-consumer.ts
  EventConsumer.start()           -- subscribes Kafka consumer to built topics
  TOPIC lookup + switch/case      -- routes each message to a handler
        |
        v
server/websocket.ts
  broadcast to subscribed clients -- real-time push to dashboards
        |
        v
client/src/lib/configs/event-bus-dashboard.ts
  NODE_TOPICS[]                   -- controls which topics appear in the UI
  TOPIC_METADATA{}                -- labels and descriptions for each topic
```

Adding a new topic requires touching all three layers. The constants in
`shared/topics.ts` are the single source of truth.
