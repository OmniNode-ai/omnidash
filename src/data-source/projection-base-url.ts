import {
  DATA_SOURCE_DEFAULT_MODE,
  DATA_SOURCE_DEFAULT_URL,
} from '@/config/generated/data-source-defaults';

/**
 * OMN-12833 (A2.5) — single source of the projection backend origin.
 *
 * Every projection READ in the dashboard must target ONE standard projection
 * backend (`<base>/projection/{topic}`). This resolver is the only place that
 * decides that origin, so there is no second backend, no `:8765` SEA server,
 * no `:3010` merge proxy, and no implicit page-origin fetch.
 *
 * Resolution order (most specific wins):
 *   1. VITE_PROJECTION_API_URL set -> '' (relative). The dev/serving layer proxies
 *      same-origin `/projection/*` to that ONE backend (see vite.proxy-config.ts).
 *      Using a relative base keeps every browser request same-origin (one origin,
 *      transparently forwarded to the single backend) and avoids cross-origin CORS
 *      failures, while still guaranteeing there is exactly one backend.
 *   2. VITE_HTTP_DATA_SOURCE_URL — the HttpSnapshotSource base (absolute), used when
 *      no projection proxy is configured.
 *   3. DATA_SOURCE_DEFAULT_URL   — contract.yaml default (local Express bridge).
 *
 * In `file` mode there is no projection backend; callers must take their own
 * fixture path and never call this. `resolveProjectionBaseUrl` returns `null`
 * in file mode so a misuse fails loudly rather than silently hitting an origin.
 */
export function resolveProjectionBaseUrl(): string | null {
  const mode = import.meta.env.VITE_DATA_SOURCE ?? DATA_SOURCE_DEFAULT_MODE;
  if (mode === 'file') return null;
  // The single backend is reached through the same-origin projection proxy.
  if (import.meta.env.VITE_PROJECTION_API_URL) return '';
  const httpUrl = import.meta.env.VITE_HTTP_DATA_SOURCE_URL;
  if (httpUrl) return httpUrl.replace(/\/$/, '');
  return DATA_SOURCE_DEFAULT_URL.replace(/\/$/, '');
}

/**
 * Build a full `/projection/{topic}` URL against the single backend.
 * Pass an optional query string (without leading `?`).
 */
export function projectionUrl(topic: string, query?: string): string {
  const base = resolveProjectionBaseUrl();
  if (base === null) {
    throw new Error(
      'projectionUrl() called in file mode — file mode has no projection backend; use the fixture path instead',
    );
  }
  const path = `${base}/projection/${encodeURIComponent(topic)}`;
  return query ? `${path}?${query}` : path;
}
