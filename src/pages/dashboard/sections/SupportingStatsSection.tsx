import { useMemo } from 'react';
import { Text } from '@/components/ui/typography';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { useFrameStore } from '@/store/store';
import { TOPICS } from '@shared/types/topics';
import { formatUsd, formatPct, formatLatency } from '../lib/format';
import { tierForModel } from '../lib/modelTier';
import type { DelegationSavingsProjection, ModelRoutingProjection } from '../types';

/**
 * The supporting stat row beneath the hero: actual spend (savings projection),
 * premium-tier share (model-routing → tier derivation), and mean response latency
 * (savings sessions). No "vs previous period" deltas — the projections take no
 * window/compare params today, so we don't show comparisons we can't compute.
 */
export function SupportingStatsSection() {
  const setActivePage = useFrameStore((s) => s.setActivePage);
  const { data: savingsData } = useProjectionQuery<DelegationSavingsProjection>({
    queryKey: ['dashboard', 'savings'],
    topic: TOPICS.delegationSavings,
  });
  const { data: routingData } = useProjectionQuery<ModelRoutingProjection>({
    queryKey: ['dashboard', 'model-routing'],
    topic: TOPICS.delegationModelRouting,
  });
  const savings = savingsData?.[0];
  const routing = routingData?.[0];

  const stats = useMemo(() => {
    if (!savings || !routing) return null;
    const sessions = savings.sessions;
    const avgLatencyMs = sessions.length
      ? sessions.reduce((sum, s) => sum + s.latency_ms, 0) / sessions.length
      : null;
    const total = routing.by_model.reduce((sum, m) => sum + m.count, 0);
    const premiumCount = routing.by_model
      .filter((m) => tierForModel(m.model_name) === 'premium')
      .reduce((sum, m) => sum + m.count, 0);
    return {
      actualSpend: savings.cumulative_local_cost_usd,
      premiumShare: total > 0 ? premiumCount / total : 0,
      avgLatencyMs,
    };
  }, [savings, routing]);

  return (
    <div className="sd-stats-block">
      <Text as="div" size="lg" color="secondary" className="sd-source-line">
        Savings come from routing work to cheaper tiers.
      </Text>
      {stats && (
        <div className="sd-stats">
          <button type="button" className="sd-stat" onClick={() => setActivePage('tasks')}>
            <Text as="div" size="xs" color="tertiary" transform="uppercase" weight="semibold">Actual spend</Text>
            <div className="sd-stat-val">{formatUsd(stats.actualSpend)}</div>
          </button>
          <button type="button" className="sd-stat" onClick={() => setActivePage('tasks', { tasksTier: 'premium' })}>
            <Text as="div" size="xs" color="tertiary" transform="uppercase" weight="semibold">Premium-tier share</Text>
            <div className="sd-stat-val">{formatPct(stats.premiumShare)}</div>
          </button>
          <button type="button" className="sd-stat" onClick={() => setActivePage('tasks')}>
            <Text as="div" size="xs" color="tertiary" transform="uppercase" weight="semibold">Response latency</Text>
            <div className="sd-stat-val">{formatLatency(stats.avgLatencyMs)}</div>
          </button>
        </div>
      )}
    </div>
  );
}
