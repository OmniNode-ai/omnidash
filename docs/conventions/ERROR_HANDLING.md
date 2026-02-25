# Error Handling Conventions

This document describes the error handling patterns used across the omnidash
server and client. These conventions ensure that a single failing endpoint
never crashes the entire dashboard.

---

## Core Principle: Graceful Degradation Over Hard Failure

Every layer of the stack — route handlers, projection views, data sources, and
React components — is expected to degrade gracefully when data is transiently
unavailable. A 500 response is a last resort. An empty-but-valid response that
causes the client to fall back to mock data is always preferred for transient
errors.

> **Important**: Kafka/Redpanda is **required infrastructure**, not an optional
> component. An empty response caused by a missing `KAFKA_BROKERS` environment
> variable is an error state — the dashboard is not functioning correctly.
> Mock data appearing on a dashboard means Kafka is not connected, which must
> be remediated. "Graceful degradation" here refers to preventing crashes, not
> to operating normally without Kafka.

---

## Server-Side: Route Handler Pattern

Every route handler wraps its logic in `try/catch` and returns a structured
error on failure. The pattern is consistent across all `*-routes.ts` files:

```typescript
router.get('/summary', async (req, res) => {
  try {
    // ... business logic ...
    return res.json(data);
  } catch (error) {
    console.error('[enforcement] Error fetching summary:', error);
    return res.status(500).json({ error: 'Failed to fetch enforcement summary' });
  }
});
```

Key requirements:
- The `console.error` call includes a namespaced prefix (e.g., `[enforcement]`)
  so log tailing can filter by domain.
- The JSON body always has an `error` string field — never a bare string or
  non-JSON body.
- The handler always returns explicitly (`return res.json(...)`) to prevent
  the Express "headers already sent" warning.

---

## Server-Side: DB Unavailability — Return Empty, Not 500

When the database connection is transiently unavailable (e.g., a temporary
connection drop), route handlers return an **empty-but-valid** response instead
of 500. The client then falls back to mock data via the data source layer.

> **Note**: A missing `OMNIDASH_ANALYTICS_DB_URL` or `KAFKA_BROKERS`
> environment variable is a misconfiguration error, not a transient failure.
> Mock data appearing because these variables are absent means the service
> is not properly configured — it is not operating normally.

This pattern is used throughout:

```typescript
// validation-routes.ts
router.get('/runs', async (req, res) => {
  try {
    const db = tryGetIntelligenceDb();
    if (!db) {
      // DB not configured — return empty payload, not 500
      return res.json({ runs: [], total: 0, limit: 50, offset: 0 });
    }
    // ... real query ...
  } catch (error) {
    console.error('Error listing validation runs:', error);
    res.status(500).json({ error: 'Failed to list validation runs' });
  }
});
```

```typescript
// insights-routes.ts
router.get('/summary', async (_req, res) => {
  try {
    const result = await queryInsightsSummary();
    if (result === null) {
      console.log('[Insights] Database not configured - returning empty response (demo mode)');
      return res.json({
        insights: [],
        total: 0,
        new_this_week: 0,
        avg_confidence: 0,
        total_sessions_analyzed: 0,
        by_type: { pattern: 0, convention: 0, architecture: 0, error: 0, tool: 0 },
      });
    }
    res.json(result);
  } catch (error) {
    console.error('[insights] Error getting summary:', error);
    res.status(500).json({ error: 'Failed to get insights summary' });
  }
});
```

The shape of the empty response **must match the TypeScript response type** so
that the client can deserialize it without errors. Never return `null`, `{}`, or
a mismatched shape — return a zero-valued instance of the real type.

---

## Server-Side: Projection Views — Graceful Missing View

Route files that use the projection service check whether the projection view
is registered before calling it. If it is not bootstrapped (e.g., missing
configuration), they return the same empty-but-valid payload:

```typescript
// extraction-routes.ts
function getExtractionView(): ExtractionMetricsProjection | undefined {
  return projectionService.getView<ExtractionMetricsPayload>('extraction-metrics') as
    | ExtractionMetricsProjection
    | undefined;
}

router.get('/summary', async (_req, res) => {
  try {
    const view = getExtractionView();
    if (!view) {
      const empty: ExtractionSummary = {
        total_injections: 0,
        total_patterns_matched: 0,
        avg_utilization_score: null,
        avg_latency_ms: null,
        success_rate: null,
        last_event_at: null,
      };
      return res.json(empty);
    }
    const result = await view.ensureFresh();
    res.json(result.summary);
  } catch (error) {
    console.error('[extraction] Error getting summary:', error);
    res.status(500).json({ error: 'Failed to get extraction summary' });
  }
});
```

The `getCostView()` / `getExtractionView()` / `getEffectivenessView()` helper
functions (one per route file) follow this pattern: they return `undefined`
rather than throwing when the view is not available.

---

## Server-Side: Projection Error Isolation

Each projection runs independently. An error in one projection's Kafka consumer
or DB query is caught at the projection level and does not propagate to other
projections. The cost-metrics projection illustrates this:

- Query errors inside `ensureFresh()` are caught and reported via
  `X-Degraded: true` response headers rather than an HTTP error status.
- The response body still has the correct shape (empty arrays/zeros), so
  downstream clients always receive a parseable payload.

```typescript
// cost-routes.ts — degradation communicated via headers, not error status
const payload = await getPayloadForWindow(view, timeWindow);
if (payload.degraded) {
  res.setHeader('X-Degraded', 'true');
  if (payload.window !== undefined) res.setHeader('X-Degraded-Window', payload.window);
}
return res.json({ ...payload.summary });
```

---

