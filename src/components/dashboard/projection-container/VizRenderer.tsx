import type { VisualizationContract, VisualizationType } from '@shared/types/visualization-contract';
import { resolveViz } from './viz-registry';
import { TypedEmptyState } from '@/components/renderer-dispatch/TypedEmptyState';
import { EmptyStateReasonValue } from '@shared/types/empty-state-reason';

interface VizRendererProps {
  type: VisualizationType;
  data: unknown[];
  contract: VisualizationContract;
}

export function VizRenderer({ type, data, contract }: VizRendererProps) {
  // Capability-driven selection (OMN-13131, W4): resolveViz routes through the
  // general CapabilityDispatcher. A miss yields null — an absent renderer
  // capability is handled with a TYPED empty state (W6, G-H): the dispatcher
  // could not satisfy the requirement, so the upstream renderer capability is
  // blocked. Never a blank/blind render, never a crash.
  const adapter = resolveViz(type);
  if (!adapter) {
    return (
      <TypedEmptyState
        reason={EmptyStateReasonValue.UPSTREAM_BLOCKED}
        detail={`No renderer capability satisfies visualization type "${type}".`}
      />
    );
  }
  return adapter.render({ data, contract });
}
