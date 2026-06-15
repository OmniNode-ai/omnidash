/**
 * OMN-13065: Route-seam for the /api/settings/feature-flags endpoint.
 *
 * The omnidash Express server exposes this typed REST endpoint. In plain `npm
 * run dev` mode (no Express server running) the fetch will fail or return the
 * SPA fallback HTML — the caller detects this via the rejection and falls back
 * to client-side env config, surfacing an honest "config state" label rather
 * than an error.
 *
 * Behaviour is unchanged from the inline call in FeatureFlagDashboard.tsx.
 * The seam isolates the literal so OMN-12809 / future server migrations have a
 * single diff target.
 */

/** Feature flag record as served by the omnidash Express flag endpoint. */
export interface FeatureFlagRecord {
  name: string;
  value: string | null;
  state: 'on' | 'off' | 'migration';
  service: 'omniclaude' | 'omnidash';
  description: string;
}

interface FlagsResponse {
  flags: FeatureFlagRecord[];
  fetchedAt: string;
}

/** The /api/settings/feature-flags endpoint path. */
export const FEATURE_FLAGS_ENDPOINT = '/api/settings/feature-flags';

function isFlagsResponse(v: unknown): v is FlagsResponse {
  return (
    typeof v === 'object' &&
    v !== null &&
    'flags' in v &&
    Array.isArray((v as FlagsResponse).flags) &&
    'fetchedAt' in v &&
    typeof (v as FlagsResponse).fetchedAt === 'string'
  );
}

export interface FetchFlagsResult {
  flags: FeatureFlagRecord[];
  fetchedAt: string;
}

/**
 * Fetch live feature flags from the omnidash Express server.
 *
 * Rejects when:
 *  - the server returns a non-OK status (server not wired)
 *  - the response body is not a valid `FlagsResponse` (SPA fallback HTML)
 *
 * The caller is responsible for falling back to client-env config when this
 * rejects.
 *
 * @param baseUrl Optional base URL override (defaults to `''` — relative,
 *   same-origin). Pass `VITE_SERVER_BASE_URL` when configured.
 */
export async function fetchFeatureFlags(baseUrl = ''): Promise<FetchFlagsResult> {
  const res = await fetch(`${baseUrl}${FEATURE_FLAGS_ENDPOINT}`);
  if (!res.ok) throw new Error(`server endpoint not wired (HTTP ${res.status})`);
  const body: unknown = await res.json();
  if (!isFlagsResponse(body)) throw new Error('server endpoint not wired (SPA fallback)');
  return { flags: body.flags, fetchedAt: body.fetchedAt };
}
