// OMN-13131 (W6, G-H): read the renderer-capability projection via the existing
// poll path and project it into the typed `CapabilityProjectionState`.
//
// This is the production source of the `state` the `CapabilityGate` consumes. The
// read path is UNCHANGED — it routes through `useProjectionQuery`, the same
// polling read every projection-backed widget uses. No WebSocket, no bespoke
// endpoint, no client-side reducer: the W5 reducer owns truth; this hook only
// reads it and surfaces the heartbeat-TTL `is_degraded` flag.

import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { RENDERER_CAPABILITY_PROJECTION } from '@shared/types/renderer-capability';
import type { RendererCapabilityContract } from '@shared/types/renderer-capability';
import type { CapabilityProjectionState } from './capability-empty-state';

// Stable empty reference for the not-yet-resolved read; `isLoading` is the
// authoritative "not loaded" signal — this is not a data fallback.
const EMPTY_CAPABILITIES: readonly RendererCapabilityContract[] = Object.freeze([]);

/**
 * Live renderer-capability projection state. `isDegraded` carries the projection
 * envelope's heartbeat-TTL freshness; an empty `capabilities` array means no
 * renderer has declared a capability (absent projection). Both feed the
 * `CapabilityGate`'s typed `upstream-blocked` resolution.
 */
export function useRendererCapabilities(): CapabilityProjectionState & {
  isLoading: boolean;
} {
  const { data, isError, isLoading } = useProjectionQuery<RendererCapabilityContract>({
    queryKey: ['projection', RENDERER_CAPABILITY_PROJECTION.topic],
    topic: RENDERER_CAPABILITY_PROJECTION.topic,
  });

  // No `?? []` fallback on the projection data — that would hide a not-yet-loaded
  // read behind an "absent projection" result (the very thing the
  // no-projection-fallback gate forbids). `isLoading` distinguishes "not yet
  // resolved" from a genuinely empty (absent) projection; an unresolved read
  // carries no rows yet and is surfaced as loading, not as blocked.
  const capabilities: readonly RendererCapabilityContract[] = Array.isArray(data)
    ? data
    : EMPTY_CAPABILITIES;
  // A query error is an untrusted read → degraded, so the gate blocks rather than
  // rendering blind on a partial/failed read.
  const isDegraded = isError;

  return {
    capabilities,
    isDegraded,
    isLoading,
  };
}
