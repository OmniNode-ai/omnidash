// Bridge between ComponentCell (config-prop API) and IDoughnutChartAdapter (projectionData API).
// Fetches llmCost projection, delegates to DoughnutChartAdapter with model_name → total_cost_usd mapping.
// Restores the data-supplying wrapper deleted in OMN-10291. DoughnutChartAdapter wraps its own
// ComponentWrapper internally (title "Cost by Model"), so this adapter does not add another.
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import type { EmptyStateConfig } from '@shared/types/chart-config';
import { DoughnutChartAdapter } from '@/components/charts/threejs/DoughnutChartAdapter';

type CostByModel3DConfig = Record<string, never>;

const EMPTY_STATE: EmptyStateConfig = {
  defaultMessage: 'No cost data available',
};

export default function CostByModel3DAdapter(_config: CostByModel3DConfig) {
  const { data } = useProjectionQuery<Record<string, unknown>>({
    queryKey: ['cost-by-model-3d', TOPICS.llmCost],
    topic: TOPICS.llmCost,
  });

  return (
    <DoughnutChartAdapter
      projectionData={data ?? []}
      fieldMappings={{ label: 'model_name', value: 'total_cost_usd' }}
      emptyState={EMPTY_STATE}
    />
  );
}