## Server-Side: Input Validation — 400 Before Business Logic

Route handlers validate query parameters before executing any business logic
and return 400 for invalid inputs. This prevents DB queries with garbage
arguments:

```typescript
// enforcement-routes.ts
router.get('/summary', (req, res) => {
  try {
    const window = (req.query.window as string) || '7d';
    const validWindows = ['24h', '7d', '30d'];
    if (!validWindows.includes(window)) {
      return res
        .status(400)
        .json({ error: 'Invalid window parameter. Must be one of: 24h, 7d, 30d' });
    }
    // ... proceed with validated input ...
  } catch (error) {
    console.error('[enforcement] Error fetching summary:', error);
    return res.status(500).json({ error: 'Failed to fetch enforcement summary' });
  }
});
```

For complex query schemas, use Zod (as in `patterns-routes.ts`):

```typescript
// patterns-routes.ts
const PatternsQuerySchema = z.object({
  status: z.enum(VALID_STATUSES).optional(),
  min_confidence: z.string().optional().transform(parseFloat).refine(...),
  limit: z.string().optional().transform(parseInt).transform(clamp),
});

const queryResult = PatternsQuerySchema.safeParse(req.query);
if (!queryResult.success) {
  return res.status(400).json({
    error: 'Invalid query parameters',
    details: queryResult.error.format(),
  });
}
```

---

## Server-Side: Event Handler Errors (Kafka Consumer)

Kafka event handlers (e.g., `handleValidationRunStarted` in
`validation-routes.ts`) catch errors at the event level and log them without
re-throwing. This ensures that a bad event payload does not crash the consumer
or prevent other events from being processed:

```typescript
// validation-routes.ts
export async function handleValidationRunStarted(event: ValidationRunStartedEvent): Promise<void> {
  const db = tryGetIntelligenceDb();
  if (!db) {
    console.warn('[validation] Database not available, dropping run.started event');
    return;  // silently drop — do not throw
  }
  try {
    await db.insert(validationRuns).values({ ... });
  } catch (error) {
    console.error(`[validation] Error persisting run.started for ${event.run_id}:`, error);
    // error is logged and swallowed — consumer stays alive
  }
}
```

The tradeoff is accepted data loss for reliability. Events that fail to persist
are logged but do not block the consumer.

---

## Client-Side: Data Source — `fallbackToMock` Default

All data source methods default to `fallbackToMock: true`. Any unhandled fetch
error (network failure, 4xx, 5xx) results in mock data being returned
transparently. The component is unaware of the failure; it simply receives data.

```typescript
// enrichment-source.ts
try {
  const response = await fetch(`${this.baseUrl}/summary${this.buildWindowParam(window)}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data: EnrichmentSummary = await response.json();
  this.markReal('summary');
  return data;
} catch (err) {
  console.warn('[EnrichmentSource] fetch failed for summary:', err);
  if (fallbackToMock) {
    this.markMock('summary');
    return getMockEnrichmentSummary(window);  // transparent fallback
  }
  throw new Error('Failed to fetch enrichment summary');  // only when fallbackToMock: false
}
```

When `fallbackToMock: false`, the error is re-thrown as a plain `Error` with a
human-readable message. TanStack Query surfaces this to the component's `error`
state.

---

## Client-Side: TanStack Query — Retry and Error State

Data sources are consumed via TanStack Query (`useQuery`). Standard retry
configuration:

- **Default retry**: 3 attempts with exponential backoff (TanStack Query
  default). Since most methods already fall back to mock data internally, the
  3-retry behavior primarily applies to methods called with `fallbackToMock: false`.
- **Error state**: Components should render an empty/degraded UI rather than an
  error boundary when a query fails. Reserve error boundaries for truly
  unrecoverable failures.
- **staleTime**: Set appropriately per dashboard. Real-time dashboards use
  short stale times (10–30s); slowly-changing summaries can use longer (60s+).

---

## What NOT to Do

### Never let a single data source failure crash the dashboard

```typescript
// BAD: a throw here propagates up and unmounts the component
const data = await fooSource.summary('7d', { fallbackToMock: false });

// GOOD: fallbackToMock is true by default; errors return mock data
const data = await fooSource.summary('7d');
```

### Never return a mismatched shape from a degraded endpoint

```typescript
// BAD: {} is not a valid EnrichmentSummary
if (!db) return res.json({});

// GOOD: return the zero-valued shape matching the TypeScript type
if (!db) return res.json({
  total_enrichments: 0,
  hit_rate: 0,
  net_tokens_saved: 0,
  // ... all fields explicitly zeroed
});
```

### Never swallow errors silently in route handlers

```typescript
// BAD: error is hidden, no logging
try {
  // ...
} catch {}

// GOOD: always log with namespace prefix
try {
  // ...
} catch (error) {
  console.error('[enrichment] Error fetching summary:', error);
  return res.status(500).json({ error: 'Failed to fetch enrichment summary' });
}
```

### Never query the upstream database directly from omnidash route files

Per the architectural invariant in `CLAUDE.md`: omnidash never queries
`omninode_bridge` directly. All intelligence data flows through Kafka into
`omnidash_analytics`. Route files access only the local read-model database
(via `tryGetIntelligenceDb()` or projection service views).

### Never import DB accessors directly in new route files (OMN-2325)

Stub route files (enforcement, enrichment, llm-routing) have this constraint
documented in their headers:

> NOTE: Per OMN-2325 architectural rule, route files must not import DB
> accessors directly. Use projectionService views for data access once
> the projection is wired.

Use `projectionService.getView(...)` for DB access in route handlers, not
direct Drizzle ORM imports.
