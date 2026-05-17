// Bridge between ComponentCell (config-prop API) and IBarChartAdapter (projectionData API).
// Fetches llmCost projection, delegates to BarChart with model_name → total_cost_usd mapping.
// Restores the data-supplying wrapper deleted in OMN-10291 so the cost-by-model widget can
// render without the manifest needing to carry fieldMappings (which the ComponentManifest
// type does not yet support).
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import type { EmptyStateConfig } from '@shared/types/chart-config';
import { BarChart } from '@/components/charts/threejs/BarChart';

type CostByModelConfig = Record<string, never>;

type CostByModelAdapterProps = {
  config: CostByModelConfig;
};

const EMPTY_STATE: EmptyStateConfig = {
  reasons: {
    'no-data': {
      message: 'No cost data available',
      cta: 'Cost by model appears after LLM calls are tracked.',
    },
  },
  defaultMessage: 'No cost data available',
};

export default function CostByModelAdapter({ config: _config }: CostByModelAdapterProps) {
  const { data, isLoading, error } = useProjectionQuery<Record<string, unknown>>({
    queryKey: ['cost-by-model', TOPICS.llmCost],
    topic: TOPICS.llmCost,
  });

  return (
    <ComponentWrapper title="Cost by Model" isLoading={isLoading} error={error}>
      <BarChart
        projectionData={data ?? []}
        fieldMappings={{ x: 'model_name', y: 'total_cost_usd', format: '$,.4f' }}
        emptyState={EMPTY_STATE}
      />
    </ComponentWrapper>
  );
}
