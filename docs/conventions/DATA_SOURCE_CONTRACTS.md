# Data Source Contracts

This document describes the **API-first + mock-fallback** pattern used by every
dashboard data source in omnidash. Follow this pattern exactly when adding new
data sources or modifying existing ones.

---

## What Is a Data Source?

A **data source** is a TypeScript class file under
`client/src/lib/data-sources/` that encapsulates all data-fetching logic for
one dashboard. Components and hooks import a singleton instance and call its
methods; they never call `fetch()` directly.

```
client/src/lib/data-sources/
├── api-base.ts                    # shared buildApiUrl() helper
├── index.ts                       # re-exports all singletons
├── enrichment-source.ts           # EnrichmentSource class + enrichmentSource singleton
├── enforcement-source.ts          # EnforcementSource class + enforcementSource singleton
├── llm-routing-source.ts          # LlmRoutingSource class + llmRoutingSource singleton
├── cost-source.ts
├── baselines-source.ts
├── effectiveness-source.ts
├── extraction-source.ts
├── pattern-learning-source.ts
├── validation-source.ts
├── insights-source.ts
├── node-registry-projection-source.ts
├── event-bus-projection-source.ts  # functional style (no class)
└── __tests__/
```

---

## Standard Class Structure

Every class-based data source follows this template:

```typescript
class FooSource {
  private baseUrl = buildApiUrl('/api/foo');

  // Tracks which endpoints fell back to mock data
  private _mockEndpoints = new Set<string>();

  // True when any PRIMARY endpoint is using mock data
  get isUsingMockData(): boolean {
    return (
      this._mockEndpoints.has('summary') ||
      this._mockEndpoints.has('by-channel') ||
      this._mockEndpoints.has('token-savings')
    );
  }

  // Call this before a time-window switch to avoid stale mock state
  clearMockState(): void {
    this._mockEndpoints.clear();
  }

  private markReal(endpoint: string): void {
    this._mockEndpoints.delete(endpoint);
  }

  private markMock(endpoint: string): void {
    this._mockEndpoints.add(endpoint);
  }

  async summary(window = '7d', options: FooFetchOptions = {}): Promise<FooSummary> {
    const { fallbackToMock = true, mockOnEmpty = false, demoMode = false } = options;

    if (demoMode) {
      this.markMock('summary');
      return getMockFooSummary(window);
    }

    try {
      const response = await fetch(`${this.baseUrl}/summary?window=${encodeURIComponent(window)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: FooSummary = await response.json();

      if (mockOnEmpty && data.total_foo === 0) {
        this.markMock('summary');
        return getMockFooSummary(window);
      }

      this.markReal('summary');
      return data;
    } catch (err) {
      console.warn('[FooSource] fetch failed for summary:', err);
      if (fallbackToMock) {
        this.markMock('summary');
        return getMockFooSummary(window);
      }
      throw new Error('Failed to fetch foo summary');
    }
  }
}

export const fooSource = new FooSource();
```

---

## The FetchOptions Interface

Every data source exposes a `FooFetchOptions` interface with these three
standard fields:

| Field           | Type      | Default | Purpose                                               |
|-----------------|-----------|---------|-------------------------------------------------------|
| `fallbackToMock`| `boolean` | `true`  | Return mock data on any network or HTTP error         |
| `mockOnEmpty`   | `boolean` | `false` | Return mock data when API succeeds but returns empty  |
| `demoMode`      | `boolean` | `false` | Skip the API call entirely and return demo data       |

```typescript
export interface EnrichmentFetchOptions {
  /** Fall back to mock data on network/HTTP errors (default: true). */
  fallbackToMock?: boolean;
  /** Also fall back to mock when the API returns empty results (default: false). */
  mockOnEmpty?: boolean;
  /**
   * When true, skip the API call entirely and return canned demo data.
   * Used when global demo mode is active (OMN-2298).
   */
  demoMode?: boolean;
}
```

---

## `mockOnEmpty` vs `fallbackToMock`: The Critical Distinction

These two flags control separate failure modes and must be applied correctly:

### `fallbackToMock: true` (default, always on)

Catches **network and HTTP errors** — the API is unreachable, returns a 4xx/5xx
status, or throws. This is always enabled by default so that one broken
endpoint never crashes the dashboard.

### `mockOnEmpty: false` (default, off)

Controls whether an **API success with empty data** triggers mock fallback.

- **Primary endpoints** — the ones that feed the headline KPI cards — use
  `mockOnEmpty: true`. If the database is live but has no rows yet, these show
  representative demo data rather than a blank dashboard.
- **Secondary/derived endpoints** — latency distributions, similarity scores,
  alert lists — use `mockOnEmpty: false` (the default). These may legitimately
  be empty in a live environment (e.g., no inflation events recorded yet). Using
  `mockOnEmpty: true` here would produce false-positive demo-mode banners.

Example from `enrichment-source.ts`:

```typescript
// Primary: summary, by-channel, token-savings use mockOnEmpty when requested
async summary(window = '7d', options: EnrichmentFetchOptions = {}): Promise<EnrichmentSummary> {
  const { fallbackToMock = true, mockOnEmpty = false, demoMode = false } = options;
  // ...
  if (mockOnEmpty && data.total_enrichments === 0) {
    this.markMock('summary');
    return getMockEnrichmentSummary(window);
  }
  // ...
}

