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
 *   0. Runtime override (OMN-13007) — an explicit choice in the DATA SOURCE
 *      control wins. File override -> null; live override with a base URL -> that
 *      absolute base.
 *   1. DATA_SOURCE_DEFAULT_URL — generated from contract.yaml plus the local
 *      contract.local.yaml overlay. An empty value means same-origin `/projection/*`
 *      through the local runtime. Browser env files are not endpoint authority.
 *
 * In `file` mode there is no projection backend; callers must take their own
 * fixture path and never call this. `resolveProjectionBaseUrl` returns `null`
 * in file mode so a misuse fails loudly rather than silently hitting an origin.
 */
export function resolveProjectionBaseUrl(): string | null {
  const effective = resolveEffectiveDataSource();
  if (effective.mode === 'file') return null;
  // A live override that pins an explicit absolute base remains an intentional
  // operator choice. The chrome control supplies an absolute URL the browser hits.
  if (effective.baseUrl !== null) return effective.baseUrl.replace(/\/$/, '');
  // The generated value is read from contract.yaml + contract.local.yaml by
  // scripts/generate-data-source-config.ts. Empty deliberately means same-origin.
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
