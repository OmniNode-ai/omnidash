/**
 * Data Source to Route Mapping (OMN-7566)
 *
 * Maps data source keys (from GET /api/health/data-sources) to the dashboard
 * routes that depend on each source. Used by the sidebar to dim pages that
 * have no live data, and by the Settings page to show data availability.
 */

/** Mirrors DataSourceStatus from server/health-data-sources-routes.ts */
type DataSourceStatus =
  | 'live'
  | 'mock'
  | 'error'
  | 'offline'
  | 'expected_idle_local'
  | 'not_applicable';

export const DATA_SOURCE_ROUTE_MAP: Record<string, string[]> = {
  eventBus: ['/events', '/live-events'],
  effectiveness: [
    '/effectiveness',
    '/effectiveness/latency',
    '/effectiveness/utilization',
    '/effectiveness/ab',
  ],
  extraction: ['/extraction'],
  baselines: ['/baselines'],
  costTrends: ['/cost-trends'],
  intents: ['/intents', '/intent-drift'],
  nodeRegistry: ['/registry'],
  correlationTrace: ['/trace'],
  validation: ['/validation'],
  patterns: ['/patterns'],
  enforcement: ['/enforcement'],
};

/** Reverse lookup: given a route, find the data source key that powers it. */
export function getDataSourceForRoute(route: string): string | undefined {
  for (const [key, routes] of Object.entries(DATA_SOURCE_ROUTE_MAP)) {
    if (routes.includes(route)) {
      return key;
    }
  }
  return undefined;
}

/** Check whether a route's backing data source is live. */
export function isRouteLiveByHealth(
  route: string,
  healthData: Record<string, { status: DataSourceStatus }> | undefined
): boolean {
  if (!healthData) return true; // Optimistic: if no health data yet, assume live
  const key = getDataSourceForRoute(route);
  if (!key) return true; // No data source mapping — treat as always live (e.g., static pages)
  const info = healthData[key];
  if (!info) return true;
  return info.status === 'live';
}
