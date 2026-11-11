import { useMemo } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { Text } from '@/components/ui/typography';
import { fixed as fmtFixed } from '@/theme/format';
import { refreshInterval } from '@/theme/refresh';
// OMN-23330 AC25: this file's fixed inline styles are classes in IntentDistributionWidget.static.css.
import './IntentDistributionWidget.static.css';

// Raw projection row (onex.snapshot.projection.intent-classification.v1);
// grouping happens client-side per the node_projection_intent_classification
// contract ("filtered/grouped client-side"). OMN-14751.
interface IntentEventRow {
  intent_id: string;
  session_ref: string;
  intent_category: string;
  confidence: number;
  agent_source: 'claude' | 'cursor' | null;
  created_at: string;
}

interface IntentBucket {
  intent_category: string;
  count: number;
  percentage: number;
  bySource: Record<string, number>;
}

const CATEGORY_COLORS: Record<string, string> = {
  debugging: 'var(--ds-kind-effect)',
  code_generation: 'var(--ds-kind-reducer)',
  refactoring: 'var(--ds-kind-orchestrator)',
  testing: 'var(--ds-ok)',
  documentation: 'var(--ds-ink-3)',
  analysis: 'var(--ds-brand)',
  code_review: 'var(--ds-bad)',
  deployment: 'var(--ds-warn)',
  unknown: 'var(--ds-ink-4)',
};

function colorForCategory(category: string): string {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS.unknown;
}

function formatCategory(category: string): string {
  return category.replace(/_/g, ' ');
}

export default function IntentDistributionWidget() {
  const { data, isLoading, error } = useProjectionQuery<IntentEventRow>({
    topic: TOPICS.intentClassification,
    queryKey: ['intent-distribution'],
    refetchInterval: refreshInterval(),
  });

  const sorted = useMemo<IntentBucket[]>(() => {
    if (!data || data.length === 0) return [];
    const buckets = new Map<string, IntentBucket>();
    for (const row of data) {
      const key = row.intent_category || 'unknown';
      const bucket = buckets.get(key) ?? {
        intent_category: key,
        count: 0,
        percentage: 0,
        bySource: {},
      };
      bucket.count += 1;
      const source = row.agent_source ?? 'unknown';
      bucket.bySource[source] = (bucket.bySource[source] ?? 0) + 1;
      buckets.set(key, bucket);
    }
    const total = data.length;
    return [...buckets.values()]
      .map((b) => ({ ...b, percentage: (b.count / total) * 100 }))
      .sort((a, b) => b.count - a.count);
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
      <div className="intent-distribution-widget-s9808a2">
        {sorted.map((row) => {
          const color = colorForCategory(row.intent_category);
          const widthPct = (row.count / maxCount) * 100;
          return (
            <div className="intent-distribution-widget-s3088da"
              key={row.intent_category}
              data-testid="intent-row"
            >
              <div className="intent-distribution-widget-s2f671a">
                <span className="eyebrow intent-distribution-widget-sc331ff" title={row.intent_category}>
                  {formatCategory(row.intent_category)}
                </span>
              </div>
              <div className="intent-distribution-widget-s472dc9"
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
                <div className="intent-distribution-widget-sfa8c3a"
                >
                  <Text size="sm" weight="semibold" style={{ color: widthPct > 30 ? 'var(--ds-page)' : 'var(--ds-ink)' }}>
                    {fmtFixed(row.percentage, 1)}%
                  </Text>
                </div>
              </div>
              <div className="intent-distribution-widget-sc074c2">
                <span
                  className="mono tnum intent-distribution-widget-sc331ff"
                  title={Object.entries(row.bySource)
                    .map(([source, n]) => `${source}: ${n}`)
                    .join(', ')}
                >
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
