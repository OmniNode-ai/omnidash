# Topic Catalog Architecture

## What Is the Topic Catalog?

The topic catalog is a platform-level service that maintains an authoritative registry of all active Kafka topics in the OmniNode event bus. Rather than hardcoding topic lists in each consumer, omnidash dynamically discovers the current set of topics at startup by querying the catalog service and then receives incremental updates as topics are added or removed.

The `TopicCatalogManager` (`server/topic-catalog-manager.ts`, OMN-2315, OMN-2316) encapsulates this protocol on the omnidash side.

## Why Dynamic Topic Discovery?

The OmniNode platform has many Kafka topics and environments can vary (e.g., topics may carry environment prefixes like `dev.onex.evt.*`). Hardcoding topic lists requires a code change every time a topic is added, renamed, or removed. Dynamic discovery lets omnidash's `EventConsumer` subscribe to the correct set of topics for its deployment environment without manual configuration.

## Bootstrap Protocol

When the server starts, the `TopicCatalogManager` executes a four-step bootstrap:

```
1. Connect dedicated Kafka producer (for publishing the query)
2. Connect dedicated Kafka consumer (for receiving the response)
   - Consumer group: omnidash.catalog.<instanceUuid>
   - Subscribes to: catalog-response and catalog-changed topics
3. Publish a ModelTopicCatalogQuery to the catalog command topic
   - Payload: { client_id, correlation_id }
4. Arm a timeout (CATALOG_TIMEOUT_MS, default 5000ms)
   - If no response arrives → emit 'catalogTimeout'
   - Caller falls back to a hardcoded topic list
```

On receiving a valid catalog response that matches the outstanding `correlation_id`:

```
5. Cancel the timeout
6. Extract topic names from the response
7. Emit 'catalogReceived' with the full topic list
   - EventConsumer subscribes to these topics dynamically
8. Start periodic requery interval (CATALOG_REQUERY_INTERVAL_MS, default 5 minutes)
```

### Kafka Topics Used by the Protocol

| Topic Suffix Constant | Role |
|---|---|
| `SUFFIX_PLATFORM_TOPIC_CATALOG_QUERY` | Omnidash → Catalog service (outbound query) |
| `SUFFIX_PLATFORM_TOPIC_CATALOG_RESPONSE` | Catalog service → Omnidash (full snapshot response) |
| `SUFFIX_PLATFORM_TOPIC_CATALOG_CHANGED` | Catalog service → Omnidash (incremental delta) |

All topic names are looked up via `extractSuffix()` from `@shared/topics`, which strips optional environment prefixes (`dev.`, `staging.`, etc.) so the same code handles all environments.

## Cross-Talk Prevention

Multiple omnidash instances (or multiple page reloads that restart the server) could otherwise process each other's catalog responses from the shared response topic. Two mechanisms prevent this:

**1. Per-process instance UUID**

Each `TopicCatalogManager` instance generates a UUID at construction time. This UUID:
- Forms the unique consumer group ID: `omnidash.catalog.<instanceUuid>`
- Is included as `client_id` in the outgoing query payload

Because each instance has its own consumer group, Kafka delivers each response message to exactly one consumer group. Page reloads do not restart the server process, so the consumer group does not accumulate.

**2. Correlation ID filtering**

Each bootstrap call generates a fresh `correlation_id`. Incoming catalog-response messages are discarded unless their `correlation_id` matches the outstanding query:

```typescript
if (response.correlation_id !== this.outstandingCorrelationId) {
  console.log('[TopicCatalogManager] Ignoring catalog-response with unmatched correlation_id');
  return;
}
```

## Version Gap Detection

The `catalog-changed` topic delivers incremental deltas (topics added/removed) as the catalog evolves. Each delta carries an optional `catalog_version` integer that monotonically increases with each change.

The manager tracks `lastSeenVersion` and checks for gaps on every delta:

```
Received version = N

Case 1: version is absent or -1 (unknown sentinel)
  → triggerRequery('version_unknown')
  → still apply the delta optimistically

Case 2: N > lastSeenVersion + 1 (gap detected)
  → advance lastSeenVersion to N FIRST (storm prevention)
  → triggerRequery('gap')
  → still apply the delta optimistically

Case 3: N == lastSeenVersion + 1 (contiguous)
  → advance lastSeenVersion to N
  → emit 'catalogChanged' normally
```

**Storm prevention invariant**: `lastSeenVersion` is always advanced to the received version _before_ `triggerRequery()` is called. Without this, every subsequent message whose version exceeds the stale `lastSeenVersion + 1` would trigger another requery, causing a requery storm.

## Periodic Requery

After the initial bootstrap, the manager sets up a periodic interval (`CATALOG_REQUERY_INTERVAL_MS`, default 5 minutes) that triggers a full re-query regardless of version tracking. This acts as a self-healing mechanism to recover from any missed events or drift.

Each periodic requery:
1. Generates a fresh `correlation_id`
2. Publishes a new `ModelTopicCatalogQuery`
3. Emits `'catalogRequery'` with `reason: 'periodic'`

## Dynamic Topic Subscription

When `EventConsumer` receives the `'catalogReceived'` event from `TopicCatalogManager`, it subscribes the main Kafka consumer to the full returned topic list. When `'catalogChanged'` is received, it adds any `topicsAdded` and (if the consumer supports it) removes `topicsRemoved`.

This means that after server startup, the set of topics the event stream monitors can evolve without a restart.

## Timeout and Fallback

If no catalog response arrives within `CATALOG_TIMEOUT_MS` (default 5000ms, 200ms in tests):

```typescript
this.timeoutHandle = setTimeout(() => {
  if (!this.catalogReceived && !this.stopped) {
    console.warn('[TopicCatalogManager] No catalog response received — using fallback topics');
    this.emit('catalogTimeout');
  }
}, CATALOG_TIMEOUT_MS);
```

`EventConsumer` handles `'catalogTimeout'` by subscribing to a hardcoded list of known topics, ensuring the dashboard continues to function even if the catalog service is unavailable.

## Event API

`TopicCatalogManager` extends `EventEmitter`. Callers listen to these events:

```typescript
manager.on('catalogReceived', ({ topics, warnings, correlationId }) => {
  // topics: string[] — full list of active topic names
  // warnings: string[] — any advisory messages from the catalog service
});

manager.on('catalogChanged', ({ topicsAdded, topicsRemoved }) => {
  // incremental delta — add/remove subscriptions accordingly
});

manager.on('catalogTimeout', () => {
  // no response received — fall back to hardcoded topic list
});

manager.on('catalogRequery', ({ reason, lastSeenVersion }) => {
  // reason: 'gap' | 'version_unknown' | 'periodic'
  // informational — no action required from caller
});
```

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `KAFKA_BROKERS` | (required) | Comma-separated Kafka broker addresses |
| `CATALOG_TIMEOUT_MS` | 5000 (prod), 200 (test) | Max wait for catalog response |
| `CATALOG_REQUERY_INTERVAL_MS` | 300000 (prod), 500 (test) | Periodic full re-query interval |

Both timeouts have test-friendly defaults that activate when `VITEST=true` or `NODE_ENV=test`.

## API Exposure

The `TopicCatalogManager` state is exposed via `server/topic-catalog-routes.ts` at `/api/catalog/*`. This powers the topic catalog status section visible in the System Health dashboard.
