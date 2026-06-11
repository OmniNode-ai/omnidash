import { DATA_SOURCE_DEFAULT_URL } from '@/config/generated/data-source-defaults';
import { resolveEffectiveDataSource } from './data-source-override';

/**
 * OMN-12833 (A2.5) — single source of the projection backend origin.
 * OMN-13007 — now honors the runtime data-source override seam.
 *
 * Every projection READ in the dashboard must target ONE standard projection
 * backend (`<base>/projection/{topic}`). This resolver is the only place that
 * decides that origin, so there is no second backend, no `:8765` SEA server,
 * no `:3010` merge proxy, and no implicit page-origin fetch.
 *
 * Resolution order (most specific wins):
 *   0. Runtime override (OMN-13007) — when the chrome DATA SOURCE control pins a
 *      mode/base URL it wins over env. File override -> null; live override with
 *      an explicit base URL -> that absolute base.
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
  const effective = resolveEffectiveDataSource();
  if (effective.mode === 'file') return null;
  // A live override that pins an explicit absolute base wins over env. The
  // chrome control supplies an absolute URL the browser hits directly.
  if (effective.baseUrl !== null) return effective.baseUrl.replace(/\/$/, '');
  // No override base — fall back to the env-resolved single backend.
  if (import.meta.env.VITE_PROJECTION_API_URL) return '';
  const httpUrl = import.meta.env.VITE_HTTP_DATA_SOURCE_URL;
  if (httpUrl) return httpUrl.replace(/\/$/, '');
  return DATA_SOURCE_DEFAULT_URL.replace(/\/$/, '');
}

/**
 * OMN-13007 — resolve the base origin for COMMAND posts (e.g. the SEA generate
 * widget's `POST /api/sea/generate`). Commands target the same live backend
 * origin as projection reads, so this shares `resolveProjectionBaseUrl()`:
 *
 *   - file mode      -> null (no live backend; the caller must surface an honest
 *                       "switch to live" message instead of silently failing).
 *   - proxy-relative -> '' (same-origin; the serving layer forwards /api/*).
 *   - absolute base  -> the chrome override or env backend origin.
 *
 * This replaces the prior per-widget env read (VITE_HTTP_DATA_SOURCE_URL ??
 * VITE_SQLITE_DATA_SOURCE_URL) so the SEA generate submit follows the same
 * runtime override as every projection read — no second resolution path.
 */
export function resolveCommandBaseUrl(): string | null {
  return resolveProjectionBaseUrl();
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
