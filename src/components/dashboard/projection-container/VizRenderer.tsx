import { Text } from '@/components/ui/typography';
import type { VisualizationContract, VisualizationType } from '@shared/types/visualization-contract';
import { resolveViz } from './viz-registry';

interface VizRendererProps {
  type: VisualizationType;
  data: unknown[];
  contract: VisualizationContract;
}

export function VizRenderer({ type, data, contract }: VizRendererProps) {
  // Capability-driven selection (OMN-13131, W4): resolveViz routes through the
  // general CapabilityDispatcher. A miss yields null — an absent capability is
  // handled with a typed empty state, never a crash.
  const adapter = resolveViz(type);
  if (!adapter) {
    return (
      <Text as="div" size="lg" color="bad">
        No adapter registered for visualization type: {type}
      </Text>
    );
  }
  return adapter.render({ data, contract });
}
