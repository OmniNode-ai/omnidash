# Demo Mode Architecture

## What Is Demo Mode?

Demo mode is a global client-side toggle that replaces all live API calls and WebSocket connections with pre-recorded sample data. When active, omnidash shows realistic-looking dashboards without requiring a live Kafka broker or populated database.

Primary use cases:
- Presenting omnidash to stakeholders when the live system is unavailable or insufficiently populated.
- Local development when `omnidash_analytics` has no data yet.
- Screenshot-quality UI review without infrastructure dependencies.

## How It Is Activated

Demo mode state is managed by `DemoModeContext` (`client/src/contexts/DemoModeContext.tsx`).

### Activation Mechanisms

**1. URL parameter** — append `?demo=true` to any URL:

```
http://localhost:3000/enrichment?demo=true
```

**2. localStorage persistence** — toggling demo mode via the UI persists the choice:

```typescript
// Initialization (reads both sources)
const stored = localStorage.getItem('demo-mode');
const urlParam = new URLSearchParams(window.location.search).get('demo');
return stored === 'true' || urlParam === 'true';

// Persistence (keeps state across page navigations)
useEffect(() => {
  localStorage.setItem('demo-mode', isDemoMode.toString());
}, [isDemoMode]);
```

**3. UI toggle** — the `DemoModeToggle` button in the global header.

### Context API

```typescript
interface DemoModeContextType {
  isDemoMode: boolean;   // current state
  toggleDemoMode: () => void; // flip the toggle
}
```

The provider wraps the entire app tree in `App.tsx`:

```tsx
<DemoModeProvider>
  <ThemeProvider defaultTheme="dark">
    ...app content...
  </ThemeProvider>
</DemoModeProvider>
```

Any component or hook can consume it:

```typescript
import { useDemoMode } from '@/contexts/DemoModeContext';

const { isDemoMode, toggleDemoMode } = useDemoMode();
```

## The DemoModeToggle

`client/src/components/DemoModeToggle.tsx` renders a button in the global header that shows the current mode and toggles it on click.

- **Live mode**: "Live Mode" label with a Play icon (outline button style)
- **Demo mode**: "Demo Mode" label with a Stop icon + "Demo Data" badge (solid button style)

A second component, `DemoControlPanel`, appears alongside the toggle and provides additional demo-specific controls (e.g., playback speed, scenario selection) when demo mode is active.

## The DemoBanner

`client/src/components/DemoBanner.tsx` (OMN-2298) renders a persistent amber warning banner at the top of any page component that includes it when demo mode is active.

```
[flask icon] Demo Mode — Showing pre-recorded sample data. No live Kafka or database queries are made.  [Exit Demo] [X]
```

Behavior:
- Renders only when `isDemoMode === true`.
- Dismissible per-session via local `dismissed` state (disappears until next navigation).
- Clicking "Exit Demo" calls `toggleDemoMode()` to deactivate demo mode globally.
- Clicking X hides the banner for the current page visit without changing the mode.

To add the banner to a page:

```tsx
import { DemoBanner } from '@/components/DemoBanner';

export default function MyDashboard() {
  return (
    <div>
      <DemoBanner />
      {/* rest of page */}
    </div>
  );
}
```

## Which Data Sources Support Demo Mode

### API-First Data Sources (`client/src/lib/data-sources/`)

All data source classes accept a `demoMode` option. When `demoMode: true` is passed, the class skips the API call entirely and returns canned mock data. The `isUsingMockData` getter also reflects this state.

Example from `enrichment-source.ts`:

```typescript
export interface EnrichmentFetchOptions {
  fallbackToMock?: boolean;
  mockOnEmpty?: boolean;
  /** When true, skip the API call entirely and return canned demo data (OMN-2298). */
  demoMode?: boolean;
}

async summary(window = '7d', options: EnrichmentFetchOptions = {}): Promise<EnrichmentSummary> {
  const { fallbackToMock = true, mockOnEmpty = false, demoMode = false } = options;
  if (demoMode) {
    this.markMock('summary');
    return getMockEnrichmentSummary(window);
  }
  // ... real API call with fallback ...
}
```

Mock data factories live in `client/src/lib/mock-data/` and are named to match the data source (e.g., `enrichment-mock.ts`).

### Projection Stream Data Sources (`useDemoProjectionStream`)

For dashboards that use the `useProjectionStream` hook (server-side materialized view polling), the `useDemoProjectionStream` hook (`client/src/hooks/useDemoProjectionStream.ts`) provides a drop-in replacement.

When demo mode is active it returns a static canned `ProjectionResponse<T>` snapshot. When live, it delegates to `useProjectionStream` unchanged. The return type is identical so callers need no conditional logic.

```typescript
// Usage in a page component:
const { data, isLoading, isConnected, isDemo } = useDemoProjectionStream<EventBusPayload>(
  'event-bus',           // viewId
  getDemoEventBusSnapshot, // factory: () => T
  fetchEventBusSnapshot,   // live fetcher (used when !isDemoMode)
  { limit: maxEvents, refetchInterval: 2000 }
);
```

Key implementation detail: `useProjectionStream` is always called (React hooks must not be conditional) but is disabled via `enabled: !isDemoMode` when demo mode is on, preventing wasted network connections.

```typescript
const liveStream = useProjectionStream<T>(viewId, liveFetcher, {
  ...options,
  enabled: !isDemoMode,  // disabled in demo mode
});
```

The `isDemo: boolean` field in the return value allows components to conditionally render indicators or apply different styling when showing demo data.

## How to Add Demo Mode Support to a New Data Source

### Step 1: Add `demoMode` option to the fetch interface

```typescript
export interface MySourceFetchOptions {
  fallbackToMock?: boolean;
  mockOnEmpty?: boolean;
  demoMode?: boolean; // NEW
}
```

### Step 2: Create a mock data factory in `client/src/lib/mock-data/`

```typescript
// client/src/lib/mock-data/my-feature-mock.ts
export function getMockMyFeatureSummary(): MyFeatureSummary {
  return {
    total: 1234,
    trend: '+5%',
    // ... realistic-looking values
  };
}
```

### Step 3: Guard each fetch method with an early return

```typescript
async summary(options: MySourceFetchOptions = {}): Promise<MyFeatureSummary> {
  const { fallbackToMock = true, demoMode = false } = options;
  if (demoMode) {
    this.markMock('summary');
    return getMockMyFeatureSummary();
  }
  try {
    const response = await fetch(`${this.baseUrl}/summary`);
    // ...
  } catch (err) {
    if (fallbackToMock) {
      this.markMock('summary');
      return getMockMyFeatureSummary();
    }
    throw err;
  }
}
```

### Step 4: Pass `demoMode` from the page component

In the page, consume the context and forward it to the data source:

```typescript
const { isDemoMode } = useDemoMode();

const { data } = useQuery({
  queryKey: ['my-feature', isDemoMode],
  queryFn: () => mySource.summary({ demoMode: isDemoMode }),
});
```

### Step 5: Render the DemoBanner in the page

```tsx
import { DemoBanner } from '@/components/DemoBanner';

return (
  <div>
    <DemoBanner />
    {/* rest of page */}
  </div>
);
```

## What Demo Mode Does NOT Do

- Demo mode is **client-side only**. The server never knows demo mode is active — all API routes remain functional and serve real data. The client simply does not call them.
- Demo mode does not affect WebSocket connections at the server level. The `useProjectionStream` hook is disabled client-side (`enabled: false`), but the server continues broadcasting events to any other connected clients.
- Demo mode state is **not shared** across browser tabs. Each tab tracks its own `localStorage` entry independently.
