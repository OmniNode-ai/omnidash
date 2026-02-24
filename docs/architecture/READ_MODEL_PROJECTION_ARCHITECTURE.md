# Read-Model Projection Architecture

## What Is Read-Model Projection?

In event-sourced systems, a _read model_ (also called a projection or query model) is a materialized view of event data optimized for reading. Rather than reconstructing state by replaying all events on every query, projections listen to Kafka topics and continuously write pre-computed rows into a relational database.

In omnidash this means:

- OmniNode platform services **publish** events to Kafka topics.
- The `ReadModelConsumer` **subscribes** to those topics and writes rows into `omnidash_analytics`.
- Express API routes **query** those tables with simple SQL and serve results to the React dashboards.

The result is a dashboard that can answer "how many routing decisions happened in the last hour?" with a single indexed SQL query instead of replaying thousands of Kafka messages.

## How `read-model-consumer.ts` Works

The `ReadModelConsumer` class (`server/read-model-consumer.ts`) is the heart of the projection system.

### Lifecycle

```text
server startup
     |
     v
ReadModelConsumer.start()
  - reads KAFKA_BROKERS from env
  - reads OMNIDASH_ANALYTICS_DB_URL from env (via tryGetIntelligenceDb())
  - connects KafkaJS consumer (group: omnidash-read-model-v1)
  - subscribes to all READ_MODEL_TOPICS (fromBeginning: false)
  - starts consumer.run() loop
     |
     | on each Kafka message
     v
ReadModelConsumer.handleMessage(payload)
  - parseMessage(): JSON.parse + envelope unwrapping ({ payload: {...} })
  - deterministicCorrelationId(): SHA-256 hash of topic:partition:offset
  - routes to the correct projection method by topic
  - on success: increments stats, calls updateWatermark()
  - on DB unavailable (false return): skips watermark advancement
                                      (Kafka will redeliver)
```

### Topics Consumed and Tables Written

| Kafka Topic | Projection Method | Table Written |
|---|---|---|
| `agent-routing-decisions` | `projectRoutingDecision()` | `agent_routing_decisions` |
| `agent-actions` | `projectAgentAction()` | `agent_actions` |
| `agent-transformation-events` | `projectTransformationEvent()` | `agent_transformation_events` |
| `onex.evt.omniclaude.pattern-enforcement.v1` | `projectEnforcementEvent()` | `pattern_enforcement_events` |
| `onex.evt.omniclaude.llm-cost-reported.v1` | `projectLlmCostEvent()` | `llm_cost_aggregates` |
| `onex.evt.omnibase-infra.baselines-computed.v1` | `projectBaselinesSnapshot()` | `baselines_snapshots`, `baselines_comparisons`, `baselines_trend`, `baselines_breakdown` |
| `onex.evt.omniclaude.context-enrichment.v1` | `projectEnrichmentEvent()` | `context_enrichment_events` |
| `onex.evt.omniclaude.llm-routing-decision.v1` | `projectLlmRoutingDecisionEvent()` | `llm_routing_decisions` |

Note: `router-performance-metrics` is handled by `event-consumer.ts` (in-memory only, no table).

### Consumer Groups

| Consumer Group ID | File | Purpose |
|---|---|---|
| `omnidash-read-model-v1` | `read-model-consumer.ts` | Durable projection → PostgreSQL |
| `omnidash-consumers-v2` | `event-consumer.ts` | In-memory aggregation → WebSocket |

Separate group IDs ensure independent offset tracking. The read-model consumer can lag or be restarted without affecting real-time WebSocket delivery.

## Projection Watermarks

The `projection_watermarks` table tracks consumer progress per topic-partition. It is used for observability (not for consumer offset management — Kafka handles that via its own `__consumer_offsets` topic).

Schema (created via SQL migration):

```sql
INSERT INTO projection_watermarks
  (projection_name, last_offset, events_projected, updated_at)
VALUES
  ('agent-routing-decisions:0', 42, 1, NOW())
ON CONFLICT (projection_name) DO UPDATE SET
  last_offset        = GREATEST(projection_watermarks.last_offset, EXCLUDED.last_offset),
  events_projected   = projection_watermarks.events_projected + 1,
  last_projected_at  = NOW(),
  updated_at         = NOW()
```

`projection_name` is formatted as `"topic:partition"` so each partition is tracked independently.

The watermark is updated **only after a successful projection** (i.e., the DB write returned `true`). If the DB is unavailable, the watermark is not advanced so Kafka can redeliver the message later.

