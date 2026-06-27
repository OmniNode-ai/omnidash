import { useMemo } from 'react';
import { Text } from '@/components/ui/typography';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { useFrameStore } from '@/store/store';
import { TOPICS } from '@shared/types/topics';
import { formatUsd, formatPct, formatLatency } from '../lib/format';
import { tierFromCostTier } from '../lib/tier';
import type { DelegationSavingsProjection, DelegationDecisionRow } from '../types';

/**
 * The supporting stat row beneath the hero: actual spend (savings projection),
 * premium-tier share (authoritative cost_tier_name on decisions.v1, OMN-13649),
 * and mean response latency (savings sessions). No "vs previous period" deltas —
 * the projections take no window/compare params today, so we don't show
 * comparisons we can't compute.
 */
export function SupportingStatsSection() {
  const setActivePage = useFrameStore((s) => s.setActivePage);
  const { data: savingsData } = useProjectionQuery<DelegationSavingsProjection>({
    queryKey: ['dashboard', 'savings'],
    topic: TOPICS.delegationSavings,
  });
  const { data: decisionsData } = useProjectionQuery<DelegationDecisionRow>({
    queryKey: ['dashboard', 'decisions'],
    topic: TOPICS.delegationDecisions,
  });
  const savings = savingsData?.[0];
  const decisions = decisionsData;

  const stats = useMemo(() => {
    if (!savings || !decisions) return null;
    const sessions = savings.sessions;
    const avgLatencyMs = sessions.length
      ? sessions.reduce((sum, s) => sum + s.latency_ms, 0) / sessions.length
      : null;
    const total = decisions.length;
    const premiumCount = decisions.filter(
      (d) => tierFromCostTier(d.cost_tier_name) === 'premium',
    ).length;
    return {
      actualSpend: savings.cumulative_local_cost_usd,
      premiumShare: total > 0 ? premiumCount / total : 0,
      avgLatencyMs,
    };
  }, [savings, decisions]);

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
