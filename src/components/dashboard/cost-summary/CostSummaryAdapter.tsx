// Bridge between ComponentCell (config-prop API) and IKPITileClusterAdapter (projectionData API).
// Fetches costSummary projection, delegates to KPITileClusterThreeJs with three metric tiles.
// Upstream-blocked: projection table does not exist yet; widget renders upstream-blocked empty state.
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import type { EmptyStateConfig } from '@shared/types/chart-config';
import { KPITileClusterThreeJs } from '@/components/charts/threejs/KPITileCluster';
import { Text } from '@/components/ui/typography';

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
    label: 'Cloud Cost Avoided',
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
    label: 'Tokens Routed Locally',
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

function UsageSourceBadge({ source }: { source: string | undefined }) {
  if (!source) return null;
  const isMeasured = source === 'MEASURED';
  const color = isMeasured ? 'var(--status-ok)' : 'var(--status-warn)';
  const textClass = isMeasured ? 'usage-source-badge-text--ok' : 'usage-source-badge-text--warn';
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 8px',
        borderRadius: 10,
        border: `1px solid ${color}`,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
        }}
      />
      <Text size="xs" family="mono" weight="semibold" className={textClass}>
        {source}
      </Text>
    </div>
  );
}

export default function CostSummaryAdapter(_config: CostSummaryConfig) {
  const { data, isLoading, error } = useProjectionQuery<Record<string, unknown>>({
    queryKey: ['cost-summary', TOPICS.costSummary],
    topic: TOPICS.costSummary,
  });

  const firstRow = data?.[0];
  const usageSource = typeof firstRow?.usage_source === 'string' ? firstRow.usage_source : undefined;

  return (
    <ComponentWrapper
      title="Cost Summary"
      isLoading={isLoading}
      error={error}
      headerExtra={<UsageSourceBadge source={usageSource} />}
    >
      <KPITileClusterThreeJs
        projectionData={data ?? []}
        tiles={TILES}
        emptyState={CLUSTER_EMPTY_STATE}
      />
    </ComponentWrapper>
  );
}
