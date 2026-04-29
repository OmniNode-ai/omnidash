// Bridge between ComponentCell (config-prop API) and ITrendChartAdapter (projectionData API).
// Fetches costTokenUsage projection, delegates to TrendChartThreeJs with bucket_time → total_tokens mapping.
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import type { TrendChartFieldMapping, EmptyStateConfig } from '@shared/types/chart-config';
import type { ProjectionOrderingAuthority } from '@shared/types/component-manifest';
import { TrendChartThreeJs } from '@/components/charts/threejs/TrendChart';

type TokenUsageConfig = Record<string, never>;

const ORDERING_AUTHORITY: ProjectionOrderingAuthority = {
  authority: 'bucket_time',
  fieldName: 'bucket_time',
  direction: 'asc',
  clockSemantics: 'UTC',
};

const EMPTY_STATE: EmptyStateConfig = {
  reasons: {
    'no-data': {
      message: 'No token usage data available',
      cta: 'Token usage appears after LLM calls are tracked.',
    },
    'upstream-blocked': {
      message: 'Token usage projection upstream blocked',
      cta: 'Check omnimarket emitter status.',
    },
  },
  defaultMessage: 'No token usage data available',
};

const FIELD_MAPPINGS: TrendChartFieldMapping = {
  x: 'bucket_time',
  y: 'total_tokens',
  granularity: 'hour',
};

export default function TokenUsageAdapter(_config: TokenUsageConfig) {
  const { data, isLoading, error } = useProjectionQuery<Record<string, unknown>>({
    queryKey: ['token-usage', TOPICS.costTokenUsage],
    topic: TOPICS.costTokenUsage,
  });

  return (
    <ComponentWrapper title="Token Usage" isLoading={isLoading} error={error}>
      <TrendChartThreeJs
        projectionData={data ?? []}
        fieldMappings={FIELD_MAPPINGS}
        orderingAuthority={ORDERING_AUTHORITY}
        emptyState={EMPTY_STATE}
      />
    </ComponentWrapper>
  );
}
