# Demo Recordings

This directory contains recorded Kafka events for demo playback.

## File Format

Recordings use **JSONL** (JSON Lines) format - one JSON object per line.

### Event Schema

Each line is a `RecordedEvent` with these fields:

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | string (ISO 8601) | Absolute timestamp when event was recorded |
| `relativeMs` | number | Milliseconds from recording start |
| `topic` | string | Kafka topic name |
| `partition` | number | Kafka partition |
| `offset` | string | Kafka offset |
| `key` | string \| null | Message key |
| `value` | object | Event payload (varies by topic) |

### Example

```json
{"timestamp":"2026-02-01T21:00:00.000Z","relativeMs":0,"topic":"agent-routing-decisions","partition":0,"offset":"1","key":null,"value":{"selected_agent":"code-explorer","confidence":0.92}}
{"timestamp":"2026-02-01T21:00:01.500Z","relativeMs":1500,"topic":"agent-actions","partition":0,"offset":"2","key":null,"value":{"action_type":"tool_call","agent_name":"code-explorer"}}
```

## Creating Recordings

Use the recording script to capture live events:

```bash
# Record for 60 seconds (default)
npm run record-events

# Record for 5 minutes
npm run record-events:5min

# Custom duration
npx tsx scripts/record-events.ts --duration 120
```

## Supported Topics

The recorder captures events from these topics:
- `agent-routing-decisions` - Agent selection with confidence scores
- `agent-actions` - Tool calls and agent decisions
- `agent-transformation-events` - Polymorphic agent transitions
- `router-performance-metrics` - Routing latency and cache metrics
- `agent-manifest-injections` - Pattern discovery events
- `dev.onex.evt.omniclaude.*` - Claude session lifecycle events
- `dev.onex.evt.omniintelligence.*` - Intent classification events

## Playback

Recordings are played back through the Demo Control Panel in the dashboard header, or via API:

```bash
# Start playback
curl -X POST http://localhost:3000/api/demo/start \
  -H "Content-Type: application/json" \
  -d '{"file": "sample-demo.jsonl", "speed": 2}'

# Check status
curl http://localhost:3000/api/demo/status
```

See `/server/playback-routes.ts` for full API documentation.
