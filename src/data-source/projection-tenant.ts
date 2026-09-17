import { resolveProjectionBaseUrl } from './projection-base-url';
import { PROJECTION_TENANT_ID_DEFAULT } from '@/config/generated/data-source-defaults';

/**
 * OMN-18159 — the tenant this dashboard reads tenant-scoped exposures as.
 *
 * Operator ruling, 2026-09-11T14:40:49Z: the delegation widgets read as an
 * EXPLICITLY CONFIGURED tenant, the same house-tenant shape the projection
 * API's own operator status page takes, sent as a query parameter and gated on
 * the projection server's own exposure metadata — never a topic list copied
 * into omnidash. The signed-in-viewer shape is deferred until the dashboard
 * carries identity.
 *
 * Why metadata rather than a list. `tenant_column` is declared per exposure in
 * the owning node's contract and surfaced by `GET /projections`. A list of
 * "the scoped topics" hard-coded here would be a second decision table for the
 * same fact, and the two would disagree the first time a contract changed —
 * the exact duplication the upsert-plan consolidation removed. The server is
 * the authority on which exposures are scoped; this module asks it.
 *
 * Why an unscoped read is not reachable by omission. `?tenant=` on an exposure
 * that declares no `tenant_column` is refused `422 unsupported_filter`, and a
 * scoped exposure with no tenant is refused `422 tenant_context_unresolved`.
 * Both refusals are the server's, and they are the real guarantee. What this
 * module adds is that the browser does not issue a request it already knows
 * will be refused, and that the reason the operator sees names the missing
 * configuration rather than a bare status code.
 */

/** What the caller should do about the tenant for one exposure. */
export type TenantResolution =
  | { kind: 'unscoped' }
  | { kind: 'scoped'; query: string }
  | { kind: 'refused'; reason: string };

interface ExposureMetadata {
  topic: string;
  tenant_column: string | null;
  tenant_scoped: boolean;
}

/**
 * The configured tenant, or `null` when none is configured.
 *
 * Resolution order: the `VITE_PROJECTION_TENANT_ID` override, then the
 * contract default. There is deliberately NO third step and no built-in
 * fallback value. A default tenant here would answer `200` with somebody's
 * rows to a dashboard nobody configured — a result indistinguishable from a
 * correctly scoped one, which is the silent-answer property this whole change
 * exists to make unrepresentable.
 */
export function resolveConfiguredTenant(): string | null {
  const override = import.meta.env.VITE_PROJECTION_TENANT_ID;
  if (typeof override === 'string' && override.trim()) return override.trim();
  if (PROJECTION_TENANT_ID_DEFAULT.trim()) return PROJECTION_TENANT_ID_DEFAULT.trim();
  return null;
}

let exposureCache: Promise<Map<string, string | null>> | null = null;

/** Drop the memoized exposure map. Exported for tests and for a data-source flip. */
export function resetExposureMetadataCache(): void {
  exposureCache = null;
}

/**
 * `topic -> tenant_column` for every exposure the backend declares.
 *
 * Memoized because every widget read would otherwise re-fetch the catalogue.
 * A failed fetch clears the memo rather than caching the failure, so a blip
 * does not pin every later read to "unknown" for the life of the page.
 */
export async function fetchExposureTenantColumns(): Promise<Map<string, string | null>> {
  if (exposureCache !== null) return exposureCache;
  const pending = (async () => {
    const base = resolveProjectionBaseUrl();
    if (base === null) {
      throw new Error('file mode has no projection backend to read exposure metadata from');
    }
    const res = await fetch(`${base}/projections`);
    if (!res.ok) throw new Error(`GET /projections returned HTTP ${res.status}`);
    const body = (await res.json()) as { topics?: ExposureMetadata[] };
    const map = new Map<string, string | null>();
    for (const entry of body.topics ?? []) {
      if (typeof entry?.topic !== 'string') continue;
      map.set(entry.topic, entry.tenant_scoped ? (entry.tenant_column ?? null) : null);
    }
    return map;
  })();
  exposureCache = pending;
  pending.catch(() => {
    if (exposureCache === pending) exposureCache = null;
  });
  return pending;
}

/**
 * Decide the tenant for one exposure.
 *
 * When the catalogue cannot be read the exposure's scoping is UNKNOWN, and
 * this returns `unscoped` rather than guessing either way. That is deliberate
 * and it is not a hole: guessing "scoped" would attach a tenant to exposures
 * that refuse one, taking every unscoped widget down on a metadata blip, while
 * guessing "unscoped" sends the request to the server, which refuses a scoped
 * exposure on its own authority. An unknown answer therefore degrades one
 * widget with the server's own reason instead of the whole dashboard with a
 * guess.
 */
export async function resolveTenantFor(topic: string): Promise<TenantResolution> {
  let tenantColumn: string | null;
  try {
    tenantColumn = (await fetchExposureTenantColumns()).get(topic) ?? null;
  } catch {
    return { kind: 'unscoped' };
  }
  if (tenantColumn === null) return { kind: 'unscoped' };

  const tenant = resolveConfiguredTenant();
  if (tenant === null) {
    return {
      kind: 'refused',
      reason:
        `tenant_context_unresolved: '${topic}' is scoped by '${tenantColumn}' and no ` +
        'tenant is configured for this dashboard (set data_source.projection_tenant_id ' +
        'in contract.yaml, or VITE_PROJECTION_TENANT_ID)',
    };
  }
  return { kind: 'scoped', query: `tenant=${encodeURIComponent(tenant)}` };
}
