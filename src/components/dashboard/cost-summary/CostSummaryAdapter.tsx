// Bridge between ComponentCell (config-prop API) and IKPITileClusterAdapter (projectionData API).
// Fetches costSummary projection, delegates to KPITileClusterThreeJs with three metric tiles.
// Upstream-blocked: projection table does not exist yet; widget renders upstream-blocked empty state.
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import type { EmptyStateConfig } from '@shared/types/chart-config';
import { KPITileClusterThreeJs } from '@/components/charts/threejs/KPITileCluster';

type CostSummaryConfig = Record<string, never>;

const CLUSTER_EMPTY_STATE: EmptyStateConfig = {
  reasons: {
    'no-data': {
      message: 'No cost summary data available',
      cta: 'Cost summary appears after LLM calls are tracked',
    },
    'upstream-blocked': {
      message: 'Upstream pipeline blocked',
      cta: 'Cost summary projection is not yet emitted — check omnimarket emitter status',
    },
  },
  defaultMessage: 'No cost summary data available',
};

const TILES = [
  {
    field: 'total_cost_usd',
    label: 'Total Cost',
    format: '$,.2f',
    emptyState: {
      reasons: {
        'upstream-blocked': {
          message: 'Upstream blocked',
          cta: 'Projection not yet emitted',
        },
      } as EmptyStateConfig['reasons'],
    } as EmptyStateConfig,
  },
  {
    field: 'total_savings_usd',
    label: 'Total Savings',
    format: '$,.2f',
    emptyState: {
      reasons: {
        'upstream-blocked': {
          message: 'Upstream blocked',
          cta: 'Projection not yet emitted',
        },
      } as EmptyStateConfig['reasons'],
    } as EmptyStateConfig,
  },
  {
    field: 'total_tokens',
    label: 'Total Tokens',
    format: ',d',
    emptyState: {
      reasons: {
        'upstream-blocked': {
          message: 'Upstream blocked',
          cta: 'Projection not yet emitted',
        },
      } as EmptyStateConfig['reasons'],
    } as EmptyStateConfig,
  },
];

export default function CostSummaryAdapter(_config: CostSummaryConfig) {
  const { data, isLoading, error } = useProjectionQuery<Record<string, unknown>>({
    queryKey: ['cost-summary', TOPICS.costSummary],
    topic: TOPICS.costSummary,
  });

  return (
    <ComponentWrapper title="Cost Summary" isLoading={isLoading} error={error}>
      <KPITileClusterThreeJs
        projectionData={data ?? []}
        tiles={TILES}
        emptyState={CLUSTER_EMPTY_STATE}
      />
    </ComponentWrapper>
  );
}