// Secondary: latency-distribution uses mockOnEmpty but only when explicitly passed
async latencyDistribution(window = '7d', options: EnrichmentFetchOptions = {}): Promise<...> {
  const { fallbackToMock = true, mockOnEmpty = false, demoMode = false } = options;
  // mockOnEmpty defaults false — an empty distribution is valid live data
  // ...
}
```

---

## `isUsingMockData` and the Demo-Mode Banner

Each data source exposes a computed property `isUsingMockData`. Components use
this to show a "Demo data" banner in the UI.

Only **primary endpoints** contribute to `isUsingMockData`. The rule is: if all
three golden-metric endpoints return real data, the dashboard is live even if
secondary endpoints are empty.

```typescript
// enrichment-source.ts
get isUsingMockData(): boolean {
  return (
    this._mockEndpoints.has('summary') ||
    this._mockEndpoints.has('by-channel') ||
    this._mockEndpoints.has('token-savings')
  );
}
```

The comment in the source explains the rationale:

> Secondary metrics (latency-distribution, similarity-quality, inflation-alerts)
> may legitimately return empty results even when the database is live, so
> including them would produce false-positive demo-mode banners.

---

## `clearMockState()`: Time-Window Switches

The `_mockEndpoints` Set accumulates state across renders. When the user
switches time windows (e.g., 7d → 30d), stale mock-endpoint flags from the
previous fetch may carry over.

**Always call `clearMockState()` before initiating a window switch:**

```typescript
// In a React component or hook:
const handleWindowChange = (newWindow: string) => {
  enrichmentSource.clearMockState();   // reset before new fetches start
  setWindow(newWindow);
};
```

Known limitation (documented in source): there is a race condition on parallel
refetches during concurrent window-change fetches — `markReal`/`markMock` calls
may interleave. Acceptable for current scaffold; will be resolved when
query-data-shape detection replaces the flag approach.

---

## Singleton Export

Every data source exports a module-level singleton:

```typescript
/** Singleton data source instance shared across components. */
export const enrichmentSource = new EnrichmentSource();
```

Components import the singleton, not the class:

```typescript
import { enrichmentSource } from '@/lib/data-sources/enrichment-source';
```

---

## `buildApiUrl()`: The Base URL Helper

All data sources use `buildApiUrl()` from `api-base.ts` to construct their
base URL:

```typescript
// api-base.ts
export function buildApiUrl(resourcePath: string): string {
  const base = import.meta.env?.VITE_API_BASE_URL ?? '';
  return `${base.replace(/\/+$/, '')}${resourcePath}`;
}

// usage in a data source
private baseUrl = buildApiUrl('/api/enrichment');
```

`VITE_API_BASE_URL` defaults to `''` (same-origin), which is correct for both
the Vite dev proxy and production same-origin deploys. Cross-origin or
non-root deploys set this env var in `.env`.

---

## Functional-Style Data Sources (Projection Sources)

Some data sources do not follow the class pattern. The event-bus and
node-registry sources expose standalone async functions instead of a class
singleton. These are used with `useProjectionStream` hooks for server-sent
snapshots rather than interval polling.

```typescript
// event-bus-projection-source.ts (functional style)
export async function fetchEventBusSnapshot(params?: {
  limit?: number;
}): Promise<ProjectionResponse<EventBusPayload>> {
  const url = `/api/projections/event-bus/snapshot${...}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch event-bus projection: ${response.status}`);
  }
  return (await response.json()) as ProjectionResponse<EventBusPayload>;
}
```

These functional sources do **not** include mock fallback logic — the hooks
that consume them (`useProjectionStream`) handle empty-state display.

---

## How to Add a New Data Source

1. **Create the shared types file** in `shared/` (e.g.,
   `shared/my-feature-types.ts`) with your response interfaces.

2. **Create the mock data file** in `client/src/lib/mock-data/` (e.g.,
   `my-feature-mock.ts`) with `getMockMyFeatureSummary(window)` etc.

3. **Create the data source file** at
   `client/src/lib/data-sources/my-feature-source.ts`:
   - Define `MyFeatureFetchOptions` interface
   - Create a `MyFeatureSource` class following the template above
   - Identify which 2–3 endpoints are "primary" for `isUsingMockData`
   - Export a singleton `myFeatureSource`

4. **Re-export from the index** in `client/src/lib/data-sources/index.ts`.

5. **Create the server route file** in `server/my-feature-routes.ts` following
   the patterns in `server/enforcement-routes.ts` (stub) or
   `server/baselines-routes.ts` (fully wired).

6. **Mount the route** in `server/routes.ts`:
   ```typescript
   import myFeatureRoutes from './my-feature-routes';
   app.use('/api/my-feature', myFeatureRoutes);
   ```

7. **Write tests** in
   `client/src/lib/data-sources/__tests__/my-feature-source.test.ts`.

---

## Naming Conventions

| Artifact                   | Convention                                  | Example                     |
|----------------------------|---------------------------------------------|-----------------------------|
| Data source file           | `<feature>-source.ts`                       | `enforcement-source.ts`     |
| Data source class          | `<Feature>Source`                           | `EnforcementSource`         |
| Options interface          | `<Feature>FetchOptions`                     | `EnforcementFetchOptions`   |
| Singleton export           | `<feature>Source`                           | `enforcementSource`         |
| Mock data file             | `<feature>-mock.ts`                         | `enforcement-mock.ts`       |
| Mock function              | `getMock<Feature><Shape>(window)`           | `getMockEnforcementSummary` |
| Server route file          | `<feature>-routes.ts`                       | `enforcement-routes.ts`     |
| API mount prefix           | `/api/<feature>`                            | `/api/enforcement`          |
