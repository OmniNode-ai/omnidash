// Bridge between ComponentCell (config-prop API) and IBarChartAdapter (projectionData API).
// Fetches costByRepo projection, delegates to BarChartThreeJs (BarChart) with repo_name → total_cost_usd mapping.
// Upstream-blocked: repo_name column absent from llm_cost_aggregates (migration 031:142).
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import type { EmptyStateConfig } from '@shared/types/chart-config';
import { BarChart } from '@/components/charts/threejs/BarChart';

type CostByRepoConfig = Record<string, never>;

const EMPTY_STATE: EmptyStateConfig = {
  reasons: {
    'no-data': {
      message: 'No cost-by-repo data available',
      cta: 'Cost by repo appears after LLM calls are tracked.',
    },
    'upstream-blocked': {
      message: 'repo_name column not yet available (migration 031:142)',
      cta: 'Widget becomes active once upstream adds repo_name to the projection.',
    },
    'missing-field': {
      message: 'repo_name field missing from projection',
      cta: 'Upstream migration 031:142 required.',
    },
  },
  defaultMessage: 'No cost-by-repo data available',
};

export default function CostByRepoAdapter(_config: CostByRepoConfig) {
  const { data, isLoading, error } = useProjectionQuery<Record<string, unknown>>({
    queryKey: ['cost-by-repo', TOPICS.costByRepo],
    topic: TOPICS.costByRepo,
  });

  return (
    <ComponentWrapper title="Cost by Repo" isLoading={isLoading} error={error}>
      <BarChart
        projectionData={data ?? []}
        fieldMappings={{ x: 'repo_name', y: 'total_cost_usd' }}
        emptyState={EMPTY_STATE}
      />
    </ComponentWrapper>
  );
}
