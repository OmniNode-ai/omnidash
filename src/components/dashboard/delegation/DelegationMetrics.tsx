import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useComponentData } from '@/hooks/useComponentData';
import { useThemeColors } from '@/theme';

interface DelegationSummary {
  totalDelegations: number;
  qualityGatePassRate: number;
  totalSavingsUsd: number;
  byTaskType: Array<{ taskType: string; count: number }>;
}

export default function DelegationMetrics({ config }: { config: Record<string, unknown> }) {
  const { data, isLoading, error } = useComponentData<DelegationSummary>(
    '/api/delegation/summary',
    { queryKey: ['delegation-summary'], refetchInterval: 60_000 }
  );
  const colors = useThemeColors();

  const chartOption = useMemo(() => {
    if (!data || data.byTaskType.length === 0) return null;
    return {
      tooltip: { trigger: 'item' as const },
      series: [{
        type: 'pie' as const,
        radius: ['40%', '70%'],
        data: data.byTaskType.map((t, i) => ({
          name: t.taskType,
          value: t.count,
          itemStyle: { color: colors.chart[i % colors.chart.length] },
        })),
        label: { color: colors.foreground, fontSize: 11 },
      }],
      backgroundColor: 'transparent',
    };
  }, [data, colors]);

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
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: colors.foreground }}>{data.totalDelegations}</div>
              <div style={{ fontSize: '0.6875rem', color: colors.muted }}>Total Delegations</div>
            </div>
            <div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: data.qualityGatePassRate >= 0.8 ? colors.status.healthy : colors.status.warning }}>
                {Math.round(data.qualityGatePassRate * 100)}%
              </div>
              <div style={{ fontSize: '0.6875rem', color: colors.muted }}>Quality Gate Pass Rate</div>
            </div>
            <div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: colors.foreground }}>${data.totalSavingsUsd.toFixed(2)}</div>
              <div style={{ fontSize: '0.6875rem', color: colors.muted }}>Cost Savings</div>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: '150px' }}>
            {chartOption && <ReactECharts option={chartOption} style={{ height: '100%' }} notMerge />}
          </div>
        </div>
      )}
    </ComponentWrapper>
  );
}
