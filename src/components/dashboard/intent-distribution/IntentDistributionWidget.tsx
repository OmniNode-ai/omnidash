import { useMemo } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { Text } from '@/components/ui/typography';

interface IntentRow {
  intent_category: string;
  count: number;
  percentage: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  debugging: 'var(--effect)',
  code_generation: 'var(--reducer)',
  refactoring: 'var(--orchestrator)',
  testing: 'var(--good)',
  documentation: 'var(--ink-3)',
  analysis: 'var(--accent)',
  code_review: 'var(--bad)',
  deployment: 'var(--warn)',
  unknown: 'var(--ink-4)',
};

function colorForCategory(category: string): string {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS.unknown;
}

function formatCategory(category: string): string {
  return category.replace(/_/g, ' ');
}

export default function IntentDistributionWidget() {
  const { data, isLoading, error } = useProjectionQuery<IntentRow>({
    topic: TOPICS.intentClassification,
    queryKey: ['intent-distribution'],
    refetchInterval: 30_000,
  });

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) => b.count - a.count);
  }, [data]);

  const maxCount = useMemo(() => {
    if (sorted.length === 0) return 1;
    return Math.max(...sorted.map((r) => r.count), 1);
  }, [sorted]);

  const isEmpty = sorted.length === 0 && !isLoading;

  return (
    <ComponentWrapper
      title="Intent Distribution"
      isLoading={isLoading}
      error={error ?? undefined}
      isEmpty={isEmpty}
      emptyMessage="No intent data"
      emptyHint="Intent classification data appears after session analysis runs"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sorted.map((row) => {
          const color = colorForCategory(row.intent_category);
          const widthPct = (row.count / maxCount) * 100;
          return (
            <div
              key={row.intent_category}
              data-testid="intent-row"
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <div style={{ width: 120, flexShrink: 0 }}>
                <span className="eyebrow" style={{ color: 'var(--ink-2)' }} title={row.intent_category}>
                  {formatCategory(row.intent_category)}
                </span>
              </div>
              <div
                style={{
                  flex: 1,
                  height: 22,
                  background: 'var(--bg-sunken)',
                  borderRadius: 4,
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    width: `${widthPct}%`,
                    height: '100%',
                    background: color,
                    borderRadius: 4,
                    transition: 'width 0.3s ease',
                    minWidth: widthPct > 0 ? 2 : 0,
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: 6,
                  }}
                >
                  <Text size="sm" weight="semibold" style={{ color: widthPct > 30 ? '#fff' : 'var(--ink)' }}>
                    {row.percentage.toFixed(1)}%
                  </Text>
                </div>
              </div>
              <div style={{ width: 48, textAlign: 'right', flexShrink: 0 }}>
                <span className="mono tnum" style={{ color: 'var(--ink-2)' }}>
                  {row.count}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </ComponentWrapper>
  );
}
