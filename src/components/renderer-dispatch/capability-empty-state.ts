// OMN-13131 (W6, G-H): typed empty-state resolution from the renderer-capability
// projection.
//
// The W4 `CapabilityDispatcher` already resolves a requirement to a typed match
// or a typed miss. This module wires the W5 renderer-capability projection read
// into that dispatcher and maps every non-rendered outcome to a TYPED
// `EmptyStateReason` — so a stale (`is_degraded`), absent (no rows), or
// unsatisfiable capability surfaces `EnumEmptyStateReason.UPSTREAM_BLOCKED`
// instead of a blank/blind render. No I/O, no side effects — deterministic
// mapping the caller (React or any other renderer) drives.
//
// Doctrine: the client renders truth, it does not create it. The capability
// projection is the authoritative source; this module only classifies the read.

import {
  CapabilityDispatcher,
  type RendererRequirement,
  type RendererEntry,
} from './capability-dispatcher';
import type { RendererCapabilityContract } from '@shared/types/renderer-capability';
import {
  type EmptyStateReason,
  EmptyStateReasonValue,
} from '@shared/types/empty-state-reason';

/**
 * The read result of the renderer-capability projection
 * (`useProjectionQuery` over the capability topic). `capabilities` are the
 * advertised renderer capability rows; `isDegraded` mirrors the projection
 * envelope's `is_degraded` (heartbeat-TTL freshness from W5). An empty
 * `capabilities` array means the projection has no rows for any renderer.
 */
export interface CapabilityProjectionState {
  capabilities: readonly RendererCapabilityContract[];
  isDegraded: boolean;
}

/** Outcome of resolving a requirement against the capability projection. */
export type CapabilityEmptyStateResolution =
  | { rendered: true; entry: RendererEntry<RendererCapabilityContract> }
  | { rendered: false; reason: EmptyStateReason; detail: string };

/**
 * Resolve a renderer requirement against the live capability projection.
 *
 * A degraded projection (`isDegraded`), an absent projection (no rows), or a
 * requirement no advertised capability satisfies all resolve to a typed
 * `upstream-blocked` reason — never a blank render, never a throw. A fresh
 * projection with a satisfying capability resolves to the matched entry.
 *
 * Selection is delegated to the W4 `CapabilityDispatcher`; this function only
 * classifies the read into the typed empty-state vocabulary.
 */
export function resolveCapabilityEmptyState(
  state: CapabilityProjectionState,
  requirement: RendererRequirement,
): CapabilityEmptyStateResolution {
  // Stale capability heartbeat (W5 TTL freshness) → blocked. The projection
  // may carry rows, but they are not trustworthy enough to drive dispatch.
  if (state.isDegraded) {
    return {
      rendered: false,
      reason: EmptyStateReasonValue.UPSTREAM_BLOCKED,
      detail:
        'Renderer-capability projection is degraded (stale heartbeat); refusing to dispatch on untrusted capabilities.',
    };
  }

  // Absent projection → blocked. No renderer has declared a capability.
  if (state.capabilities.length === 0) {
    return {
      rendered: false,
      reason: EmptyStateReasonValue.UPSTREAM_BLOCKED,
      detail:
        'Renderer-capability projection is absent (no declared renderers); upstream capability pipeline has not reported.',
    };
  }

  // Identity entries: each advertised capability maps to itself as the "adapter"
  // so the dispatcher's matching predicate selects the satisfying capability row.
  const entries: RendererEntry<RendererCapabilityContract>[] = state.capabilities.map(
    (capability) => ({ capability, adapter: capability }),
  );
  const dispatcher = new CapabilityDispatcher<RendererCapabilityContract>(entries);
  const result = dispatcher.dispatch(requirement);

  if (result.matched) {
    return { rendered: true, entry: result.entry };
  }

  // No advertised capability satisfies the requirement → blocked (not blank).
  return {
    rendered: false,
    reason: EmptyStateReasonValue.UPSTREAM_BLOCKED,
    detail: result.reason,
  };
}
