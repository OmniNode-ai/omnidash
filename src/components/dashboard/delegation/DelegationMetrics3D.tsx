import { useMemo } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { Text } from '@/components/ui/typography';
import { DoughnutChart, type DoughnutSlice } from './DoughnutChart';
import { useDelegationRunContextOptional } from '@/components/dashboard/delegation-control-plane/DelegationRunContext';

const DOUGHNUT_PANEL_MAX_WIDTH = 240;
const MODEL_LABEL_MAX_WIDTH = 220;

export interface DelegationSummary {
  totalDelegations: number;
  qualityGatePassRate: number;
  qualityGatePassed: number;
  qualityGateTotal: number;
  totalSavingsUsd: number;
  byTaskType: Array<{ taskType: string; count: number }>;
  byModel: Array<{ model: string; count: number }>;
}

export default function DelegationMetrics({ config }: { config: Record<string, unknown> }) {
  // Each `show*` flag defaults to true so existing dashboards (whose
  // configs pre-date the wiring) keep their full stat layout.
  const showSavings = config.showSavings !== false;
  const showQualityGates = config.showQualityGates !== false;
  // T19 (OMN-160): the gate threshold used to be a hardcoded 0.8.
  // It now comes from manifest config, mirroring quality-score-panel's
  // passThreshold pattern. Pre-existing layouts get the 0.8 default.
  const qualityGateThreshold =
    typeof config.qualityGateThreshold === 'number' ? config.qualityGateThreshold : 0.8;

  const runCtx = useDelegationRunContextOptional();

  const { data: dataArr, isLoading: queryLoading, error: queryError } = useProjectionQuery<DelegationSummary>({
    topic: TOPICS.delegationSummary,
    queryKey: ['delegation-summary'],
    refetchInterval: 60_000,
    enabled: !runCtx,
  });

  const isLoading = runCtx ? runCtx.snapshot.isLoading : queryLoading;
  const error = runCtx ? runCtx.snapshot.primaryError : queryError;
  const data = runCtx ? runCtx.snapshot.summary : (dataArr?.[0] ?? null);

  // Pre-compute slice percentages once so DoughnutChart can stay
  // presentational. Sorted descending by count so the largest slice
  // starts at 12 o'clock — matches CostByModelPie's reading order.
  const slices = useMemo<DoughnutSlice[]>(() => {
    if (!data || data.byTaskType.length === 0) return [];
    const total = data.byTaskType.reduce((acc, t) => acc + t.count, 0);
    if (total === 0) return [];
    return data.byTaskType
      .map((t) => ({
        label: t.taskType,
        value: t.count,
        percentage: (t.count / total) * 100,
      }))
      .sort((a, b) => b.value - a.value);
  }, [data]);

  const isEmpty = !data || data.totalDelegations === 0;

  return (
    <ComponentWrapper
      title="Delegation Metrics"
      isLoading={isLoading}
      error={error ?? undefined}
      isEmpty={isEmpty}
      emptyMessage="No delegation events"
      emptyHint="Delegation events appear when tasks are delegated to agents"
    >
      {data && !isEmpty && (
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', minHeight: 0 }}>
          <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.5rem 0' }}>
            <div>
              <Text as="div" size="4xl" weight="bold" color="primary">{data.totalDelegations}</Text>
              <Text as="div" size="md" color="primary">Total Delegations</Text>
            </div>
            {showQualityGates && (
              <div>
                <Text as="div" size="4xl" weight="bold" color={data.qualityGatePassRate >= qualityGateThreshold ? 'ok' : 'warn'}>
                  {Math.round(data.qualityGatePassRate * 100)}%
                </Text>
                <Text as="div" size="md" color="primary">Quality Gate Pass Rate</Text>
                <Text as="div" size="sm" color="secondary">
                  {data.qualityGatePassed} / {data.qualityGateTotal} passed
                </Text>
              </div>
            )}
            {showSavings && (
              <div>
                <Text as="div" size="4xl" weight="bold" color="primary">${data.totalSavingsUsd.toFixed(2)}</Text>
                <Text as="div" size="md" color="primary">Cost Savings</Text>
              </div>
            )}
          </div>
          <div
            data-testid="delegation-3d-doughnut-panel"
            style={{
              flex: `0 1 ${DOUGHNUT_PANEL_MAX_WIDTH}px`,
              width: '100%',
              maxWidth: DOUGHNUT_PANEL_MAX_WIDTH,
              minHeight: '150px',
              maxHeight: '280px',
              alignSelf: 'flex-start',
              marginLeft: 'auto',
              marginRight: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              overflow: 'hidden',
            }}
          >
            <DoughnutChart slices={slices} height={140} />
            {data.byModel.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', justifyContent: 'center', paddingTop: 4, borderTop: '1px solid var(--line-2)' }}>
                {data.byModel.map((m) => (
                  <Text
                    key={m.model}
                    as="span"
                    size="sm"
                    color="secondary"
                    style={{
                      maxWidth: MODEL_LABEL_MAX_WIDTH,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {m.model} ({m.count})
                  </Text>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </ComponentWrapper>
  );
}