## Idempotency and Deduplication

Every projection method is designed to be safe when the same Kafka message is delivered twice (Kafka's at-least-once delivery guarantee).

**Strategy 1: ON CONFLICT DO NOTHING on `correlation_id`** (primary approach)

Used by `agent_routing_decisions`, `agent_actions`, `pattern_enforcement_events`, `context_enrichment_events`, `llm_routing_decisions`.

```typescript
await db
  .insert(agentRoutingDecisions)
  .values(row)
  .onConflictDoNothing({ target: agentRoutingDecisions.correlationId });
```

**Strategy 2: Deterministic fallback ID** (when `correlation_id` is absent)

When no `correlation_id` is present in the event, a SHA-256 hash of `topic:partition:offset` is used as the dedup key. Since `(topic, partition, offset)` uniquely identifies a Kafka message, the same message always produces the same fallback ID:

```typescript
function deterministicCorrelationId(topic: string, partition: number, offset: string): string {
  return crypto
    .createHash('sha256')
    .update(`${topic}:${partition}:${offset}`)
    .digest('hex')
    .slice(0, 32)
    .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
}
```

**Strategy 3: Delete-then-insert in a transaction** (baselines snapshots)

Baselines snapshots contain child arrays (comparisons, trend, breakdown). Re-delivery of the same snapshot event deletes the old child rows and re-inserts the new ones inside a single transaction to prevent partial state.

**Strategy 4: Composite key dedup** (`agent_transformation_events`)

Events for this table lack a natural unique ID. Deduplication uses a composite key of `(source_agent, target_agent, created_at)`. Events with the same agent pair and timestamp within the same second are silently deduplicated. This is a best-effort strategy noted in the source as a future improvement point.

## Graceful Degradation on Missing Migrations

Tables for newer event types (enforcement, enrichment, LLM routing, baselines, LLM costs) are created by SQL migrations in `migrations/`. If a migration has not been run yet, the projection method catches PostgreSQL error code `42P01` ("undefined_table"), logs a warning, and returns `true` (advancing the watermark) rather than crashing. This prevents a missing migration from blocking the consumer indefinitely.

```typescript
const pgCode = (err as { code?: string }).code;
if (pgCode === '42P01' || msg.includes('table_name') && msg.includes('does not exist')) {
  console.warn('[ReadModelConsumer] table not yet created -- run migrations');
  return true; // advance watermark
}
throw err; // re-throw unexpected errors
```

## Timestamp Safety

Two timestamp parsing helpers prevent bad data from corrupting ordering queries:

- **`safeParseDate(value)`**: Returns `new Date()` (wall-clock) for missing or malformed timestamps. Used for `created_at` fields where a "recent" fallback is appropriate.
- **`safeParseDateOrMin(value)`**: Returns `new Date(0)` (epoch-zero) for missing or malformed timestamps. Used specifically for `computed_at_utc` in baselines snapshots, where epoch-zero sorts as oldest, preventing a bad event from appearing as the newest snapshot.

## Architectural Invariant: No Direct Upstream DB Access

Omnidash **never** queries the upstream `omninode_bridge` database directly. All intelligence data originates from Kafka events projected into `omnidash_analytics`. This is enforced by a CI arch-guard rule introduced in commit `c78545e`.

The `omnidash_analytics` database is omnidash's own artifact — it is populated, owned, and queried exclusively by omnidash.

## Envelope Pattern

Some upstream producers wrap event payloads in a standard envelope:

```json
{
  "payload": { "correlation_id": "...", "selected_agent": "..." },
  "metadata": { ... }
}
```

The `parseMessage()` method detects this and unwraps it, making the inner payload available as the top-level object while preserving the original envelope under `_envelope` for debugging:

```typescript
if (raw.payload && typeof raw.payload === 'object') {
  return { ...raw.payload, _envelope: raw };
}
return raw;
```

## Stats and Observability

The `ReadModelConsumer` tracks runtime statistics accessible via `getStats()`:

```typescript
interface ReadModelConsumerStats {
  isRunning: boolean;
  eventsProjected: number;
  errorsCount: number;
  lastProjectedAt: Date | null;
  topicStats: Record<string, { projected: number; errors: number }>;
}
```

These stats are surfaced through `server/projection-routes.ts` at `/api/projections/stats` and visible in the health data sources endpoint at `/api/health`.
