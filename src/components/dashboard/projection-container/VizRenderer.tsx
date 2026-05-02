import type { VisualizationContract, VisualizationType } from '../../../../shared/types/visualization-contract';
import { vizRegistry } from './viz-registry';
import { Text } from '@/components/ui/typography';

interface VizRendererProps {
  type: VisualizationType;
  data: unknown[];
  contract: VisualizationContract;
}

export function VizRenderer({ type, data, contract }: VizRendererProps) {
  const adapter = vizRegistry[type];
  if (!adapter) {
    return (
      <Text as="div" size="lg" color="bad">
        No adapter registered for visualization type: {type}
      </Text>
    );
  }
  return adapter.render({ data, contract });
}
