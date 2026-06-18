// OMN-13131 (W6, G-H): the gate between the renderer-capability projection and a
// concrete renderer.
//
// Given the live capability projection state (read via the existing
// `useProjectionQuery` polling — see `useRendererCapabilities`) and a renderer
// requirement, the gate either renders the caller's matched child or a TYPED
// `TypedEmptyState`. A stale/absent/degraded capability — or a requirement no
// advertised capability satisfies — renders
// `EnumEmptyStateReason.UPSTREAM_BLOCKED`, never a blank/blind element and never
// a thrown render error.
//
// The capability read is decoupled from this component (passed via `state`) so
// the resolution branch is deterministically testable; production callers obtain
// `state` from `useRendererCapabilities()`.

import type { ReactNode } from 'react';
import {
  resolveCapabilityEmptyState,
  type CapabilityProjectionState,
} from './capability-empty-state';
import type { RendererRequirement, RendererEntry } from './capability-dispatcher';
import type { RendererCapabilityContract } from '@shared/types/renderer-capability';
import { TypedEmptyState } from './TypedEmptyState';

export interface CapabilityGateProps {
  /** Live renderer-capability projection state (from useRendererCapabilities). */
  state: CapabilityProjectionState;
  /** What the surface requires of a renderer. */
  requirement: RendererRequirement;
  /** Rendered only when a fresh capability satisfies the requirement. */
  children: (entry: RendererEntry<RendererCapabilityContract>) => ReactNode;
}

export function CapabilityGate({ state, requirement, children }: CapabilityGateProps) {
  const resolution = resolveCapabilityEmptyState(state, requirement);
  if (resolution.rendered) {
    return <>{children(resolution.entry)}</>;
  }
  return <TypedEmptyState reason={resolution.reason} detail={resolution.detail} />;
}
