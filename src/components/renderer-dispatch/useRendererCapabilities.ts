// OMN-13131 (W6, G-H): read the renderer-capability projection via the existing
// poll path and project it into the typed `CapabilityProjectionState`.
//
// This is the production source of the `state` the `CapabilityGate` consumes. The
// read path is UNCHANGED — it routes through `useProjectionQuery`, the same
// polling read every projection-backed widget uses. No WebSocket, no bespoke
// endpoint, no client-side reducer: the W5 reducer owns truth; this hook only
// reads it and surfaces the heartbeat-TTL `is_degraded` flag.
//
// OMN-13381 (Phase-1 follow-up): per-row `is_degraded` filtering.
// The W5 reducer writes `is_degraded` PER ROW. A stale-but-chart-capable row
// must NOT satisfy the dispatcher — it is not trustworthy capability evidence.
// This hook:
//   1. Reads projection rows as `RendererCapabilityProjectionRow` (superset of
//      `RendererCapabilityContract` that includes the per-row `is_degraded` field).
//   2. Filters out any row where `is_degraded=true` before building the
//      `capabilities` array passed to the gate.
//   3. Sets `isDegraded=true` when ALL rows are degraded (none survived the
//      filter) or when the query itself is in an error state — so the
//      `CapabilityGate` renders the typed `UPSTREAM_BLOCKED` empty-state instead
//      of passing zero rows to the dispatcher.

import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import {
  RENDERER_CAPABILITY_PROJECTION,
  type RendererCapabilityProjectionRow,
} from '@shared/types/renderer-capability';
import type { RendererCapabilityContract } from '@shared/types/renderer-capability';
import type { CapabilityProjectionState } from './capability-empty-state';

// Stable empty reference for the not-yet-resolved read; `isLoading` is the
// authoritative "not loaded" signal — this is not a data fallback.
const EMPTY_CAPABILITIES: readonly RendererCapabilityContract[] = Object.freeze([]);

/**
 * Live renderer-capability projection state. `isDegraded` is true when the query
 * is in an error state OR when every projection row has `is_degraded=true` (all
 * renderers stale). An empty `capabilities` array (after filtering degraded rows)
 * means no renderer has declared a FRESH capability. Both feed the `CapabilityGate`'s
 * typed `upstream-blocked` resolution.
 *
 * Per-row `is_degraded=true` rows are EXCLUDED from `capabilities` — a stale
 * renderer that still advertises the required component kind must NOT satisfy the
 * dispatcher gate (OMN-13381).
 */
export function useRendererCapabilities(): CapabilityProjectionState & {
  isLoading: boolean;
} {
  const { data, isError, isLoading } = useProjectionQuery<RendererCapabilityProjectionRow>({
    queryKey: ['projection', RENDERER_CAPABILITY_PROJECTION.topic],
    topic: RENDERER_CAPABILITY_PROJECTION.topic,
  });

  // No `?? []` fallback on the projection data — that would hide a not-yet-loaded
  // read behind an "absent projection" result (the very thing the
  // no-projection-fallback gate forbids). `isLoading` distinguishes "not yet
  // resolved" from a genuinely empty (absent) projection; an unresolved read
  // carries no rows yet and is surfaced as loading, not as blocked.
  const allRows: readonly RendererCapabilityProjectionRow[] = Array.isArray(data)
    ? data
    : EMPTY_CAPABILITIES;

  // OMN-13381: filter out rows where the W5 reducer flagged `is_degraded=true`.
  // These rows have a stale heartbeat and MUST NOT satisfy a dispatch requirement,
  // even if they still advertise the required component kind.
  const freshRows: readonly RendererCapabilityContract[] = allRows.filter(
    (row) => row.is_degraded !== true,
  );

  // A query error is an untrusted read → degraded.
  // All rows degraded (non-empty result set where every row is stale) → degraded:
  // the reducer knows about this renderer but its heartbeat has expired.
  // Zero rows with zero all-rows means absent (not degraded — handled separately
  // by the gate's `capabilities.length === 0` branch).
  const isDegraded = isError || (allRows.length > 0 && freshRows.length === 0);

  return {
    capabilities: freshRows,
    isDegraded,
    isLoading,
  };
}
