// Bridge between ComponentCell (config-prop API) and ITrendChartAdapter (projectionData API).
// Fetches llmCost projection, maps CostTrendConfig → TrendChartFieldMapping, delegates to TrendChartThreeJs.
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import type { TrendChartFieldMapping } from '@shared/types/chart-config';
import type { ProjectionOrderingAuthority } from '@shared/types/component-manifest';
import { TrendChartThreeJs } from '@/components/charts/threejs/TrendChart';

interface CostTrendConfig {
  style?: 'area' | 'bar';
  granularity?: 'hour' | 'day';
}

const ORDERING_AUTHORITY: ProjectionOrderingAuthority = {
  authority: 'bucket_time',
  fieldName: 'bucket_time',
  direction: 'asc',
  clockSemantics: 'UTC',
};

export default function CostTrendAdapter({ config }: { config: CostTrendConfig }) {
  const granularity = config.granularity ?? 'hour';
  const style = config.style ?? 'area';

  const { data, isLoading, error } = useProjectionQuery<Record<string, unknown>>({
    queryKey: ['cost-trend-panel', TOPICS.llmCost],
    topic: TOPICS.llmCost,
  });

  const fieldMappings: TrendChartFieldMapping & { chartType?: 'area' | 'bar' } = {
    x: 'bucket_time',
    y: 'total_cost_usd',
    group: 'model_name',
    granularity,
    chartType: style,
  };

  return (
    <ComponentWrapper title="Cost Trend" isLoading={isLoading} error={error}>
      <TrendChartThreeJs
        projectionData={data ?? []}
        fieldMappings={fieldMappings}
        orderingAuthority={ORDERING_AUTHORITY}
        emptyState={{
          reasons: {
            'no-data': { message: 'No cost data available', cta: 'Cost data appears after LLM calls are tracked' },
          },
        }}
      />
    </ComponentWrapper>
  );
}
