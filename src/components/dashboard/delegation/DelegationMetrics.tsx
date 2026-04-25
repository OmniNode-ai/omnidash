import { useMemo } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { Text } from '@/components/ui/typography';
import { DoughnutChart, type DoughnutSlice } from './DoughnutChart';

export interface DelegationSummary {
  totalDelegations: number;
  qualityGatePassRate: number;
  totalSavingsUsd: number;
  byTaskType: Array<{ taskType: string; count: number }>;
}

export default function DelegationMetrics({ config }: { config: Record<string, unknown> }) {
  // Each `show*` flag defaults to true so existing dashboards (whose
  // configs pre-date the wiring) keep their full stat layout.
  const showSavings = config.showSavings !== false;
  const showQualityGates = config.showQualityGates !== false;

  const { data: dataArr, isLoading, error } = useProjectionQuery<DelegationSummary>({
    topic: TOPICS.delegationSummary,
    queryKey: ['delegation-summary'],
    refetchInterval: 60_000,
  });
  const data = dataArr?.[0];

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
        <div style={{ display: 'flex', gap: '1rem', height: '100%' }}>
          <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.5rem 0' }}>
            <div>
              <Text as="div" size="4xl" weight="bold" color="primary">{data.totalDelegations}</Text>
              <Text as="div" size="md" color="primary">Total Delegations</Text>
            </div>
            {showQualityGates && (
              <div>
                {/* 0.8 (80%) is hardcoded product policy — should eventually be configurable via component config */}
                <Text as="div" size="4xl" weight="bold" color={data.qualityGatePassRate >= 0.8 ? 'ok' : 'warn'}>
                  {Math.round(data.qualityGatePassRate * 100)}%
                </Text>
                <Text as="div" size="md" color="primary">Quality Gate Pass Rate</Text>
              </div>
            )}
            {showSavings && (
              <div>
                <Text as="div" size="4xl" weight="bold" color="primary">${data.totalSavingsUsd.toFixed(2)}</Text>
                <Text as="div" size="md" color="primary">Cost Savings</Text>
              </div>
            )}
          </div>
          <div style={{ flex: 1, minHeight: '150px' }}>
            <DoughnutChart slices={slices} height={260} />
          </div>
        </div>
      )}
    </ComponentWrapper>
  );
}
