import { useQuery } from '@tanstack/react-query';
import { useSnapshotSource } from '../data-source';
import { useFrameStore } from '../store/store';
import type { VisualizationContract } from '../../shared/types/visualization-contract';

// ── Legacy call signature ────────────────────────────────────────────────────

interface UseProjectionQueryOptions {
  queryKey: string[];
  topic: string;
  enabled?: boolean;
  refetchInterval?: number;
}

// ── Contract-aware result type ───────────────────────────────────────────────

export interface ProjectionQueryResult<T> {
  data: T[];
  cursor: string | null;
  is_degraded: boolean;
  freshness: string | null;
  isLoading: boolean;
  error: Error | null;
}

// ── Contract-aware call signature ────────────────────────────────────────────

interface UseProjectionQueryContractOptions {
  topic: string;
  contract: VisualizationContract;
  params?: Partial<Record<string, string>>;
  enabled?: boolean;
  refetchInterval?: number;
}

// ── Envelope shape from projection API ──────────────────────────────────────

interface ProjectionApiEnvelope {
  rows: unknown[];
  cursor?: string | null;
  is_degraded?: boolean;
  freshness?: string | null;
}

function isApiEnvelope(v: unknown): v is ProjectionApiEnvelope {
  return (
    typeof v === 'object' &&
    v !== null &&
    'rows' in v &&
    Array.isArray((v as ProjectionApiEnvelope).rows)
  );
}

// ── Param validation ─────────────────────────────────────────────────────────

export function validateContractParams(
  params: Partial<Record<string, string>> | undefined,
  contract: VisualizationContract,
): void {
  if (!params) return;
  const queryParams = contract.query_params ?? {};
  const allowedParamNames = new Set(
    Object.values(queryParams).map((entry) => entry.param),
  );
  for (const key of Object.keys(params)) {
    if (!allowedParamNames.has(key)) {
      throw new Error(`Undeclared query param: ${key}`);
    }
  }
}

// ── Contract-aware hook ──────────────────────────────────────────────────────

export function useProjectionQueryWithContract<T>(
  opts: UseProjectionQueryContractOptions,
): ProjectionQueryResult<T> {
  // Validate at render time — throws synchronously on invalid keys.
  validateContractParams(opts.params, opts.contract);

  const source = useSnapshotSource();
  const globalInterval = useFrameStore((s) => s.globalFilters.autoRefreshInterval);
  const refetchInterval =
    globalInterval === null ? false : (globalInterval ?? opts.refetchInterval);

  const paramKey = opts.params
    ? JSON.stringify(Object.fromEntries(Object.entries(opts.params).sort()))
    : '';
  const queryKey = ['projection-contract', opts.topic, paramKey];

  const result = useQuery<ProjectionApiEnvelope | T[]>({
    queryKey,
    queryFn: async () => {
      // Attempt HTTP path with query params when source exposes a baseUrl.
      const anySource = source as unknown as { options?: { baseUrl: string } };
      const baseUrl = anySource.options?.baseUrl;

      if (baseUrl && opts.params && Object.keys(opts.params).length > 0) {
        const qs = new URLSearchParams(opts.params as Record<string, string>).toString();
        const url = `${baseUrl}/projection/${encodeURIComponent(opts.topic)}?${qs}`;
        const res = await fetch(url);
        if (!res.ok) return { rows: [], cursor: null, is_degraded: false, freshness: null };
        const body = (await res.json()) as unknown;
        return body as ProjectionApiEnvelope | T[];
      }

      // Generic readAll (file source or param-less http).
      const rows: T[] = [];
      for await (const s of source.readAll(opts.topic)) rows.push(s as T);
      return rows;
    },
    enabled: opts.enabled ?? true,
    refetchInterval,
  });

  let data: T[] = [];
  let cursor: string | null = null;
  let is_degraded = false;
  let freshness: string | null = null;

  if (result.data) {
    // Direct envelope (http source returns envelope as top-level response).
    if (isApiEnvelope(result.data)) {
      data = result.data.rows as T[];
      cursor = result.data.cursor ?? null;
      is_degraded = result.data.is_degraded ?? false;
      freshness = result.data.freshness ?? null;
    } else {
      // File/readAll source yields each file's content as a separate row.
      // If a single file contains an envelope, unwrap it.
      const raw = result.data as unknown[];
      if (raw.length === 1 && isApiEnvelope(raw[0])) {
        const env = raw[0] as ProjectionApiEnvelope;
        data = env.rows as T[];
        cursor = env.cursor ?? null;
        is_degraded = env.is_degraded ?? false;
        freshness = env.freshness ?? null;
      } else {
        data = result.data as T[];
      }
    }
  }

  return {
    data,
    cursor,
    is_degraded,
    freshness,
    isLoading: result.isLoading,
    error: result.error as Error | null,
  };
}

// ── Legacy hook (unchanged) ──────────────────────────────────────────────────

export function useProjectionQuery<T>(options: UseProjectionQueryOptions) {
  // T15 (OMN-156): the source is provided once at app root via
  // SnapshotSourceProvider. Tests and Storybook stories wrap their tree
  // in their own provider with a mock source.
  const source = useSnapshotSource();

  // OMN-126: dashboard-level auto-refresh override. The
  // `AutoRefreshSelector` writes `globalFilters.autoRefreshInterval`,
  // and every projection query honours it:
  //   - `null`  → user explicitly turned auto-refresh off; pass
  //               `false` to react-query so no refetching happens.
  //   - number  → override whatever the widget supplied; the global
  //               wins so all widgets refresh on the same cadence.
  //   - undefined → no global preference; fall back to the widget's
  //                 own `options.refetchInterval` (existing behavior).
  const globalInterval = useFrameStore((s) => s.globalFilters.autoRefreshInterval);
  const refetchInterval =
    globalInterval === null
      ? false
      : (globalInterval ?? options.refetchInterval);

  return useQuery<T[]>({
    queryKey: options.queryKey,
    queryFn: async () => {
      const out: T[] = [];
      for await (const s of source.readAll(options.topic)) out.push(s as T);
      return out;
    },
    enabled: options.enabled ?? true,
    refetchInterval,
  });
}
